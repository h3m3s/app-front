import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MainCars } from './cars/main-cars/main-cars';

const routes: Routes = [
  {path: '', pathMatch: 'full', redirectTo: 'main-cars'},
  {path: 'main-cars', component: MainCars}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
