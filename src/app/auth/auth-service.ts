import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, BehaviorSubject } from 'rxjs';

export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  isPermitted: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private baseUrl = 'http://localhost:3000/auth';
  private userKey = 'currentUser';
  private _user$ = new BehaviorSubject<CurrentUser | null>(this.loadUser());

  constructor(private http: HttpClient) {}

  private loadUser(): CurrentUser | null {
    try {
      const raw = localStorage.getItem(this.userKey);
      if (!raw) return null;
      return JSON.parse(raw) as CurrentUser;
    } catch {
      return null;
    }
  }

  private saveUser(user: CurrentUser | null) {
    if (user) localStorage.setItem(this.userKey, JSON.stringify(user));
    else localStorage.removeItem(this.userKey);
    this._user$.next(user);
  }

  get currentUser(): CurrentUser | null {
    return this._user$.value;
  }

  get user$(): Observable<CurrentUser | null> {
    return this._user$.asObservable();
  }

  isLoggedIn(): boolean {
    return !!this.currentUser;
  }

  isPermitted(): boolean {
    return !!this.currentUser && !!this.currentUser.isPermitted;
  }

  login(usernameOrEmail: string, password: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/login`, { usernameOrEmail, password }).pipe(
      tap((response: any) => {
        if (response && typeof response === 'object') {
          // backend returns user without password
          this.saveUser(response as CurrentUser);
        }
      })
    );
  }

  register(username: string, email: string, password: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/register`, { username, email, password }).pipe(
      tap((response: any) => {
        if (response && typeof response === 'object') {
          this.saveUser(response as CurrentUser);
        }
      })
    );
  }

  logout() {
    this.saveUser(null);
  }
}