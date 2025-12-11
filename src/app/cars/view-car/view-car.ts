import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { CarsService } from '../cars-service';
import { lastValueFrom, Subject } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
// import { CarsModule } from '../cars-module';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { AddModCar } from '../add-mod-car/add-mod-car';
import { takeUntil } from 'rxjs/operators';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CarsModel } from '../../../interfaces/car-interface';
import { Rental } from '../../../interfaces/rental-interface';

@Component({
  selector: 'app-view-car',
  standalone: false,
  templateUrl: './view-car.html',
  styleUrls: ['./view-car.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewCar implements OnInit, OnDestroy {
  protected car: CarsModel | null = null;
  protected error: string | null = null;
  protected isLoadingImage: boolean = true;
  protected isLoading: boolean = true;
  protected returnPage = 1;
  protected rentals: Rental[] = [];
  
  protected rentalsLoading = false;
  protected rentForm: FormGroup;
  protected rentError: string | null = null;
  protected editingRental: Rental | null = null;
  protected isRentSaving = false;

  private destroy$ = new Subject<void>();

  constructor(
    public carsService: CarsService,
    private route: ActivatedRoute,
    private router: Router,
    private modalService: NgbModal,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
  ) {
    this.rentForm = this.fb.group({
      startDate: ['', Validators.required],
      startTime: ['', Validators.required],
      endDate: ['', Validators.required],
      endTime: ['', Validators.required],
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

  private hasOverlap(startIso: string, endIso: string, excludeId?: number | null): boolean {
    const toTs = (iso: string) => {
      if (!iso) return NaN;
      if (iso.endsWith('Z')) return new Date(iso).getTime();
      // if format YYYY-MM-DDTHH:MM, append seconds and Z
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iso)) {
        return new Date(iso + ':00.000Z').getTime();
      }
      return new Date(iso).getTime();
    };
    const startTs = toTs(startIso);
    const endTs = toTs(endIso);
    if (!startTs || !endTs) return false;
    for (const r of this.rentals) {
      if (excludeId && r.id === excludeId) continue;
      const existingStart = toTs(r.startIso || r.startDate || (r.startDate + 'T' + (r.startTime || '00:00')));
      const existingEnd = toTs(r.endIso || r.endDate || (r.endDate + 'T' + (r.endTime || '00:00')));
      if (!existingStart || !existingEnd) continue;
      const overlap = !(existingEnd <= startTs || existingStart >= endTs);
      if (overlap) return true;
    }
    return false;
  }

  protected startAddRental(): void {
    this.editingRental = null;
    this.rentForm.reset({ startDate: '', startTime: '', endDate: '', endTime: '' });
    // reset rental form state
  }

  protected editRental(rent: Rental): void {
    this.editingRental = rent;
    this.rentForm.setValue({
      startDate: rent.startDate || '',
      startTime: rent.startTime || '',
      endDate: rent.endDate || '',
      endTime: rent.endTime || '',
    });
    // edit rental data loaded; no role-based behavior
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

    // Client-side overlap check (prevent submission if overlaps existing rentals)
    const editingId = this.editingRental?.id ?? null;
    if (this.hasOverlap(startIso, endIso, editingId)) {
      this.rentError = 'Wybrany termin koliduje z istniejącą rezerwacją.';
      this.isRentSaving = false;
      return;
    }
    this.isRentSaving = true;
    this.rentError = null;
    const payload: { startDate: string; endDate: string } = { startDate: startIso, endDate: endIso };
    const request$ = this.editingRental
      ? this.carsService.updateRental(this.editingRental.id, payload)
      : this.carsService.addRental({ carId: this.car.id, ...payload });

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isRentSaving = false;
        this.startAddRental();
        if (this.car?.id) {
          this.loadRentals(this.car.id);
        }
      },
      error: (err: any) => {
        console.error('Rental save failed', err);
        this.isRentSaving = false;
        this.rentError = err?.error?.message || 'Nie udało się zapisać terminu.';
        this.cdr.markForCheck();
      }
    });
    
  }

  // Ensure end time is not earlier than start time on same-day selection
  onRentStartTimeChange(): void {
    const val: any = this.rentForm.value;
    const sameDay = !!val.startDate && val.endDate === val.startDate;
    if (sameDay && val.endTime && val.startTime && val.endTime < val.startTime) {
      this.rentForm.patchValue({ endTime: val.startTime });
    }
  }

  // protected deleteRental(rent: Rental): void {
  //   if (!rent?.id) return;
  //   const confirmation = window.confirm('Czy na pewno usunąć ten termin?');
  //   if (!confirmation) return;
  //   this.carsService.deleteRental(rent.id).pipe(takeUntil(this.destroy$)).subscribe({
  //     next: () => {
  //       if (this.editingRental?.id === rent.id) {
  //         this.startAddRental();
  //       }
  //       if (this.car?.id) {
  //         this.loadRentals(this.car.id);
  //       }
  //     },
  //     error: (err) => {
  //       console.error('Rental delete failed', err);
  //       this.rentError = err?.error?.message || 'Nie udało się usunąć terminu.';
  //       this.cdr.markForCheck();
  //     },
  //   });
  // }

  private parseDateTime(value: string | null | undefined, prefix: 'start' | 'end'): Record<string, string> {
    if (!value) {
      return {
        [`${prefix}Date`]: '',
        [`${prefix}Time`]: '',
        [`${prefix}Iso`]: '',
      };
    }
    const normalized = value.replace(' ', 'T');
    const date = normalized.substring(0, 10);
    const time = normalized.substring(11, 16) || '00:00';
    return {
      [`${prefix}Date`]: date,
      [`${prefix}Time`]: time,
      [`${prefix}Iso`]: `${date}T${time}`,
    };
  }

  private combineDateTime(date: string, time: string): string {
    if (!date || !time) {
      return '';
    }
    return `${date}T${time}:00.000Z`;
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : NaN;
    if (!isNaN(id)) {
      this.getCar(id);
      this.loadRentals(id);
    } else {
      this.isLoading = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private getCar(id: number): void {
    this.isLoading = true;
    this.carsService.getCar(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.car = data as CarsModel;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error loading car', err);
        this.error = 'Nie udało się pobrać samochodu.';
        this.isLoading = false;
        this.cdr.markForCheck();
      }
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

  public getImageUrl(photo?: string | null): string {
    return this.carsService.getImageUrl(photo);
  }

  openModal(action: 'add' | 'modify', event?: Event, carFromHtml?: CarsModel) {
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
            this.carsService.getCars().subscribe(() => {
              this.router.navigate(['/main-cars'], { queryParams: { page: this.returnPage } });
            });
          },
          error: (err) => {
            console.error('Add car error', err, err.status, err.statusText, err.error);
            
          },
        });
      } else {
            this.carsService.updateCar(save).subscribe({
          next: (res) => {
            this.carsService.getCars().subscribe(() => this.getCar(save.id));
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
