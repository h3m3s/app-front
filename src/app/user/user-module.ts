import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Login } from './login/login';
import { FormsModule } from '@angular/forms';
import { Register } from './register/register';



@NgModule({
  declarations: [
    Login,
    Register,
  ],
  imports: [
    CommonModule,
    FormsModule
  ]
})
export class UserModule { }
