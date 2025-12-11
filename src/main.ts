/// <reference types="@angular/localize" />

import { provideZoneChangeDetection } from "@angular/core";
import { platformBrowser } from '@angular/platform-browser';
import { AppModule } from './app/app-module';
import { provideHttpClient, withInterceptors } from "@angular/common/http";

platformBrowser().bootstrapModule(AppModule, 
  { applicationProviders: [provideZoneChangeDetection({ eventCoalescing: true })], })
  .catch(err => console.error(err));
