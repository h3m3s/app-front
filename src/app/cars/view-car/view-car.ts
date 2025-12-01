import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CarsService } from '../cars-service';
import { lastValueFrom, Subject } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { CarsModule } from '../cars-module';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { AddModCar } from '../add-mod-car/add-mod-car';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-view-car',
  standalone: false,
  templateUrl: './view-car.html',
  styleUrls: ['./view-car.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewCar implements OnDestroy {
  protected car: any;
  protected error: string | null = null;
  protected isLoadingImage: boolean = true;
  protected isLoading: boolean = true;
  protected returnPage = 1;
  private readonly destroy$ = new Subject<void>();

  constructor(
    public carsService: CarsService,
    private route: ActivatedRoute,
    private readonly modalService: NgbModal,
    private readonly router: Router
    ,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const carId = Number(params.get('id'));
      this.getCar(carId);
    });
    
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.returnPage = Number(params['page']) || 1;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getCar(id: number): void {
    this.isLoading = true;
    this.isLoadingImage = false;
    this.carsService.getCar(id).subscribe({
      next: (data) => {
        this.car = data;
        
        this.isLoadingImage = !!(this.car?.photo);
        this.isLoading = false;
        this.cdr.markForCheck();
        setTimeout(() => { try { this.cdr.detectChanges(); } catch(e) { } });
      },
      error: (err) => {
        console.error('Error while fetching car', err);
        this.isLoading = false;
        this.isLoadingImage = false;
        this.cdr.markForCheck();
        setTimeout(() => { try { this.cdr.detectChanges(); } catch(e) { } });
      },
    });
  }

  onImageLoad() {
    this.isLoadingImage = false;
    this.cdr.markForCheck();
  }

  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.src = '/missing-image.webp';
    this.isLoadingImage = false;
    this.cdr.markForCheck();
  }

  openModal(action: 'add' | 'modify', event?: Event, carFromHtml?: CarsModule) {
    if (event) event.stopPropagation();

    const modalRef = this.modalService.open(AddModCar, { size: 'lg' });

    if (action === 'modify' && carFromHtml) {
      modalRef.componentInstance.car = carFromHtml;
      modalRef.componentInstance.add = false;
    } else {
      modalRef.componentInstance.car = {
        brand: '',
        model: '',
        price: 0,
        photo: ''
      };
      modalRef.componentInstance.add = true;
    }

    modalRef.result
      .then(async (result) => {
        if (!result) return;
        
        await this.handleModalResult(result as { save: any; file: File | null; isNew?: boolean; isAdd?: boolean });
      })
        .catch((err) => { console.error('Modal closed with error:', err); this.cdr.markForCheck(); });
  }

  delCar(id: number, e: Event): void {
    e.stopPropagation();
    const confirmation = window.confirm(`Do you want to delete car: ${id}?`);
    if (confirmation) {
      this.carsService.delCar(id).subscribe(() => {
        this.router.navigate(['/main-cars'], { queryParams: { page: this.returnPage } });
      });
    }
  }
  private async handleModalResult(result: { save: any; file: File | null; isNew?: boolean; isAdd?: boolean }) {
    const { save, file, isAdd } = result;
    const isNew = (result as any).isNew ?? isAdd ?? false;
    try {
      
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        
        if (!isNew && save.id) {
          const res: any = await lastValueFrom(this.carsService.uploadCarPhotoForCar(save.id, formData));
          save.photo = res.uploaded?.filename || save.photo;
          this.carsService.bumpImageVersion();
        } else {
          const uploadRes: any = await lastValueFrom(this.carsService.uploadCarPhoto(formData));
          save.photo = uploadRes.filename;
          this.carsService.bumpImageVersion();
        }
      }
      
      if (isNew) {
        this.carsService.addCar(save).subscribe({
          next: (res) => {
            
            
            this.carsService.refreshCarsCache();
            this.router.navigate(['/main-cars'], { queryParams: { page: this.returnPage } });
          },
          error: (err) => {
            console.error('Add car error', err, err.status, err.statusText, err.error);
            
          },
        });
      } else {
        this.carsService.updateCar(save).subscribe({
          next: (res) => {
            this.carsService.refreshCarsCache();
            this.getCar(save.id);
          },
          error: (err) => console.error('Update car error', err),
        });
      }
    } catch (err) {
      console.error('Error saving car or uploading file', err);
      if ((err as any)?.status === 413) {
        this.error = 'Plik jest za duży. Zmniejsz rozmiar pliku i spróbuj ponownie.';
      }
    }
  }
}
