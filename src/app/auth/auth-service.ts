import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, tap } from 'rxjs';
import { JwtPayload, jwtDecode } from 'jwt-decode';
@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = 'http://localhost:3000/auth';
  private readonly loginRequiredSubject = new Subject<void>();
  private readonly loginSuccessSubject = new Subject<void>();

  readonly loginRequired$ = this.loginRequiredSubject.asObservable();
  readonly loginSuccess$ = this.loginSuccessSubject.asObservable();
  
  constructor(private http: HttpClient) {}

  login(login: string, password: string): Observable<{ access_token: string }>{
    return this.http.post<{ access_token: string }>(`${this.apiUrl}/login`, { login, password }).pipe(
      tap(response => {
        // store token (do not log full token to console to avoid leaking sensitive data)
        localStorage.setItem('access_token', response.access_token);
        this.loginSuccessSubject.next();
      })
    );
  }
  logout(): void {
    localStorage.removeItem('access_token');
  }
  requestLoginPrompt(): void {
    this.loginRequiredSubject.next();
  }
  getToken(): string | null {
    return localStorage.getItem('access_token');
  }
  isLoggedIn(): boolean {
    const token = this.getToken();
    try{
      const payload = jwtDecode<JwtPayload>(token!);
      if(payload.exp && Date.now() >= payload.exp * 1000) {
        this.logout();
        return false;
      }
      return jwtDecode<JwtPayload>(token!).exp !== undefined;
    }
    catch{
      return false;
    }
  }
  
}
