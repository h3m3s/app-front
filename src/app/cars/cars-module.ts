import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MainCars } from './main-cars/main-cars';



@NgModule({
  declarations: [MainCars],
  imports: [
    CommonModule
  ],
  exports:[
    MainCars
  ]
})
export class CarsModule { }
