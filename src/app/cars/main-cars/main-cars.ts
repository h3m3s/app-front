import { Component, OnInit } from '@angular/core';
import { CarsService } from '../cars-service';



@Component({
  selector: 'app-main-cars',
  standalone: false,
  templateUrl: './main-cars.html',
  styleUrls: ['./main-cars.scss'],
})
export class MainCars implements OnInit {
  protected cars: any[] = [];
  protected pagedCars: any[] = [];  // <= to wyświetlamy w tabeli

  rowsPerPage = 9;
  currentPage = 1;

  isLoading = true;
  error: string | null = null;

  constructor(
    private readonly carsService: CarsService,
  ) {}

  ngOnInit() {
    this.getCars();
  }

  getCars(): void {
    this.carsService.getCars().subscribe({
      next: data => {
        this.cars = data;
        this.paginate();
        this.isLoading = false;
      },
      error: err => {
        this.error = 'Error while fetching cars';
        this.isLoading = false;
      }
    });
  }
  
  paginate(): void {
    const start = (this.currentPage - 1) * this.rowsPerPage;
    const end = start + this.rowsPerPage;
    this.pagedCars = this.cars.slice(start, end);
  }

  goToPage(page: number): void {
    this.currentPage = page;
    this.paginate();
  }

  get totalPages(): number {
    return Math.ceil(this.cars.length / this.rowsPerPage);
  }

  
}