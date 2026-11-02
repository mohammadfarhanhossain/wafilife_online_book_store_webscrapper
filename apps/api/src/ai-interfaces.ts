export interface EmbeddingProvider { embed(texts: string[]): Promise<number[][]>; }
export interface VectorStore { search(queryVector: number[], limit: number): Promise<string[]>; upsert(ids: string[], vectors: number[][], metadata: Record<string, unknown>[]): Promise<void>; }
export interface LLMProvider { explain(prompt: string): Promise<string>; }
export interface QueryUnderstanding { expand(query: string): Promise<string[]>; }
export interface RecommendationRanker<T> { rank(candidates: T[]): T[]; }

export class DisabledAiProvider implements EmbeddingProvider, QueryUnderstanding {
  async embed(): Promise<number[][]> { throw new Error("AI provider is not configured"); }
  async expand(query: string): Promise<string[]> { return [query]; }
}
