import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Header } from './header/header';
import { RouterModule } from '@angular/router';



@NgModule({
  declarations: [
    Header
  ],
  imports: [
    CommonModule,
    RouterModule,
  ],
  exports: [
    Header
  ]
})
export class SharedModule { }
