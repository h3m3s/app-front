import { CarsModel } from './car-interface';

export type CarView = CarsModel & {
  _isImageLoading?: boolean;
  _searchName: string;
  _priceNumber: number;
  isReserved?: boolean;
};
