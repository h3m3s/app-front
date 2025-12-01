import { Component, EventEmitter, Input, Output, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';

@Component({
  selector: 'app-image-cropper-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-header">
      <h5 class="modal-title">Przytnij zdjęcie</h5>
      <button type="button" class="btn-close" aria-label="Close" (click)="onCancel()"></button>
    </div>
    <div class="modal-body">
      <div class="mb-2 text-muted">Kliknij i przeciągnij obszar, użyj narożników aby go skalować.</div>
      <div *ngIf="imageSrc" class="crop-wrapper">
        <div class="image-canvas" #imageContainer>
          <img #imageToCrop [src]="imageSrc" alt="Do przycięcia" class="crop-image" (load)="onImageLoaded()" />
        </div>
        <div class="crop-controls">
          <div class="d-flex gap-2 align-items-center">
            <label class="mb-0">Tryb proporcji:</label>
            <select class="form-select form-select-sm" [(ngModel)]="selectedPreset" (change)="onPresetChange()">
              <option value="free">Dowolne (wolny wybór)</option>
              <option value="main">Dopasuj do listy (card list)</option>
              <option value="detail">Dopasuj do widoku (detail)</option>
            </select>
          </div>
          <div class="d-flex gap-2 align-items-center">
            <button class="btn btn-sm btn-outline-secondary" (click)="resetCrop()">Reset</button>
            <button class="btn btn-sm btn-primary" (click)="onCrop()">Przytnij</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" (click)="onCancel()">Anuluj</button>
      <button type="button" class="btn btn-primary" (click)="onCrop()">Przytnij</button>
    </div>
  `,
  styles: [
    `
    .crop-wrapper { display:flex; flex-direction:column; gap:8px; align-items:center; }
    .image-canvas { position:relative; max-width:100%; max-height:420px; overflow:hidden; display:inline-block; }
    .crop-image { display:block; max-width:100%; height:auto; }
    /* CropperJS provides built-in handles and overlay. Custom handles removed. */
    .crop-controls { width:100%; display:flex; justify-content:space-between; align-items:center; }
    `
  ]
})
export class ImageCropperModalComponent {
  @Input() imageSrc: string | null = null;
  @Output() cropped = new EventEmitter<Blob | string>();
  @Output() cancelled = new EventEmitter<void>();
  @ViewChild('imageToCrop', { static: false }) imageToCrop!: ElementRef<HTMLImageElement>;
  @ViewChild('imageContainer', { static: false }) imageContainer!: ElementRef<HTMLElement>;
  private cropperInstance: Cropper | null = null;

  lockAspect = true;
  selectedPreset: 'free' | 'main' | 'detail' = 'main';
  private imgNaturalWidth = 0;
  private imgNaturalHeight = 0;
  private displayedWidth = 0;
  private displayedHeight = 0;

  onCrop() {
    if (!this.cropperInstance) { this.cropped.emit(this.imageSrc!); return; }
    const canvas = this.cropperInstance.getCroppedCanvas();
    // Export as JPEG with reasonable default quality to keep sizes smaller
    canvas.toBlob((blob) => {
      if (blob) this.cropped.emit(blob);
      else {
        const dataUrl = canvas.toDataURL('image/png');
        this.cropped.emit(dataUrl);
      }
    }, 'image/jpeg', 0.85);
  }
  onCancel() {
    this.cancelled.emit();
  }

  onImageLoaded() {
    const img = this.imageToCrop.nativeElement;
    this.imgNaturalWidth = img.naturalWidth;
    this.imgNaturalHeight = img.naturalHeight;
    this.displayedWidth = img.clientWidth;
    this.displayedHeight = img.clientHeight;
    if (this.cropperInstance) { this.cropperInstance.destroy(); this.cropperInstance = null; }
    const aspect = this.getAspectFromPreset(this.selectedPreset);
    this.cropperInstance = new Cropper(img, {
      aspectRatio: aspect, // may be NaN -> free
      viewMode: 1,
      autoCropArea: 0.8,
      movable: true,
      scalable: false,
      zoomable: true,
      responsive: true,
    });
  }

  // No manual crop area calculation required; handled by CropperJS.

  // Removed manual crop drag/resize code; CropperJS handles user interactions.

  resetCrop() {
    if (this.cropperInstance) this.cropperInstance.reset();
  }

  private getAspectFromPreset(p: 'free' | 'main' | 'detail'): number {
    if (p === 'free') return Number.NaN;
    if (p === 'main') return 280 / 170; // width / height to match list card image
    if (p === 'detail') return 3 / 2;
    return Number.NaN;
  }

  onPresetChange() {
    const aspect = this.getAspectFromPreset(this.selectedPreset);
    if (this.cropperInstance) {
      this.cropperInstance.setAspectRatio(aspect);
    }
  }

  ngOnDestroy() {
    if (this.cropperInstance) { this.cropperInstance.destroy(); this.cropperInstance = null; }
  }
}
