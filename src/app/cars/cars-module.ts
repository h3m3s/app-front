import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { MainCars } from './main-cars/main-cars';
import { ViewCar } from './view-car/view-car';
import { AppRoutingModule } from '../app-routing-module';
import { RouterModule } from '@angular/router';


@NgModule({
  declarations: [MainCars, ViewCar],
  imports: [
    CommonModule,
    HttpClientModule,
    AppRoutingModule,
    RouterModule,
  ],
  exports:[
    MainCars
  ]
})
export class CarsModule { }
