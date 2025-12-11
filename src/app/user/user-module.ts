import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Login } from './login/login';
import { FormsModule } from '@angular/forms';



@NgModule({
  declarations: [
    Login,
  ],
  imports: [
    CommonModule,
    FormsModule
  ]
})
export class UserModule { }
