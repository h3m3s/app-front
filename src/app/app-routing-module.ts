import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MainCars } from './cars/main-cars/main-cars';
import { ViewCar } from './cars/view-car/view-car';
import { Login } from './auth/login/login';
import { Register } from './auth/register/register';

const routes: Routes = [
  {path: '', pathMatch: 'full', redirectTo: 'main-cars'},
  {path: 'main-cars', component: MainCars},
  {path: 'view-car/:id', component: ViewCar},
  {path: 'login', component: Login},
  {path: 'register', component: Register}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
