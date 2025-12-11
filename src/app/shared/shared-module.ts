import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Header } from './header/header';
import { AuthModule } from '../auth/auth-module';
import { RouterModule } from '@angular/router';



@NgModule({
  declarations: [
    Header
  ],
  imports: [
    CommonModule,
    RouterModule,
    AuthModule,
  ],
  exports: [
    Header
  ]
})
export class SharedModule { }
