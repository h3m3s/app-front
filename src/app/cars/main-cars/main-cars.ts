import { Component, OnInit } from '@angular/core';
import { CarsService } from '../cars-service';

@Component({
  selector: 'app-main-cars',
  standalone: false,
  templateUrl: './main-cars.html',
  styleUrls: ['./main-cars.scss'],
})
export class MainCars{
  protected cars: any[] = [];
  isLoading = true;
  error: string | null = null;

  constructor(private readonly carsService: CarsService) {}

  ngOnInit() {
    this.getCars();
  }
  getCars(): void {
    this.carsService.getCars().subscribe(data => {
      console.log(data);
    });
  }
}
