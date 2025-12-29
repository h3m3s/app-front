import { CarsModel } from './car-interface';

export type SearchCriteria = Partial<Pick<CarsModel, 'brand' | 'model'>> & {
  minPrice?: number;
  maxPrice?: number;
  startDate?: string;
  endDate?: string;
  [key: string]: unknown;
};
