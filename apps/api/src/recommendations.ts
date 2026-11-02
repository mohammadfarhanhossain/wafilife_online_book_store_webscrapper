import type { Book } from "./contracts.js";

export interface RecommendationService {
  recommend(bookId: string, limit?: number): Promise<Book[]>;
}

export function createRecommendationService(recommend: (bookId: string, limit: number) => Promise<Book[]>): RecommendationService {
  return { recommend: (bookId, limit = 6) => recommend(bookId, limit) };
}
