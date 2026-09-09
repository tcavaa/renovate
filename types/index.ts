export type ApiResponse<T> = {
  data: T | null;
  error: string | null;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
