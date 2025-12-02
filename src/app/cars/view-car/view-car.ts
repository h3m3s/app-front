import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CarsService } from '../cars-service';
import { lastValueFrom, Subject } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { CarsModule } from '../cars-module';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { AddModCar } from '../add-mod-car/add-mod-car';
import { takeUntil } from 'rxjs/operators';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

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
  protected rentals: any[] = [];
  protected rentalsLoading = false;
  protected rentForm: FormGroup;
  protected isRentSaving = false;
  protected rentError: string | null = null;
  protected editingRental: any | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(
    public carsService: CarsService,
    private route: ActivatedRoute,
    private readonly modalService: NgbModal,
    private readonly router: Router,
    private readonly fb: FormBuilder
    ,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.rentForm = this.fb.group({
      startDate: ['', Validators.required],
      startTime: ['', Validators.required],
      endDate: ['', Validators.required],
      endTime: ['', Validators.required],
    });
  }

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
        if (this.car?.id) {
          this.loadRentals(this.car.id);
        }
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

  private loadRentals(carId: number): void {
    this.rentalsLoading = true;
    this.rentError = null;
    this.carsService.getRentalsForCar(carId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.rentals = (data || []).map((rent) => ({
          ...rent,
          id: rent.id ?? rent.rent_id ?? rent.rental_id,
          ...this.parseDateTime(rent.startDate || rent.start_data || rent.start_date, 'start'),
          ...this.parseDateTime(rent.endDate || rent.end_data || rent.end_date, 'end'),
        }));
        this.rentalsLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error while fetching rentals', err);
        this.rentalsLoading = false;
        this.rentError = 'Nie udało się pobrać terminów wypożyczeń.';
        this.cdr.markForCheck();
      },
    });
  }

  protected startAddRental(): void {
    this.editingRental = null;
    this.rentForm.reset({ startDate: '', startTime: '', endDate: '', endTime: '' });
  }

  protected editRental(rent: any): void {
    this.editingRental = rent;
    this.rentForm.setValue({
      startDate: rent.startDate || '',
      startTime: rent.startTime || '',
      endDate: rent.endDate || '',
      endTime: rent.endTime || '',
    });
  }

  protected cancelRentalEdit(): void {
    this.startAddRental();
  }

  protected saveRental(): void {
    if (this.rentForm.invalid || !this.car?.id) {
      this.rentForm.markAllAsTouched();
      return;
    }
    const { startDate, startTime, endDate, endTime } = this.rentForm.value;
    const startIso = this.combineDateTime(startDate, startTime);
    const endIso = this.combineDateTime(endDate, endTime);

    if (!startIso || !endIso) {
      this.rentError = 'Wybierz poprawne daty i godziny.';
      return;
    }

    // Enforce start <= end, including same-day time ordering
    const startTs = new Date(startIso).getTime();
    const endTs = new Date(endIso).getTime();
    if (startTs > endTs) {
      this.rentError = 'Data zakończenia nie może być wcześniejsza niż rozpoczęcia.';
      return;
    }
    this.isRentSaving = true;
    this.rentError = null;
    const payload = { startDate: startIso, endDate: endIso };
    const request$ = this.editingRental
      ? this.carsService.updateRental(this.editingRental.id, payload)
      : this.carsService.addRental({ carId: this.car.id, ...payload });

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isRentSaving = false;
        this.startAddRental();
        this.loadRentals(this.car.id);
      },
      error: (err) => {
        console.error('Rental save failed', err);
        this.isRentSaving = false;
        this.rentError = err?.error?.message || 'Nie udało się zapisać terminu.';
        this.cdr.markForCheck();
      },
    });
  }

  // Ensure end time is not earlier than start time on same-day selection
  onRentStartTimeChange(): void {
    const val = this.rentForm.value;
    const sameDay = !!val.startDate && val.endDate === val.startDate;
    if (sameDay && val.endTime && val.startTime && val.endTime < val.startTime) {
      this.rentForm.patchValue({ endTime: val.startTime });
    }
  }

  protected deleteRental(rent: any): void {
    if (!rent?.id) return;
    const confirmation = window.confirm('Czy na pewno usunąć ten termin?');
    if (!confirmation) return;
    this.carsService.deleteRental(rent.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (this.editingRental?.id === rent.id) {
          this.startAddRental();
        }
        this.loadRentals(this.car?.id);
      },
      error: (err) => {
        console.error('Rental delete failed', err);
        this.rentError = err?.error?.message || 'Nie udało się usunąć terminu.';
        this.cdr.markForCheck();
      },
    });
  }

  private parseDateTime(value: string | null | undefined, prefix: 'start' | 'end'): Record<string, string> {
    if (!value) {
      return {
        [`${prefix}Date`]: '',
        [`${prefix}Time`]: '',
        [`${prefix}Iso`]: '',
      } as any;
    }
    const normalized = value.replace(' ', 'T');
    const date = normalized.substring(0, 10);
    const time = normalized.substring(11, 16) || '00:00';
    return {
      [`${prefix}Date`]: date,
      [`${prefix}Time`]: time,
      [`${prefix}Iso`]: `${date}T${time}`,
    } as any;
  }

  private combineDateTime(date: string, time: string): string {
    if (!date || !time) {
      return '';
    }
    return `${date}T${time}:00.000Z`;
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
        if (!result || (result as any)?.save === false) return;
        
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
