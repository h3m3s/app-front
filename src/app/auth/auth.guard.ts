import { inject } from "@angular/core";
import { CanActivateFn } from "@angular/router";
import { AuthService } from "./auth-service";

export const authGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    if (authService.isLoggedIn()) {
        return true;
    } else {
        authService.requestLoginPrompt();
        return false;
    }
}