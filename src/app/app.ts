import { Component, OnDestroy, signal } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { AuthService } from './auth/auth-service';
import { Login } from './user/login/login';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrls: ['./app.scss']
})
export class App implements OnDestroy {
  protected readonly title = signal('app-front');
  private readonly destroy$ = new Subject<void>();
  private loginModalRef?: NgbModalRef;

  constructor(private readonly authService: AuthService, private readonly modalService: NgbModal) {
    this.authService.loginRequired$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.openLoginModal());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private openLoginModal(): void {
    if (this.modalService.hasOpenModals()) {
      return;
    }

    this.loginModalRef = this.modalService.open(Login, {
      centered: true,
      backdrop: 'static',
      keyboard: false,
      windowClass: 'login-modal-window',
      backdropClass: 'login-modal-backdrop'
    });

    this.loginModalRef.result.finally(() => {
      this.loginModalRef = undefined;
    });
  }
}
