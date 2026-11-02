import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Book } from "./contracts.js";

export type VectorHit = { bookId: string; distance: number };
export type EmbeddingConfig = { provider: string; model: string; version: string; ollamaUrl: string; chromaUrl: string; collection: string };

export function aiConfig(): EmbeddingConfig {
  const provider = process.env.EMBEDDING_PROVIDER ?? "ollama";
  const model = process.env.EMBEDDING_MODEL ?? "nomic-embed-text";
  const version = process.env.EMBEDDING_VERSION ?? "doc-v1-norm-v1";
  return { provider, model, version, ollamaUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434", chromaUrl: process.env.CHROMA_URL ?? "http://localhost:8000", collection: process.env.CHROMA_COLLECTION ?? `books_semantic__${provider}__${model}__${version}` };
}

export interface EmbeddingProvider { embedText(text: string): Promise<number[]>; embedTexts(texts: string[]): Promise<number[][]>; }
export interface VectorStore { search(queryEmbedding: number[], limit: number): Promise<VectorHit[]>; upsert(ids: string[], embeddings: number[][], metadata: Record<string, unknown>[], documents: string[]): Promise<void>; delete(ids: string[]): Promise<void>; }
export interface LLMProvider { explain(prompt: string): Promise<string>; }
export interface QueryUnderstanding { understand(query: string): Promise<{ keywords: string[]; expandedQuery: string; minPrice?: number; maxPrice?: number }>; }

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly config = aiConfig()) {}
  async embedText(text: string): Promise<number[]> { const vectors = await this.embedTexts([text]); return vectors[0] ?? []; }
  async embedTexts(texts: string[]): Promise<number[][]> {
    if (this.config.provider !== "ollama") throw new Error(`Unsupported embedding provider: ${this.config.provider}`);
    const response = await fetch(`${this.config.ollamaUrl}/api/embed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: this.config.model, input: texts }) });
    if (!response.ok) throw new Error(`Ollama embedding unavailable (${response.status})`);
    const data = await response.json() as { embeddings?: number[][]; embedding?: number[] };
    return data.embeddings ?? (data.embedding ? [data.embedding] : []);
  }
}

export class ChromaVectorStore implements VectorStore {
  private collectionId?: string;
  constructor(private readonly config = aiConfig()) {}
  private async collection(): Promise<string> {
    if (this.collectionId) return this.collectionId;
    const response = await fetch(`${this.config.chromaUrl}/api/v1/collections`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: this.config.collection, metadata: { embedding_version: this.config.version }, get_or_create: true }) });
    if (!response.ok) throw new Error(`Chroma unavailable (${response.status})`);
    const data = await response.json() as { id: string }; this.collectionId = data.id; return data.id;
  }
  async search(queryEmbedding: number[], limit: number): Promise<VectorHit[]> { const id = await this.collection(); const response = await fetch(`${this.config.chromaUrl}/api/v1/collections/${id}/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query_embeddings: [queryEmbedding], n_results: limit }) }); if (!response.ok) throw new Error(`Chroma query failed (${response.status})`); const data = await response.json() as { ids?: string[][]; distances?: number[][] }; return (data.ids?.[0] ?? []).map((bookId, index) => ({ bookId, distance: data.distances?.[0]?.[index] ?? 1 })); }
  async upsert(ids: string[], embeddings: number[][], metadata: Record<string, unknown>[], documents: string[]): Promise<void> { const id = await this.collection(); const response = await fetch(`${this.config.chromaUrl}/api/v1/collections/${id}/upsert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, embeddings, metadatas: metadata, documents }) }); if (!response.ok) throw new Error(`Chroma upsert failed (${response.status})`); }
  async delete(ids: string[]): Promise<void> { const id = await this.collection(); await fetch(`${this.config.chromaUrl}/api/v1/collections/${id}/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }); }
}

export function bookDocument(book: { title: string; authors: string[]; publishers: string[]; subjects: string[]; description?: string | null; language?: string; isbn13?: string | null }): string { return [`Title: ${book.title}`, `Authors: ${book.authors.join(", ")}`, `Publisher: ${book.publishers.join(", ")}`, `Subjects: ${book.subjects.join(", ")}`, `Language: ${book.language ?? "bn"}`, book.description ? `Description: ${book.description}` : "", book.isbn13 ? `ISBN: ${book.isbn13}` : ""].filter(Boolean).join("\n").normalize("NFC"); }

export class FallbackQueryUnderstanding implements QueryUnderstanding { async understand(query: string) { const matches = [...query.matchAll(/(?:under|within|কম|মধ্যে|টাকার)\s*[৳₹]?\s*([\d০-৯][\d০-৯,]*)|([\d০-৯][\d০-৯,]*)\s*(?:টাকার মধ্যে|এর মধ্যে|within|under)/gi)]; const prices = matches.map((match) => match[1] ?? match[2]).map((value) => Number(Array.from(value).map((digit) => "০১২৩৪৫৬৭৮৯".indexOf(digit) >= 0 ? String("০১২৩৪৫৬৭৮৯".indexOf(digit)) : digit).join("").replace(/,/g, ""))); return { keywords: query.normalize("NFC").split(/\s+/).filter(Boolean), expandedQuery: query, maxPrice: prices[0] }; } }

export async function mysqlBooksByIds(pool: Pool, ids: string[]): Promise<Book[]> {
  if (!ids.length) return [];
  const [rows] = await pool.query<Array<RowDataPacket & { id: string; title: string; main_price: number | null; sale_price: number | null; availability: string }>>(`SELECT HEX(b.book_id) id, b.canonical_title title, s.list_price main_price, s.sale_price, COALESCE(s.availability, 'unknown') availability FROM books b LEFT JOIN source_books sb ON sb.book_id=b.book_id AND sb.status='active' LEFT JOIN source_book_state s ON s.source_book_id=sb.source_book_id WHERE HEX(b.book_id) IN (${ids.map(() => "UNHEX(?)").join(",")})`, ids.map((id) => id.replace(/-/g, "")));
  return rows.map((row) => ({ id: row.id, title: row.title, normalizedTitle: row.title.toLocaleLowerCase(), isbn13: null, languageCode: "bn", description: null, status: "active", mainPrice: row.main_price, salePrice: row.sale_price, availability: row.availability, authors: [], publishers: [], subjects: [] }));
}
