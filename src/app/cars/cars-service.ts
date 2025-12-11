import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, Subject, of } from 'rxjs'; 
import { shareReplay, switchMap, startWith } from 'rxjs/operators';
import { map } from 'rxjs/operators';
import { CarsModule } from './cars-module';
import { CarsModel } from '../../interfaces/car-interface';
import { User } from '../../interfaces/user-interface';
import { Rental, RentalPayload } from '../../interfaces/rental-interface';
import { PhotoUploadResponse } from '../../interfaces/modal-result-interface';
import { AuthService } from '../auth/auth-service';

@Injectable({
  providedIn: 'root',
})
export class CarsService {
  private apiUrl = 'http://localhost:3000/car';
  private rentApiUrl = 'http://localhost:3000/rent';
  private authApiUrl = 'http://localhost:3000/auth';
  
  public imgBase = 'http://localhost:3000/img';
  private imageVersion = Date.now();  
  constructor(private http: HttpClient, private auth: AuthService) {
  }

  private getHttpOptions(): { headers?: HttpHeaders } {
    const token = this.auth?.getToken ? this.auth.getToken() : null;
    if (token) {
      return { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) };
    }
    return {};
  }

  private rowsPerPage = 15;
  private currentPage = 1;

  // Always fetch fresh data from the server. No caching.
  getCars(): Observable<CarsModel[]> {
    const options = this.getHttpOptions();
    return this.http.get<CarsModel[]>(this.apiUrl, options);
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
    
    return this.http.post<string>(url, car, { responseType: 'text' as 'json' }).pipe(
      map((res) => String(res)),
    );
  }
  
  searchCars(criteria: Partial<CarsModel> & {
    minPrice?: number;
    maxPrice?: number;
    startDate?: string;
    endDate?: string;
  }): Observable<CarsModel[] | string> {
    const url = `${this.apiUrl}/search`;
    
    return this.http.post<string>(url, criteria, { ...this.getHttpOptions(), responseType: 'text' as 'json' }).pipe(
      map((txt) => {
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
    return this.http.patch<CarsModel>(url, car, this.getHttpOptions());
  }
  delCar(id: number): Observable<CarsModule> {
    const url = `${this.apiUrl}/${id}`;
    return this.http.delete(url, this.getHttpOptions());
  }
  
  uploadCarPhoto(fileData: FormData): Observable<{ filename: string; path: string }> {
    return this.http.post<{ filename: string; path: string }>('http://localhost:3000/upload', fileData, this.getHttpOptions());
  }

  
  uploadCarPhotoForCar(id: number, fileData: FormData): Observable<PhotoUploadResponse> {
    const url = `http://localhost:3000/upload/car/${id}`;
    return this.http.post<PhotoUploadResponse>(url, fileData, this.getHttpOptions());
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
  getRentalsForCar(carId: number): Observable<Rental[]> {
    return this.http.get<Rental[]>(`${this.rentApiUrl}/car/${carId}`, this.getHttpOptions());
  }

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.authApiUrl}/users`, this.getHttpOptions());
  }

  getUser(id: number): Observable<User> {
    return this.http.get<User>(`${this.authApiUrl}/user/${id}`, this.getHttpOptions());
  }

  // addRental(payload: { carId: number; startDate: string; endDate: string }): Observable<Rental> {
  // add a rental for a car
  addRental(payload: { carId: number; startDate: string; endDate: string }): Observable<Rental> {
    const body: RentalPayload & { userId?: number } = { startDate: payload.startDate, endDate: payload.endDate };
    // if authentication is present, backend may associate user by token; we don't attach user here
    return this.http.post<Rental>(`${this.rentApiUrl}/car/${payload.carId}`, body);
  }

  updateRental(rentalId: number, payload: { startDate: string; endDate: string }): Observable<Rental> {
    return this.http.patch<Rental>(`${this.rentApiUrl}/${rentalId}`, payload);
  }

  deleteRental(rentalId: number): Observable<void> {
    return this.http.delete<void>(`${this.rentApiUrl}/${rentalId}`);
  }
}