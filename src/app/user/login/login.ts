import { Component } from '@angular/core';
import { NgForm } from '@angular/forms';
import { AuthService } from '../../auth/auth-service';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal';
@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {

  errorMessage: string | null = null;
  isSubmitting = false;

  constructor(private authService: AuthService, public activeModal: NgbActiveModal) {}

  onLogin(form: NgForm): void {
    if (!form.valid || this.isSubmitting) {
      return;
    }

    this.errorMessage = null;
    this.isSubmitting = true;

    this.authService.login(form.value.Email, form.value.password).subscribe({
      next: () => {
        this.isSubmitting = false;
        form.resetForm();
        this.activeModal.close();
      },
      error: () => {
        this.isSubmitting = false;
        this.errorMessage = 'Login failed. Please check your credentials.';
      }
    });
  }
}
