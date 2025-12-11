import { CarsModel } from './car-interface';

export interface ModalResult {
    save: CarsModel | false;
    file: File | null;
    isNew?: boolean;
    isAdd?: boolean;
}

export interface PhotoUploadResponse {
    photoId: string;
    message?: string;
}
