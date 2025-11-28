import { Component } from '@angular/core';
import { CarsService } from '../cars-service';
import { HttpParams } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { CarsModule } from '../cars-module';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { AddModCar } from '../add-mod-car/add-mod-car';
@Component({
  selector: 'app-view-car',
  standalone: false,
  templateUrl: './view-car.html',
  styleUrl: './view-car.scss',
})
export class ViewCar {
  constructor(private readonly carsService: CarsService,
    private route: ActivatedRoute,
    private readonly modalService: NgbModal,
    private readonly router: Router
  ) {}
  protected car: any;
  protected isLoadingImage: boolean = true;
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
        this.isLoadingImage = true;
      },
      error: err => {
        console.error('Error while fetching car', err);
      }
    });
  }
  onImageLoad() {
    this.isLoadingImage = false; // zdjęcie w pełni załadowane
  }
  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.src = '/missing-image.webp';
    this.isLoadingImage = false; // zdjęcie zastępcze też traktujemy jako załadowane
  }
  openModal(action?: string, event?: Event, carFromHtml?: CarsModule): void {
    if(action){
      event?.stopPropagation();
      this.car = carFromHtml;
    }
    const modalRef = this.modalService.open(AddModCar, {size: 'lg'});
    if(action === 'modify'){
      event?.stopPropagation();
    }
    modalRef.componentInstance.car = this.car;
    modalRef.result.then((result) => {
      const res = result.save;
      if(res){
        console.log('Modal closed with save:', res.save);
      }
    }).catch((error) => {
      console.log('Modal closed with error:', error);
    });
  }
    delCar(id: number, e:Event): void {
    e.stopPropagation();
    const confirmation = window.confirm(`Do you want to delete car: ${id}?`);
    if (confirmation) {
      this.carsService.delCar(id).subscribe(() => {
        this.router.navigate(['/cars']);
      });
    }
  }
}
