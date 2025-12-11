import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuthService } from './auth-service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private auth: AuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.auth?.getToken ? this.auth.getToken() : null;
    // Log outgoing request for debugging (use console.log so it's visible by default)
    // (remove or lower verbosity in production)
    // Keep interceptor logging minimal to avoid console spam in production/dev
    // Use console.debug so it's hidden unless devtools set to verbose
    console.debug('[AuthInterceptor] Request:', req.method, req.url, 'tokenPresent=', !!token);

    const authReq = token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

    return next.handle(authReq).pipe(
      tap(() => {
        // successful pass-through; nothing to do
      }),
      catchError((err: any) => {
        if (err instanceof HttpErrorResponse) {
          console.warn('[AuthInterceptor] HTTP error:', err.status, err.statusText, err.url);
          if (err.status === 401) {
            // token probably invalid/expired
            console.warn('[AuthInterceptor] 401 received — clearing token and notifying AuthService');
            try { this.auth.logout(); } catch (e) { console.error(e); }
            this.auth.requestLoginPrompt();
          }
        }
        return throwError(() => err);
      })
    );
  }
}