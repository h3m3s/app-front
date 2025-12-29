import { SearchCriteria } from './main-cars-search-criteria.interface';
import { QueryParams } from './main-cars-query-params.interface';

export interface SearchPayload {
  criteria: SearchCriteria;
  queryParams: QueryParams;
  hasCriteria: boolean;
  queryText: string;
  minPrice: number | null;
  maxPrice: number | null;
  sort: string;
}
