import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CarsService } from '../cars-service';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subject, of, lastValueFrom } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  catchError,
  finalize,
  filter,
  takeUntil,
  tap,
} from 'rxjs/operators';
import { AddModCar } from '../add-mod-car/add-mod-car';
import { CarsModel } from '../../../interfaces/car-interface';
import { ModalResult } from '../../../interfaces/modal-result-interface';
import { AuthService } from '../../auth/auth-service';
import { CarView } from '../../../interfaces/main-cars-car-view.interface';
import { QueryParams } from '../../../interfaces/main-cars-query-params.interface';
import { SearchCriteria } from '../../../interfaces/main-cars-search-criteria.interface';
import { SearchFormValue } from '../../../interfaces/main-cars-search-form-value.interface';
import { SearchPayload } from '../../../interfaces/main-cars-search-payload.interface';

class SearchFormManager {
  static create(fb: FormBuilder, initialSort: string): FormGroup {
    return fb.group({
      search: [''],
      minPrice: [null],
      maxPrice: [null],
      startDate: [''],
      startTime: [''],
      endDate: [''],
      endTime: [''],
      sort: [initialSort],
    });
  }
  static ensureDateOrder(form: FormGroup, value: SearchFormValue): void {
    const startIso = this.combineDateTime(value.startDate, value.startTime, 'start');
    const endIso = this.combineDateTime(value.endDate, value.endTime, 'end');
    form.setErrors(
      !(startIso && endIso) || new Date(startIso).getTime() <= new Date(endIso).getTime()
        ? null
        : { dateOrder: 'Data końcowa musi być późniejsza lub równa początkowej' },
    );
  }
  static normalize(value: SearchFormValue): SearchPayload {
    const queryParams: QueryParams = { sort: value.sort || 'relevance' };
    const criteria: SearchCriteria = {};
    const rawSearch = (value.search || '').trim();
    let queryText = '';
    if (rawSearch.length >= 2) {
      queryText = rawSearch.toLowerCase();
      queryParams.search = rawSearch;
      const [brand, ...rest] = rawSearch.split(/\s+/);
      if (brand.length >= 2) criteria.brand = brand;
      const model = rest.join(' ').trim();
      if (model.length >= 2) criteria.model = model;
      if (!criteria.brand && !criteria.model) criteria.brand = rawSearch;
    } else {
      queryParams.search = null;
    }
    const startIso = this.combineDateTime(value.startDate, value.startTime, 'start');
    const endIso = this.combineDateTime(value.endDate, value.endTime, 'end');
    if (startIso && endIso && new Date(startIso) <= new Date(endIso)) {
      criteria.startDate = startIso;
      criteria.endDate = endIso;
      queryParams.startDate = startIso;
      queryParams.endDate = endIso;
    } else {
      queryParams.startDate = null;
      queryParams.endDate = null;
    }
    const min = this.toNumber(value.minPrice);
    const max = this.toNumber(value.maxPrice);
    queryParams.minPrice = min;
    queryParams.maxPrice = max;
    if (min !== null) criteria.minPrice = min;
    if (max !== null) criteria.maxPrice = max;
    return {
      criteria,
      queryParams,
      hasCriteria: Object.keys(criteria).length > 0,
      queryText,
      minPrice: min,
      maxPrice: max,
      sort: queryParams.sort ?? 'relevance',
    };
  }
  static splitDateTime(value?: string | null): { date: string; time: string } {
    if (!value) return { date: '', time: '' };
    const normalized = value.replace(' ', 'T');
    return { date: normalized.substring(0, 10), time: normalized.substring(11, 16) || '' };
  }
  static toNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
  }
  static combineDateTime(
    date?: string | null,
    time?: string | null,
    kind: 'start' | 'end' = 'start',
  ): string | null {
    if (!date) return null;
    const normalizedTime = time && time.trim() ? time : kind === 'end' ? '23:59' : '00:00';
    return `${date}T${normalizedTime}:00.000Z`;
  }
  static equals(prev: SearchFormValue, curr: SearchFormValue): boolean {
    return [
      'search',
      'minPrice',
      'maxPrice',
      'startDate',
      'startTime',
      'endDate',
      'endTime',
      'sort',
    ].every((key) => prev?.[key as keyof SearchFormValue] === curr?.[key as keyof SearchFormValue]);
  }
}

class QueryStateManager {
  private ignore = false;
  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}
  update(queryParams: Record<string, string | number | null | undefined>): void {
    this.ignore = true;
    this.router
      .navigate([], { queryParams, queryParamsHandling: 'merge' })
      .finally(() => (this.ignore = false));
  }
  subscribe(handler: (params: Record<string, any>) => void) {
    return this.route.queryParams.subscribe((params) => {
      if (this.ignore) return;
      handler(params);
    });
  }
}

class CarsCollection {
  private cars: CarView[] = [];
  private filtered: CarView[] = [];
  constructor(private readonly imageLoadCache: Map<number, boolean>) {}

  
  setCars(cars: CarsModel[]): void {
    this.cars = Array.isArray(cars) ? cars.map((car) => this.decorate(car)) : [];
    this.filtered = [];
  }
  clear(): void {
    this.cars = [];
    this.filtered = [];
  }
  all(): CarView[] {
    return this.cars;
  }
  hasData(): boolean {
    return this.cars.length > 0;
  }
  sort(option: string, query: string): void {
    if (!this.cars.length) return;
    const lower = query.trim().toLowerCase();
    if (option === 'relevance') {
      this.cars = [...this.cars].sort((a, b) => {
        const aScore = lower && a._searchName.includes(lower) ? 0 : 1;
        const bScore = lower && b._searchName.includes(lower) ? 0 : 1;
        return aScore !== bScore ? aScore - bScore : a._searchName.localeCompare(b._searchName);
      });
      return;
    }
    const [field, dir] = (option || 'price.asc').split('.');
    const dirVal = dir === 'desc' ? -1 : 1;
    this.cars = [...this.cars].sort((a, b) =>
      field === 'price'
        ? (a._priceNumber - b._priceNumber) * dirVal
        : a._searchName.localeCompare(b._searchName) * dirVal,
    );
  }
  filterByPrice(min: number | null, max: number | null): void {
    if (!this.cars.length || (min === null && max === null)) {
      this.filtered = [];
      return;
    }
    this.filtered = this.cars.filter(
      (car) =>
        (min === null || car._priceNumber >= min) && (max === null || car._priceNumber <= max),
    );
  }
  paginate(page: number, perPage: number): { rows: CarView[]; page: number; totalPages: number } {
    const source = this.filtered.length ? this.filtered : this.cars;
    const totalPages = Math.max(Math.ceil((source.length || 1) / perPage), 1);
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * perPage;
    return { rows: source.slice(start, start + perPage), page: safePage, totalPages };
  }
  totalPages(perPage: number): number {
    const source = this.filtered.length ? this.filtered : this.cars;
    return Math.max(Math.ceil((source.length || 1) / perPage), 1);
  }
  onImageLoad(car: CarView): void {
    car._isImageLoading = false;
    if (car.id) this.imageLoadCache.set(car.id, false);
  }
  onImageError(car: CarView, img: HTMLImageElement): void {
    img.src = '/missing-image.webp';
    this.onImageLoad(car);
  }
  private decorate(car: CarsModel): CarView {
    const name = `${car.brand ?? ''} ${car.model ?? ''}`.trim().toLowerCase();
    return {
      ...car,
      _isImageLoading: this.shouldShowImageLoader(car),
      _searchName: name,
      _priceNumber: Number(car.price) || 0,
    };
  }
  private shouldShowImageLoader(car: CarsModel): boolean {
    if (!car.photo) return false;
    if (!car.id) return true;
    return this.imageLoadCache.get(car.id) !== false;
  }
}

class ModalHandler {
  constructor(
    private readonly modal: NgbModal,
    private readonly service: CarsService,
  ) {}
  async open(): Promise<{ refresh: boolean; error?: string }> {
    try {
      const result = (await this.modal.open(AddModCar, { size: 'lg' }).result) as ModalResult;
      return !result || result.save === false ? { refresh: false } : await this.persist(result);
    } catch (err) {
      console.error('Modal closed with error:', err);
      return { refresh: false };
    }
  }
  private async persist(result: ModalResult): Promise<{ refresh: boolean; error?: string }> {
    const payload = result.save;
    if (!payload) return { refresh: false };
    const isNew = !!(result.isNew ?? result.isAdd);
    try {
      if (!payload.brand || !payload.model) throw new Error('Podaj poprawną markę, model i cenę');
      payload.price = Number(payload.price);
      if (Number.isNaN(payload.price)) throw new Error('Podaj poprawną markę, model i cenę');
      if (result.file) await this.uploadPhoto(payload, result.file, isNew);
      if (isNew) await lastValueFrom(this.service.addCar(payload));
      else await lastValueFrom(this.service.updateCar(payload));
      return { refresh: true };
    } catch (err: any) {
      if (err?.status === 413)
        return {
          refresh: false,
          error: 'Plik jest za duży. Zmniejsz rozmiar pliku i spróbuj ponownie.',
        };
      const httpMessage =
        err instanceof HttpErrorResponse ? err.error?.message || err.error || err.message : null;
      return { refresh: false, error: httpMessage || err?.message || 'Operacja nie powiodła się' };
    }
  }
  private async uploadPhoto(
    payload: CarsModel & { id?: number },
    file: File,
    isNew: boolean,
  ): Promise<void> {
    const data = new FormData();
    data.append('file', file);
    if (!isNew && payload.id) {
      const res = await lastValueFrom(this.service.uploadCarPhotoForCar(payload.id, data));
      payload.photo = res.photoId || payload.photo;
    } else {
      const res = await lastValueFrom(this.service.uploadCarPhoto(data));
      payload.photo = res.filename;
    }
    this.service.bumpImageVersion();
  }
}

@Component({
  selector: 'app-main-cars',
  standalone: false,
  templateUrl: './main-cars.html',
  styleUrls: ['./main-cars.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainCars implements OnInit, OnDestroy {
  readonly rowsPerPage = 9;
  currentPage = 1;
  sortOption = 'relevance';
  nextSort = 'name.desc';
  isLoading = true;
  isSearching = false;
  error: string | null = null;
  protected searchForm: FormGroup;
  protected pagedCars: CarView[] = [];
  private readonly destroy$ = new Subject<void>();
  private readonly imageLoadCache = new Map<number, boolean>();
  private readonly collection = new CarsCollection(this.imageLoadCache);
  private readonly modalHandler: ModalHandler;
  private readonly querySync: QueryStateManager;
  private readonly sortSequence = ['relevance', 'name.asc', 'name.desc', 'price.asc', 'price.desc'];
  private hasLoadedCars = false;
  constructor(
    protected carsService: CarsService,
    private readonly authService: AuthService,
    modalService: NgbModal,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    fb: FormBuilder,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.modalHandler = new ModalHandler(modalService, carsService);
    this.querySync = new QueryStateManager(router, route);
    this.searchForm = SearchFormManager.create(fb, this.sortOption);
  }
  get cars(): CarView[] {
    return this.collection.all();
  }
  get totalPages(): number {
    return this.collection.totalPages(this.rowsPerPage);
  }
  ngOnInit(): void {
    this.authService
      .loginSuccess$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.getCars());
    this.searchForm.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        tap((val) => {
          SearchFormManager.ensureDateOrder(this.searchForm, val as SearchFormValue);
          this.sortOption = (val as SearchFormValue).sort || this.sortOption;
          this.updateNextSort();
        }),
        debounceTime(350),
        distinctUntilChanged(SearchFormManager.equals),
        switchMap((val) => this.handleFormChange(val as SearchFormValue)),
      )
      .subscribe((res) => this.handleSearchResponse(res));
    this.querySync.subscribe((params) => this.onRouteParams(params));
    this.router.events
      .pipe(
        filter((ev): ev is NavigationEnd => ev instanceof NavigationEnd),
        takeUntil(this.destroy$),
      )
      .subscribe(() => {
        if (!this.router.url.includes('/main-cars')) return;
        const payload = SearchFormManager.normalize(this.searchForm.value as SearchFormValue);
        if (!payload.hasCriteria) this.getCars();
      });
    this.getCars();
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  search(): void {
    const payload = SearchFormManager.normalize(this.searchForm.value as SearchFormValue);
    this.currentPage = payload.queryParams.page = 1;
    this.querySync.update(payload.queryParams);
    this.refreshView(payload);
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
    this.currentPage = 1;
    this.querySync.update({
      page: 1,
      search: null,
      minPrice: null,
      maxPrice: null,
      startDate: null,
      endDate: null,
    });
    this.getCars();
  }
  changeSort(option?: string): void {
    if (option) this.searchForm.patchValue({ sort: option });
  }
  goToPage(page: number): void {
    const result = this.collection.paginate(page, this.rowsPerPage);
    this.currentPage = result.page;
    this.pagedCars = result.rows;
    this.querySync.update({ page: this.currentPage });
    document.querySelector('.search-bar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.cdr.markForCheck();
  }
  async openModAddModal(action?: string, event?: Event): Promise<void> {
    if (action) event?.stopPropagation();
    const outcome = await this.modalHandler.open();
    if (outcome.refresh) {
      this.getCars();
      return;
    }

    if (outcome.error) {
      this.error = outcome.error;
      this.cdr.markForCheck();
    }
  }
  onStartTimeChange(): void {
    const value = this.searchForm.value as SearchFormValue;

    if (!value.startDate || !value.endDate || value.startDate !== value.endDate) return;
    if (!value.startTime) return;

    if (!value.endTime || value.endTime < value.startTime) {
      this.searchForm.patchValue({ endTime: value.startTime });
    }
  }
  onCardImageLoad(car: CarView): void {
    this.collection.onImageLoad(car);
    this.cdr.markForCheck();
    this.detectLater();
  }
  onCardImageError(car: CarView, event: Event): void {
    this.collection.onImageError(car, event.target as HTMLImageElement);
    this.cdr.markForCheck();
    this.detectLater();
  }

  private handleFormChange(value: SearchFormValue) {
    if (this.searchForm.errors?.['dateOrder']) {
      this.refreshView(SearchFormManager.normalize(this.searchForm.value as SearchFormValue));
      return of(null);
    }
    const payload = SearchFormManager.normalize(value);
    this.currentPage = payload.queryParams.page = 1;
    this.querySync.update(payload.queryParams);
    this.refreshView(payload);
    if (!payload.hasCriteria) return of(null);
    this.isSearching = true;
    this.cdr.markForCheck();
    return this.carsService.searchCars(payload.criteria).pipe(
      catchError((err) => of({ __error: err })),
      finalize(() => {
        this.isSearching = false;
        this.cdr.markForCheck();
      }),
    );
  }
  private handleSearchResponse(res: any): void {
    if (res === null) return;
    if (res?.__error) {
      this.error = 'Error while searching cars';
      this.collection.clear();
    } else if (typeof res === 'string') {
      this.error = res;
      this.collection.clear();
    } else if (Array.isArray(res) && !res.length) {
      this.error = 'Brak wyników';
      this.collection.clear();
    } else if (Array.isArray(res)) {
      this.collection.setCars(res);
      this.hasLoadedCars = true;
      this.error = null;
    }
    this.refreshView();
  }
  private onRouteParams(params: Record<string, any>): void {
    this.currentPage = Number(params['page'] ?? 1) || 1;
    const startParts = SearchFormManager.splitDateTime(params['startDate']);
    const endParts = SearchFormManager.splitDateTime(params['endDate']);
    const patch = {
      search: params['search'] ?? '',
      minPrice: params['minPrice'] != null ? Number(params['minPrice']) : null,
      maxPrice: params['maxPrice'] != null ? Number(params['maxPrice']) : null,
      startDate: startParts.date,
      startTime: startParts.time,
      endDate: endParts.date,
      endTime: endParts.time,
      sort: params['sort'] ?? this.sortOption,
    };
    this.sortOption = patch.sort;
    this.updateNextSort();
    this.searchForm.patchValue(patch, { emitEvent: false });
    if (this.collection.hasData()) this.refreshView();
    const payload = SearchFormManager.normalize(this.searchForm.value as SearchFormValue);
    if (payload.hasCriteria)
      this.carsService
        .searchCars(payload.criteria)
        .pipe(takeUntil(this.destroy$))
        .subscribe((response) => this.handleSearchResponse(response));
    else if (!this.hasLoadedCars) this.getCars();
    else this.refreshView(payload);
  }
  private getCars(): void {
    this.isLoading = true;
    this.carsService
      .getCars()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.collection.setCars(data);
          this.hasLoadedCars = true;
          this.error = null;
          this.isLoading = false;
          this.refreshView();
        },
        error: (err) => {
          console.error('Failed to load cars', err);
          this.error =
            err instanceof HttpErrorResponse && err.status === 401
              ? 'Nie można wyświetlić samochodów — wymagane zalogowanie'
              : typeof err?.error === 'string'
                ? err.error
                : err?.message || 'Nie udało się pobrać samochodów';
          if (err instanceof HttpErrorResponse && err.status === 401) {
            this.authService.requestLoginPrompt();
          }
          this.isLoading = false;
          this.collection.clear();
          this.pagedCars = [];
          this.cdr.markForCheck();
        },
      });
  }
  private refreshView(payload?: SearchPayload): void {
    const effective =
      payload ?? SearchFormManager.normalize(this.searchForm.value as SearchFormValue);
    this.collection.sort(this.sortOption, effective.queryText);
    this.collection.filterByPrice(effective.minPrice, effective.maxPrice);
    const result = this.collection.paginate(this.currentPage, this.rowsPerPage);
    this.currentPage = result.page;
    this.pagedCars = result.rows;
    this.cdr.markForCheck();
  }
  private detectLater(): void {
    setTimeout(() => {
      try {
        this.cdr.detectChanges();
      } catch {}
    });
  }
  private updateNextSort(): void {
    const current = this.sortSequence.indexOf(this.sortOption);
    this.nextSort = this.sortSequence[(current + 1) % this.sortSequence.length] ?? 'relevance';
  }
}
