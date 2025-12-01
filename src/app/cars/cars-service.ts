import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, of } from 'rxjs'; 
import { shareReplay, switchMap, startWith } from 'rxjs/operators';
import { map } from 'rxjs/operators';
import { CarsModule } from './cars-module';
import { CarsModel } from '../../interfaces/car-interface';

@Injectable({
  providedIn: 'root',
})
export class CarsService {
  private apiUrl = 'http://localhost:3000/car';
  private rentApiUrl = 'http://localhost:3000/rent';
  
  public imgBase = 'http://localhost:3000/img';
  private imageVersion = Date.now();
  constructor(private http: HttpClient) {}

  private _refreshCars$ = new Subject<void>();
  private cachedCars$: Observable<CarsModel[]> | null = null;

  private rowsPerPage = 15;
  private currentPage = 1;
  getCars(): Observable<CarsModel[]> {
    
    if (!this.cachedCars$) {
      this.cachedCars$ = this._refreshCars$.pipe(
        startWith(void 0),
        switchMap(() => this.http.get<CarsModel[]>(this.apiUrl)),
        shareReplay({ bufferSize: 1, refCount: true })
      );
    }
    return this.cachedCars$;
  }

  
  refreshCarsCache() {
    this._refreshCars$.next();
  }
  bumpImageVersion() {
    this.imageVersion = Date.now();
  }
  getCar(id: number): Observable<CarsModel> {
    const url = `${this.apiUrl}/id/${id}`;
    return this.http.get<CarsModel>(url);
  }
  addCar(car: CarsModel): Observable<string> { 
    const url = `${this.apiUrl}/add`;
    
    return this.http.post(url, car, { responseType: 'text' as 'json' }).pipe(
      map((res: any) => String(res)),
    );
  }
  
  searchCars(criteria: Partial<CarsModel> & { minPrice?: number; maxPrice?: number }): Observable<CarsModel[] | string> {
    const url = `${this.apiUrl}/search`;
    
    return this.http.post(url, criteria, { responseType: 'text' as 'json' }).pipe(
      map((txt: any) => {
        if (!txt) return 'Brak wyników';
        const body = String(txt);
        
        try {
          const parsed = JSON.parse(body);
          return parsed;
        } catch (err) {
          
          return body;
        }
      })
    );
  }
  updateCar(car: CarsModel): Observable<CarsModel> {
    if (!car.id) {
      throw new Error('Car ID is required for update');
    }
    const url = `${this.apiUrl}/${car.id}`;
    return this.http.patch<CarsModel>(url, car);
  }
  delCar(id: number): Observable<CarsModule> {
    const url = `${this.apiUrl}/${id}`;
    return this.http.delete(url);
  }
  
  uploadCarPhoto(fileData: FormData): Observable<{ filename: string; path: string }> {
    return this.http.post<{ filename: string; path: string }>('http://localhost:3000/upload', fileData);
  }

  
  uploadCarPhotoForCar(id: number, fileData: FormData): Observable<any> {
    const url = `http://localhost:3000/upload/car/${id}`;
    return this.http.post(url, fileData);
  }

  
  getImageUrl(photo?: string | null): string {
    if (!photo) return '/missing-image.webp';
    const trimmed = String(photo).trim();

    if (/^(https?:)?\/\//i.test(trimmed)) {
      return trimmed;
    }

    const ensureVersion = (url: string) => {
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}v=${this.imageVersion}`;
    };

    if (trimmed.startsWith('/')) {
      return ensureVersion(trimmed);
    }

    const normalized = trimmed.replace(/^\/+/, '');
    return ensureVersion(`${this.imgBase}/${normalized}`);
  }

  /* Rentals */
  getRentalsForCar(carId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.rentApiUrl}/car/${carId}`);
  }

  addRental(payload: { carId: number; startDate: string; endDate: string }): Observable<any> {
    return this.http.post(`${this.rentApiUrl}/car/${payload.carId}`, payload);
  }

  updateRental(rentalId: number, payload: { startDate: string; endDate: string }): Observable<any> {
    return this.http.patch(`${this.rentApiUrl}/${rentalId}`, payload);
  }

  deleteRental(rentalId: number): Observable<void> {
    return this.http.delete<void>(`${this.rentApiUrl}/${rentalId}`);
  }
}