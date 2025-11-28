import { Component, Input, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CarsService } from '../cars-service';
import { CarsModule } from '../cars-module';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { NgForm } from '@angular/forms';
import { CarsModel } from '../../../interfaces/car-interface';

@Component({
  selector: 'app-add-mod-car',
  standalone: false,
  templateUrl: './add-mod-car.html',
  styleUrl: './add-mod-car.scss',
})
export class AddModCar implements OnInit {

  
  @Input() car!: CarsModel;
  carInputForm!: CarsModel;
  add: boolean = true;
  selectedFile: File | null = null;
  previewDataUrl: string | null = null;
  fileError: string | null = null;
  allowedExtensions = ['webp','jpg','jpeg','png'];
  maxSizeBytes = 5 * 1024 * 1024 // 5 MB
  constructor(public activeModal: NgbActiveModal) {}

  ngOnInit() {
    if(this.car){
      this.carInputForm = {...this.car};
      this.add = false;
    } else {
      this.carInputForm = {
        brand: '',
        model: '',
        price: 0,
        photo: ''
      };
    }
  }
  onSave(): void {
    if (this.fileError) return;

    const carToSave = {
      brand: this.carInputForm.brand,
      model: this.carInputForm.model,
      price: this.carInputForm.price,
      photo: this.carInputForm.photo
    };

  this.activeModal.close({ save: carToSave, file: this.selectedFile, isNew: this.add });
  }
  onClose(): void {
    this.activeModal.close({ save: false });
  }

  onFileSelected(event: Event): void {
  console.log('onFileSelected fired');
  this.fileError = null;
  this.previewDataUrl = null;

  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  let file = input.files[0];
  if (!this.checkExtension(file)) return;
    if (!this.checkSize(file)) return;

    file = this.renameFile(file);
    this.selectedFile = file;
    this.carInputForm.photo = file.name;

    this.generatePreview(file);
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

  private generatePreview(file: File): void {
    const reader = new FileReader();
    reader.onload = () => { this.previewDataUrl = reader.result as string; };
    reader.readAsDataURL(file);
  }
}

