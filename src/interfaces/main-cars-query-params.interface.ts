export type QueryParams = {
  search?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  sort?: string | null;
  page?: number | null;
  [key: string]: string | number | null | undefined;
};
