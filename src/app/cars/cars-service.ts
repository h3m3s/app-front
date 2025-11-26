import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs'; 
import { CarsModule } from './cars-module';

@Injectable({
  providedIn: 'root',
})
export class CarsService {
  private apiUrl = 'http://localhost:3000/car';
  constructor(private http: HttpClient) {}

  private rowsPerPage = 15;
  private currentPage = 1;
  getCars(): Observable<CarsModule[]> {
    return this.http.get<CarsModule[]>(this.apiUrl);
  }
  getCar(id: number): Observable<CarsModule> {
    const url = `${this.apiUrl}/id/${id}`;
    return this.http.get<CarsModule>(url);
  }
  delCar(id: number): Observable<CarsModule> {
    const url = `${this.apiUrl}/${id}`;
    return this.http.delete(url);
  }
}