import { Component } from '@angular/core';
import { AuthService } from '../../auth/auth-service';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { NgForm } from '@angular/forms';
@Component({
  selector: 'app-register',
  standalone: false,
  templateUrl: './register.html',
  styleUrl: './register.scss'
})
export class Register {

  errorMessage: string | null = null;
  isSubmitting = false;

  constructor(private authService: AuthService, public activeModal: NgbActiveModal) {}

  onRegister(form: NgForm): void {
    if (!form.valid || this.isSubmitting) {
      return;
    }

    this.errorMessage = null;
    this.isSubmitting = true;

    this.authService.register(form.value).subscribe({
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
