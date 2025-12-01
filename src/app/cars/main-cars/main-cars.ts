import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CarsService } from '../cars-service';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, finalize, filter, takeUntil } from 'rxjs/operators';
import { NavigationEnd } from '@angular/router';
import { AddModCar } from '../add-mod-car/add-mod-car';
import { lastValueFrom } from 'rxjs';



@Component({
  selector: 'app-main-cars',
  standalone: false,
  templateUrl: './main-cars.html',
  styleUrls: ['./main-cars.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainCars implements OnInit, OnDestroy {
  protected cars: any[] = [];
  protected pagedCars: any[] = [];  
  
  rowsPerPage = 9;
  currentPage = 1;
  
  protected searchForm!: FormGroup;
  protected isSearching = false;
  private ignoreRouteChange = false;
  private destroy$ = new Subject<void>();
  private hasLoadedCars = false;
  private lastQueryParamsSignature: string | null = null;
  
  protected sortOption: string = 'relevance';
  protected nextSort: string = 'name.desc';
  
  isLoading = true;
  error: string | null = null;
  constructor(
    public carsService: CarsService,
    private readonly modalService: NgbModal,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly fb: FormBuilder
    ,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    
    this.searchForm = this.fb.group({
      brand: [''],
      model: [''],
      minPrice: [null],
      maxPrice: [null],
      sort: [this.sortOption]
    });

    this.searchForm.valueChanges.pipe(
      debounceTime(350),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      switchMap((value) => {
        const { criteria, hasCriteria, queryParams } = this.normalizeSearchValue(value);
        this.navigateSetQueryParams(queryParams);
        this.currentPage = queryParams.page ?? this.currentPage;
        if (!hasCriteria) {
          return of(null);
        }
        return this.executeCriteriaSearch(criteria);
      }),
      takeUntil(this.destroy$)
    ).subscribe((res) => {
      this.handleSearchResponse(res);
    });
    
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      if (this.ignoreRouteChange) {
        return;
      }
      const page = Number(params['page'] ?? 1) || 1;
      this.currentPage = page;
      
      const brand = params['brand'] ?? '';
      const model = params['model'] ?? '';
      const minPrice = params['minPrice'] != null ? Number(params['minPrice']) : null;
      const maxPrice = params['maxPrice'] != null ? Number(params['maxPrice']) : null;
      this.searchForm.patchValue({ brand, model, minPrice, maxPrice }, { emitEvent: false });
      
      this.sortOption = params['sort'] ?? this.sortOption;
      
      this.searchForm.patchValue({ sort: this.sortOption }, { emitEvent: false });
      
      if (this.cars?.length) {
        this.applySort();
        this.paginate();
        this.cdr.markForCheck();
      }
      
      const { criteria, hasCriteria } = this.normalizeSearchValue(this.searchForm.value);
      if (hasCriteria) {
        this.executeCriteriaSearch(criteria).subscribe((res) => this.handleSearchResponse(res));
      } else if (!this.hasLoadedCars) {
        this.getCars();
      } else {
        this.applySort();
        this.paginate();
        this.cdr.markForCheck();
      }
    });

    
    const sortControl = this.searchForm.get('sort');
    if (sortControl) {
      sortControl.valueChanges.pipe(distinctUntilChanged(), takeUntil(this.destroy$)).subscribe((val: any) => {
        if (!val) return;
        this.sortOption = val;
        this.changeSort(val);
      });
    }

    // Refresh cars list when navigating back to this route (so changes done in other routes reflect here)
    this.router.events
      .pipe(filter((ev: any) => ev instanceof NavigationEnd), takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.router.url.includes('/main-cars')) {
          this.carsService.refreshCarsCache();
          this.getCars();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getCars(): void {
    this.carsService.getCars().subscribe({
      next: data => {
        
        this.cars = (data || []).map((c: any) => ({ ...c, _isImageLoading: !!c?.photo }));
        this.hasLoadedCars = true;
        this.applySort();
        this.error = null;
        this.paginate();
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.error = 'Error while fetching cars';
        this.isLoading = false;
      }
    });
  }

  search(): void {
    const { queryParams } = this.normalizeSearchValue(this.searchForm.value);
    this.currentPage = 1;
    this.navigateSetQueryParams(queryParams);
  }

  clearSearch(): void {
    this.searchForm.reset({ brand: '', model: '', minPrice: null, maxPrice: null });
    this.error = null;
    this.isSearching = false;
    
    this.getCars();
    this.navigateSetQueryParams({ page: 1, brand: null, model: null, minPrice: null, maxPrice: null });
  }

  
  changeSort(option?: string): void {
    if (option) this.sortOption = option;
    
    if (this.sortOption === 'relevance') this.nextSort = 'name.asc';
    else if (this.sortOption === 'name.asc') this.nextSort = 'name.desc';
    else if (this.sortOption === 'name.desc') this.nextSort = 'price.asc';
    else if (this.sortOption === 'price.asc') this.nextSort = 'price.desc';
    else if (this.sortOption === 'price.desc') this.nextSort = 'relevance';
    else this.nextSort = 'relevance';
    
    this.navigateSetQueryParams({ sort: this.sortOption, page: 1 });
    this.applySort();
    this.paginate();
    this.cdr.markForCheck();
  }

  applySort(): void {
    
    if (this.sortOption === 'relevance') {
      
      const queryVal = (this.searchForm?.value?.brand || '') + ' ' + (this.searchForm?.value?.model || '');
      const query = String(queryVal).trim().toLowerCase();
      if (!query || query.length < 1) {
        
        const na = ((a: any) => ((a.brand || '') + ' ' + (a.model || '')).toString().toLowerCase());
        this.cars = (this.cars || []).slice().sort((a: any, b: any) => na(a).localeCompare(na(b)));
        this.cdr.markForCheck();
        return;
      }
      
      const computeScore = (car: any) => {
        const name = ((car.brand || '') + ' ' + (car.model || '')).toString().toLowerCase();
        
        const lcs = this.lcsLength(query, name);
        return lcs / Math.max(query.length, 1);
      };
      this.cars = (this.cars || []).slice().sort((a, b) => {
        const sa = computeScore(a);
        const sb = computeScore(b);
        if (sa !== sb) return sb - sa;
        
        const na = ((a.brand || '') + ' ' + (a.model || '')).toLowerCase();
        const nb = ((b.brand || '') + ' ' + (b.model || '')).toLowerCase();
        return na.localeCompare(nb);
      });
      return;
    }
    const [field, dir] = (this.sortOption || 'price.asc').split('.');
    const dirVal = dir === 'asc' ? 1 : -1;
    this.cars = (this.cars || []).slice().sort((a, b) => {
      if (!a || !b) return 0;
      if (field === 'price') {
        const pa = Number(a.price) || 0;
        const pb = Number(b.price) || 0;
        return (pa - pb) * dirVal;
      }
      
      const na = (a.brand + ' ' + (a.model || '')).toString().toLowerCase();
      const nb = (b.brand + ' ' + (b.model || '')).toString().toLowerCase();
      if (na < nb) return -1 * dirVal;
      if (na > nb) return 1 * dirVal;
      return 0;
    });
    this.cdr.markForCheck();
  }

  private lcsLength(a: string, b: string): number {
    
    if (!a || !b) return 0;
    const m = a.length, n = b.length;
    
    let prev = new Array(n + 1).fill(0);
    let curr = new Array(n + 1).fill(0);
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) curr[j] = prev[j - 1] + 1;
        else curr[j] = Math.max(prev[j], curr[j - 1]);
      }
      
      const tmp = prev; prev = curr; curr = tmp;
    }
    return prev[n];
  }
  openModal(action?: string, event?: Event){
    if(action){
      event?.stopPropagation();
    }
    const modalRef = this.modalService.open(AddModCar, {size: 'lg'});
    modalRef.result.then(async (result) => {
      if (!result) return;
      await this.handleModalResult(result as { save: any; file: File | null; isNew?: boolean; isAdd?: boolean });
    }).catch((error) => {
      console.error('Modal closed with error:', error);
      this.cdr.markForCheck();
    });
  }

  private async handleModalResult(result: { save: any; file: File | null; isNew?: boolean; isAdd?: boolean }) {
    const { save, file, isAdd } = result;
    const isNew = (result as any).isNew ?? isAdd ?? false;
    try {
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
          if (!isNew && save.id) {
            const res: any = await lastValueFrom(this.carsService.uploadCarPhotoForCar(save.id, formData));
            save.photo = res.uploaded?.filename || save.photo;
            this.carsService.bumpImageVersion();
          } else {
            const uploadRes: any = await lastValueFrom(this.carsService.uploadCarPhoto(formData));
            save.photo = uploadRes.filename;
            this.carsService.bumpImageVersion();
          }
      }
      if (isNew) {
        
        
        if (!save.brand || !save.model || save.price === null || save.price === undefined || Number.isNaN(Number(save.price))) {
          this.error = 'Podaj poprawną markę, model i cenę';
          this.isSearching = false;
          return;
        }
        
        if (save.price !== null && save.price !== undefined) save.price = Number(save.price);
        this.carsService.addCar(save).subscribe({
          next: (res) => {
            
            
            this.carsService.refreshCarsCache();
            this.getCars();
          },
          error: (err) => {
            console.error('Add car error', err, err.status, err.statusText, err.error);
            // whether err.error is message or object, show string
            this.error = err?.error?.message || (typeof err?.error === 'string' ? err.error : JSON.stringify(err?.error)) || err?.message || 'Add car failed';
          },
        });
      } else {
        if (save.price !== null && save.price !== undefined) save.price = Number(save.price);
        this.carsService.updateCar(save).subscribe({
          next: (res) => {
            // car updated: refreshing list
            this.carsService.refreshCarsCache();
            this.getCars();
          },
          error: (err) => {
            console.error('Update car error', err);
            this.error = err?.error?.message || err?.error || err?.message || 'Update car failed';
          },
        });
      }
    } catch (err) {
      console.error('Error saving car or uploading file', err);
      if ((err as any)?.status === 413) {
        this.error = 'Plik jest za duży. Zmniejsz rozmiar pliku i spróbuj ponownie.';
      }
    }
  }

  paginate(): void {
    // ensure current page is within valid range
    if (this.currentPage > this.totalPages) this.currentPage = Math.max(this.totalPages, 1);
    if (this.currentPage < 1) this.currentPage = 1;
    const start = (this.currentPage - 1) * this.rowsPerPage;
    const end = start + this.rowsPerPage;
    this.pagedCars = this.cars.slice(start, end);
    // no highlightIndex used; center highlighting is via CSS nth-child
  }

  goToPage(page: number): void {
    this.currentPage = page;
    this.paginate();
    // update URL query params so back navigation/navigations preserve page
    this.navigateSetQueryParams({ page: this.currentPage });
  }

  private navigateSetQueryParams(queryParams: any) {
    const signature = this.serializeParams(queryParams);
    if (signature === this.lastQueryParamsSignature) {
      return;
    }
    this.lastQueryParamsSignature = signature;
    this.ignoreRouteChange = true;
    // ensure we always merge query params to keep pagination & filters
    this.router.navigate([], { queryParams, queryParamsHandling: 'merge' }).finally(() => {
      // reset flag regardless of the outcome of navigation
      this.ignoreRouteChange = false;
    });
  }

  private serializeParams(params: Record<string, any>): string {
    const normalized: Record<string, any> = {};
    Object.keys(params || {})
      .sort()
      .forEach((key) => {
        normalized[key] = params[key];
      });
    return JSON.stringify(normalized);
  }

  get totalPages(): number {
    return Math.ceil(this.cars.length / this.rowsPerPage);
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = '/missing-image.webp';
  }

  onCardImageLoad(car: any): void {
    car._isImageLoading = false;
    this.cdr.markForCheck();
    setTimeout(() => { try { this.cdr.detectChanges(); } catch(e) {} });
  }

  onCardImageError(car: any, event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = '/missing-image.webp';
    car._isImageLoading = false;
    this.cdr.markForCheck();
    setTimeout(() => { try { this.cdr.detectChanges(); } catch(e) {} });
  }

  private normalizeSearchValue(value: any): { criteria: any; hasCriteria: boolean; queryParams: any } {
    const criteria: any = {};
    const queryParams: any = { page: 1 };

    const brand = value?.brand?.trim() ?? '';
    const model = value?.model?.trim() ?? '';
    const minPrice = value?.minPrice;
    const maxPrice = value?.maxPrice;

    if (brand.length >= 2) {
      criteria.brand = brand;
      queryParams.brand = brand;
    } else {
      queryParams.brand = null;
    }

    if (model.length >= 2) {
      criteria.model = model;
      queryParams.model = model;
    } else {
      queryParams.model = null;
    }

    if (minPrice !== null && minPrice !== undefined && !Number.isNaN(minPrice)) {
      const normalized = Number(minPrice);
      criteria.minPrice = normalized;
      queryParams.minPrice = normalized;
    } else {
      queryParams.minPrice = null;
    }

    if (maxPrice !== null && maxPrice !== undefined && !Number.isNaN(maxPrice)) {
      const normalized = Number(maxPrice);
      criteria.maxPrice = normalized;
      queryParams.maxPrice = normalized;
    } else {
      queryParams.maxPrice = null;
    }

    return { criteria, hasCriteria: Object.keys(criteria).length > 0, queryParams };
  }

  private executeCriteriaSearch(criteria: any) {
    this.isSearching = true;
    this.cdr.markForCheck();
    return this.carsService.searchCars(criteria).pipe(
      catchError((err) => of({ __error: err })),
      finalize(() => {
        this.isSearching = false;
        this.cdr.markForCheck();
      })
    );
  }

  private handleSearchResponse(res: any): void {
    if (res === null) {
      this.getCars();
      this.isSearching = false;
      return;
    }

    if (res && (res as any).__error) {
      this.error = 'Error while searching cars';
      this.cars = [];
      this.paginate();
      return;
    }

        if (typeof res === 'string') {
      this.cars = [];
      this.error = res;
    } else if (Array.isArray(res) && res.length === 0) {
      this.cars = [];
      this.error = 'Brak wyników';
    } else {
      this.cars = res as any[];
          this.hasLoadedCars = true;
      this.error = null;
    }
    this.applySort();
    this.paginate();
    this.cdr.markForCheck();
  }

  
}