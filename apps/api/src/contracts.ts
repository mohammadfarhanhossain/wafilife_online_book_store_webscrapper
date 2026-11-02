export type Book = {
  id: string;
  title: string;
  normalizedTitle: string;
  isbn13: string | null;
  languageCode: string;
  description: string | null;
  status: string;
  mainPrice: number | null;
  salePrice: number | null;
  availability: string;
  authors: Author[];
  publishers: Publisher[];
  subjects: Subject[];
};

export type Author = { id: number; name: string };
export type Publisher = { id: number; name: string };
export type Subject = { id: number; name: string };

export type PaginatedResponse<T> = {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type ApiError = { error: { code: string; message: string; details?: unknown } };
