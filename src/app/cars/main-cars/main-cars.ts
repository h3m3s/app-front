import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CarsService } from '../cars-service';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, finalize, filter, takeUntil } from 'rxjs/operators';
import { NavigationEnd } from '@angular/router';
import { AddModCar } from '../add-mod-car/add-mod-car';
import { AuthService } from '../../auth/auth-service';
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
  private filteredCars: any[] = [];
  
  rowsPerPage = 9;
  currentPage = 1;
  
  protected searchForm!: FormGroup;
  protected isSearching = false;
  private ignoreRouteChange = false;
  private destroy$ = new Subject<void>();
  private hasLoadedCars = false;
  private lastQueryParamsSignature: string | null = null;
  private readonly imageLoadCache = new Map<number, boolean>();
  private static readonly RANGE_FILTERS = ['minPrice', 'maxPrice'] as const;
  private static readonly SEARCH_CONTROL = 'search';
  
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
  ,
    public auth: AuthService
  ) {}

  ngOnInit() {
    
    this.searchForm = this.fb.group({
      search: [''],
      minPrice: [null],
      maxPrice: [null],
      startDate: [''],
      startTime: [''],
      endDate: [''],
      endTime: [''],
      sort: [this.sortOption]
    });

    // Basic date/time cross-field validation: start <= end
    this.searchForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      const startIso = this.combineDateTime(val?.startDate, val?.startTime, 'start');
      const endIso = this.combineDateTime(val?.endDate, val?.endTime, 'end');
      const hasBoth = !!(startIso && endIso);
      const isOrderValid = !hasBoth || (new Date(startIso!).getTime() <= new Date(endIso!).getTime());
      const errors: Record<string, any> = {};
      if (hasBoth && !isOrderValid) {
        errors['dateOrder'] = 'Data końcowa musi być późniejsza lub równa początkowej';
      }
      // set a form-level error for easier UI checks
      this.searchForm.setErrors(Object.keys(errors).length ? errors : null);
    });

    this.searchForm.valueChanges.pipe(
      debounceTime(350),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      switchMap((value) => {
        const { criteria, hasCriteria, queryParams } = this.normalizeSearchValue(value);
        this.navigateSetQueryParams(queryParams);
        this.currentPage = queryParams.page ?? this.currentPage;
        this.applyClientFilters();
        this.paginate();
        this.cdr.markForCheck();
        // Block search if date order invalid
        if (this.searchForm.errors?.['dateOrder']) {
          return of(null);
        }
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
      
      const startParts = this.splitDateTime(params['startDate']);
      const endParts = this.splitDateTime(params['endDate']);
      const formPatch = {
        search: params['search'] ?? '',
        minPrice: params['minPrice'] != null ? Number(params['minPrice']) : null,
        maxPrice: params['maxPrice'] != null ? Number(params['maxPrice']) : null,
        startDate: startParts.date,
        startTime: startParts.time,
        endDate: endParts.date,
        endTime: endParts.time,
        sort: params['sort'] ?? this.sortOption,
      };
      this.sortOption = formPatch.sort;
      this.searchForm.patchValue(formPatch, { emitEvent: false });
      
      if (this.cars?.length) {
        this.applySort();
        this.applyClientFilters();
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
        this.applyClientFilters();
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
          // Avoid overwriting active search results with the full list.
          const { hasCriteria } = this.normalizeSearchValue(this.searchForm.value);
          if (!hasCriteria) {
            this.carsService.refreshCarsCache();
            this.getCars();
          }
        }
      });
  }

  // Ensure end time adjusts when same-day and earlier than start time
  onStartTimeChange(): void {
    const val = this.searchForm.value;
    const sameDay = !!val.startDate && val.endDate === val.startDate;
    if (sameDay && val.endTime && val.startTime && val.endTime < val.startTime) {
      this.searchForm.patchValue({ endTime: val.startTime }, { emitEvent: true });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getCars(): void {
    this.carsService.getCars().subscribe({
      next: data => {
        
        this.cars = this.decorateCars(data || []);
        this.hasLoadedCars = true;
        this.applySort();
        this.error = null;
        this.applyClientFilters();
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
    this.searchForm.reset({
      search: '',
      minPrice: null,
      maxPrice: null,
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      sort: this.sortOption,
    });
    this.error = null;
    this.isSearching = false;
    
    this.getCars();
    this.navigateSetQueryParams({
      page: 1,
      search: null,
      minPrice: null,
      maxPrice: null,
      startDate: null,
      endDate: null,
    });
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
      
      const queryVal = this.searchForm?.value?.search || '';
      const query = String(queryVal).trim().toLowerCase();
      if (!query || query.length < 1) {
        
        const na = ((a: any) => ((a.brand || '') + ' ' + (a.model || '')).toString().toLowerCase());
        this.cars = (this.cars || []).slice().sort((a: any, b: any) => na(a).localeCompare(na(b)));
        this.applyClientFilters();
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
      this.applyClientFilters();
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
    this.applyClientFilters();
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
      if (!result || (result as any)?.save === false) return;
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
    const source = this.filteredCars.length ? this.filteredCars : this.cars;
    const totalPages = Math.max(Math.ceil((source.length || 0) / this.rowsPerPage), 1);
    if (this.currentPage > totalPages) this.currentPage = totalPages;
    if (this.currentPage < 1) this.currentPage = 1;
    const start = (this.currentPage - 1) * this.rowsPerPage;
    const end = start + this.rowsPerPage;
    this.pagedCars = source.slice(start, end);
    // no highlightIndex used; center highlighting is via CSS nth-child
  }

  goToPage(page: number): void {
    this.currentPage = page;
    this.paginate();
    // update URL query params so back navigation/navigations preserve page
    this.navigateSetQueryParams({ page: this.currentPage });
    // Scroll to search bar
    const searchBar = document.querySelector('.search-bar');
    if (searchBar) {
      searchBar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
    const source = this.filteredCars.length ? this.filteredCars : this.cars;
    const total = source.length || 0;
    return Math.max(Math.ceil(total / this.rowsPerPage), 1);
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = '/missing-image.webp';
  }

  onCardImageLoad(car: any): void {
    car._isImageLoading = false;
    if (car?.id) this.imageLoadCache.set(car.id, false);
    this.cdr.markForCheck();
    setTimeout(() => { try { this.cdr.detectChanges(); } catch(e) {} });
  }

  onCardImageError(car: any, event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = '/missing-image.webp';
    car._isImageLoading = false;
    if (car?.id) this.imageLoadCache.set(car.id, false);
    this.cdr.markForCheck();
    setTimeout(() => { try { this.cdr.detectChanges(); } catch(e) {} });
  }

  private decorateCars(data: any[]): any[] {
    if (!Array.isArray(data)) return [];
    return data.map((car) => ({
      ...car,
      _isImageLoading: this.shouldShowImageLoader(car),
    }));
  }

  private shouldShowImageLoader(car: any): boolean {
    if (!car?.photo) return false;
    if (!car?.id) return true;
    return this.imageLoadCache.get(car.id) !== false;
  }

  private normalizeSearchValue(value: any): { criteria: any; hasCriteria: boolean; queryParams: any } {
    const criteria: Record<string, any> = {};
    const queryParams: Record<string, any> = { page: 1 };

    const searchRaw = typeof value?.[MainCars.SEARCH_CONTROL] === 'string'
      ? value[MainCars.SEARCH_CONTROL].trim()
      : '';
    if (searchRaw.length >= 2) {
      queryParams[MainCars.SEARCH_CONTROL] = searchRaw;
      const [brandCandidate, ...rest] = searchRaw.split(/\s+/);
      if (brandCandidate && brandCandidate.length >= 2) {
        criteria['brand'] = brandCandidate;
      }
      const modelCandidate = rest.join(' ').trim();
      if (modelCandidate.length >= 2) {
        criteria['model'] = modelCandidate;
      }

      if (!criteria['brand'] && !criteria['model']) {
        criteria['brand'] = searchRaw;
      }
    } else {
      queryParams[MainCars.SEARCH_CONTROL] = null;
    }

    const startIso = this.combineDateTime(value?.startDate, value?.startTime, 'start');
    const endIso = this.combineDateTime(value?.endDate, value?.endTime, 'end');
    if (startIso && endIso && new Date(startIso) <= new Date(endIso)) {
      criteria['startDate'] = startIso;
      criteria['endDate'] = endIso;
      queryParams['startDate'] = startIso;
      queryParams['endDate'] = endIso;
    } else {
      queryParams['startDate'] = null;
      queryParams['endDate'] = null;
    }

    MainCars.RANGE_FILTERS.forEach((key) => {
      const raw = value?.[key];
      if (raw === null || raw === undefined || Number.isNaN(raw)) {
        queryParams[key] = null;
        return;
      }
      const normalized = Number(raw);
      criteria[key] = normalized;
      queryParams[key] = normalized;
    });

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
      this.cars = this.decorateCars(res as any[]);
      this.hasLoadedCars = true;
      this.error = null;
    }
    this.applySort();
    this.applyClientFilters();
    this.paginate();
    this.cdr.markForCheck();
  }

  private applyClientFilters(): void {
    const cars = this.cars || [];
    const formValue = this.searchForm?.value || {};
    const min = this.toNumberOrNull(formValue?.minPrice);
    const max = this.toNumberOrNull(formValue?.maxPrice);
    const hasMin = min !== null;
    const hasMax = max !== null;

    if (!hasMin && !hasMax) {
      this.filteredCars = cars.slice();
      return;
    }

    this.filteredCars = cars.filter((car) => {
      const price = Number(car?.price) || 0;
      if (hasMin && price < (min as number)) return false;
      if (hasMax && price > (max as number)) return false;
      return true;
    });
  }

  private toNumberOrNull(value: any): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
  }

  private combineDateTime(date?: string | null, time?: string | null, kind: 'start' | 'end' = 'start'): string | null {
    if (!date) {
      return null;
    }
    const normalizedTime = (time && time.trim().length ? time : kind === 'end' ? '23:59' : '00:00');
    return `${date}T${normalizedTime}:00.000Z`;
  }

  private splitDateTime(value?: string | null): { date: string; time: string } {
    if (!value) {
      return { date: '', time: '' };
    }
    const normalized = value.replace(' ', 'T');
    return {
      date: normalized.substring(0, 10),
      time: normalized.substring(11, 16) || '',
    };
  }
}