import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Header } from './header/header';



@NgModule({
  declarations: [
    Header
  ],
  imports: [
    CommonModule,
  ],
  exports: [
    Header
  ]
})
export class SharedModule { }
