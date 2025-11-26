import { Component } from '@angular/core';
import { CarsService } from '../cars-service';
import { HttpParams } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { CarsModule } from '../cars-module';
@Component({
  selector: 'app-view-car',
  standalone: false,
  templateUrl: './view-car.html',
  styleUrl: './view-car.scss',
})
export class ViewCar {
  constructor(private readonly carsService: CarsService,
    private route: ActivatedRoute
  ) {}
  protected car: any;
  ngOnInit() {
      this.route.paramMap.subscribe(params => {
          const carId = Number(params.get('id'));
          this.getCar(carId);
      });
  }

  getCar(id: number): void {
    this.carsService.getCar(id).subscribe({
      next: data => {
        this.car = data;
      },
      error: err => {
        console.error('Error while fetching car', err);
      }
    });
  }
  
}
