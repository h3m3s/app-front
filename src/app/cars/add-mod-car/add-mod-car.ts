  import { Component, Input, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
  import { Router, RouterLink } from '@angular/router';
  import { CarsService } from '../cars-service';
  import { CarsModule } from '../cars-module';
  import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
  import { FormBuilder, FormGroup, Validators } from '@angular/forms';
  import { CarsModel } from '../../../interfaces/car-interface';

  @Component({
    selector: 'app-add-mod-car',
    standalone: false,
    templateUrl: './add-mod-car.html',
    styleUrls: ['./add-mod-car.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
  })
  export class AddModCar implements OnInit {

    
    @Input() car!: CarsModel;
    form!: FormGroup;
    protected startObject = {};
    add: boolean = true;
    selectedFile: File | null = null;
    previewDataUrl: string | null = null;
    fileError: string | null = null;
    allowedExtensions = ['webp','jpg','jpeg','png'];
    maxSizeBytes = 5 * 1024 * 1024;
    showCropper = false;
    constructor(public activeModal: NgbActiveModal, private readonly fb: FormBuilder, private readonly cdr: ChangeDetectorRef) {}

    ngOnInit() {
      this.form = this.fb.group({
        brand: ['', [Validators.required, Validators.maxLength(20)]],
        model: ['', [Validators.required, Validators.maxLength(20)]],
        price: [0, [Validators.required, Validators.min(0)]],
        photo: ['']
      });
      if(this.car){
        this.form.patchValue(this.car);
        this.add = false;
      } else {
        this.add = true;
      }
    }
    onSave(): void {
      if (this.fileError) return;
      if (this.form.invalid) {
        this.form.markAllAsTouched();
        return;
      }
      const carToSave: any = { ...this.form.value, price: Number(this.form.value.price) };
      if (!this.add && this.car?.id) carToSave.id = this.car.id;
      this.activeModal.close({ save: carToSave, file: this.selectedFile, isNew: this.add });
    }
    onClose(): void {
      this.activeModal.close({ save: false });
    }

    onFileSelected(event: Event): void {
      this.fileError = null;
      this.previewDataUrl = null;
      const input = event.target as HTMLInputElement;
      if (!input.files || input.files.length === 0) return;
      let file = input.files[0];
      if (!this.checkExtension(file)) return;
      if (!this.checkSize(file)) return;
      file = this.renameFile(file);
      this.selectedFile = file;
      this.form.patchValue({ photo: file.name });
      this.generatePreview(file, true); // open cropper after preview
    }

    openCropper() {
      this.showCropper = true;
      this.cdr.markForCheck();
    }

    closeCropper() {
      this.showCropper = false;
      this.cdr.markForCheck();
    }

    // existing cropping handler replaced later with change-detection aware variant

    private dataURLtoFile(dataurl: string, filename: string): File {
      const arr = dataurl.split(',');
      const match = arr[0].match(/:(.*?);/);
      const mime = match && match[1] ? match[1] : 'image/png';
      const bstr = atob(arr[1]);
      const n = bstr.length;
      const u8arr = new Uint8Array(n);
      for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
      return new File([u8arr], filename, { type: mime });
    }
    private checkExtension(file: File): boolean {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!this.allowedExtensions.includes(ext)) {
        this.fileError = `Dozwolone pliki: ${this.allowedExtensions.join(', ')}`;
        return false;
      }
      return true;
    }

    private checkSize(file: File): boolean {
      if (file.size > this.maxSizeBytes) {
        this.fileError = `Plik jest za duży. Maksymalny rozmiar: ${this.maxSizeBytes / (1024*1024)} MB`;
        return false;
      }
      return true;
    }

    private renameFile(file: File): File {
      const sanitizedName = file.name.replace(/\s+/g, '_');
      if (sanitizedName !== file.name) {
        return new File([file], sanitizedName, { type: file.type });
      }
      return file;
    }

    private generatePreview(file: File, openCropper: boolean = false): void {
      const reader = new FileReader();
      reader.onload = () => {
        this.previewDataUrl = reader.result as string;
        this.cdr.markForCheck();
        if (openCropper) {
          this.showCropper = true;
          this.cdr.markForCheck();
        }
      };
      reader.readAsDataURL(file);
    }

    async onCropped(cropped: Blob | string) {
      // Accept either Blob or dataURL string.
      if (typeof cropped === 'string') {
        this.previewDataUrl = cropped;
        this.selectedFile = this.dataURLtoFile(cropped, this.selectedFile?.name || 'cropped-image.png');
      } else {
        // Cropped is a Blob: compress if necessary and convert to File
        let blob = cropped;
        if (blob.size > this.maxSizeBytes) {
          try {
            blob = await this.compressBlobToMaxSize(blob, this.maxSizeBytes);
          } catch (err) {
            // if compression fails, keep original blob
            console.error('Compression failed', err);
          }
        }
        const fileName = this.selectedFile?.name || 'cropped-image.jpg';
        const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
        this.selectedFile = file;
        this.previewDataUrl = await this.blobToDataURL(blob);
      }
      this.cdr.markForCheck();
      this.closeCropper();
    }

    private blobToDataURL(blob: Blob): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(blob);
      });
    }

    private async compressBlobToMaxSize(blob: Blob, maxBytes: number): Promise<Blob> {
      const img = document.createElement('img');
      img.src = await this.blobToDataURL(blob);
      await new Promise((res) => (img.onload = res));
      let quality = 0.92;
      let attempt = 0;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const baseW = img.naturalWidth;
      const baseH = img.naturalHeight;
      const scaleFactorStep = 0.85;
      while (attempt < 8) {
        const scale = Math.pow(scaleFactorStep, Math.floor(attempt / 2));
        canvas.width = Math.round(baseW * scale);
        canvas.height = Math.round(baseH * scale);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob2 = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (!blob2) break;
        if (blob2.size <= maxBytes) return blob2;
        if (quality > 0.5) quality -= 0.12;
        else attempt++;
        attempt++;
      }
      return blob;
    }
  }

