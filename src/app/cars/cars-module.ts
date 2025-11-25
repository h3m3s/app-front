import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { MainCars } from './main-cars/main-cars';


@NgModule({
  declarations: [MainCars],
  imports: [
    CommonModule,
    HttpClientModule
  ],
  exports:[
    MainCars
  ]
})
export class CarsModule { }
