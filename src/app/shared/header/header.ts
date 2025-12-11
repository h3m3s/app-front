import { Component } from '@angular/core';
import { AuthService } from '../../auth/auth-service';

@Component({
  selector: 'app-header',
  standalone: false,
  templateUrl: './header.html',
  styleUrls: ['./header.scss'],
})
export class Header {
  constructor(private authService: AuthService) {}

  logOut(): void {
    this.authService.logout();
    this.authService.requestLoginPrompt();
  }
}
