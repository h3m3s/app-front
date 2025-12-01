import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { MainCars } from './main-cars/main-cars';
import { ViewCar } from './view-car/view-car';
import { AppRoutingModule } from '../app-routing-module';
import { RouterModule } from '@angular/router';
import { AddModCar } from './add-mod-car/add-mod-car';
import { ImageCropperModalComponent } from './add-mod-car/image-cropper-modal.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';


@NgModule({
  declarations: [MainCars, ViewCar, AddModCar],
  imports: [
    CommonModule,
    HttpClientModule,
    AppRoutingModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    ImageCropperModalComponent
  ],
  exports:[
    MainCars
  ]
})
export class CarsModule { }
