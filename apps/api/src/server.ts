import "dotenv/config";
import http from "node:http";
import { createDatabasePool } from "./db/database.js";
import { CatalogRepository, type BookQuery } from "./catalog-repository.js";
import { aiConfig, ChromaVectorStore, FallbackQueryUnderstanding, OllamaEmbeddingProvider } from "./ai.js";

const port = Number(process.env.PORT ?? 4000);
const allowedOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const pool = createDatabasePool();
const catalog = new CatalogRepository(pool);
const queryUnderstanding = new FallbackQueryUnderstanding();

class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) { super(message); }
}

function json(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": allowedOrigin, "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" });
  response.end(JSON.stringify(body));
}

function positive(value: string | null, fallback: number, name: string): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new HttpError(400, "invalid_parameter", `${name} must be a positive integer`);
  return parsed;
}

function optionalNumber(value: string | null, name: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new HttpError(400, "invalid_parameter", `${name} must be a non-negative number`);
  return parsed;
}

function bookQuery(url: URL): BookQuery {
  const sort = url.searchParams.get("sort") ?? "newest";
  if (!["newest", "title", "price_asc", "price_desc"].includes(sort)) throw new HttpError(400, "invalid_parameter", "sort is invalid");
  return { page: positive(url.searchParams.get("page"), 1, "page"), limit: Math.min(positive(url.searchParams.get("limit"), 24, "limit"), 100), search: url.searchParams.get("q") || undefined, authorId: optionalNumber(url.searchParams.get("author_id"), "author_id"), publisherId: optionalNumber(url.searchParams.get("publisher_id"), "publisher_id"), subjectId: optionalNumber(url.searchParams.get("subject_id"), "subject_id"), minPrice: optionalNumber(url.searchParams.get("min_price"), "min_price"), maxPrice: optionalNumber(url.searchParams.get("max_price"), "max_price"), availability: url.searchParams.get("availability") || undefined, sort: sort as BookQuery["sort"] };
}

async function body(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>; } catch { throw new HttpError(400, "invalid_json", "Request body must be valid JSON"); }
}

async function route(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (request.method === "OPTIONS") { response.writeHead(204, { "Access-Control-Allow-Origin": allowedOrigin }); response.end(); return; }
  if (request.method !== "GET" && request.method !== "POST") throw new HttpError(405, "method_not_allowed", "Method not allowed");
  if (url.pathname === "/health") { await pool.query("SELECT 1"); json(response, 200, { data: { status: "ok", service: "api" } }); return; }

  if (url.pathname === "/api/books" && request.method === "GET") { const result = await catalog.listBooks(bookQuery(url)); json(response, 200, result); return; }
  if (url.pathname === "/api/search/semantic" && request.method === "GET") {
    const query = url.searchParams.get("q")?.trim();
    if (!query) throw new HttpError(400, "invalid_parameter", "q is required");
    const understood = await queryUnderstanding.understand(query);
    try {
      const config = aiConfig();
      const vector = await new OllamaEmbeddingProvider(config).embedText(understood.expandedQuery);
      const limit = Math.min(positive(url.searchParams.get("limit"), 12, "limit"), 24);
      const hits = await new ChromaVectorStore(config).search(vector, limit);
      const books = await catalog.getBooksByIds(hits.map((hit) => hit.bookId));
      json(response, 200, { data: books, pagination: { page: 1, limit, total: books.length, totalPages: books.length ? 1 : 0 }, mode: "semantic", intent: understood });
    } catch (error) {
      const fallback = await catalog.listBooks({ ...bookQuery(url), search: query, maxPrice: understood.maxPrice ?? bookQuery(url).maxPrice });
      json(response, 200, { ...fallback, mode: "keyword_fallback", intent: understood, warning: error instanceof Error ? error.message : "AI unavailable" });
    }
    return;
  }
  const bookMatch = url.pathname.match(/^\/api\/books\/([^/]+)(?:\/([^/]+))?$/);
  if (bookMatch && request.method === "GET") {
    const [, id, subroute] = bookMatch;
    if (subroute === "recommendations") { json(response, 200, { data: await catalog.recommendations(id, Math.min(positive(url.searchParams.get("limit"), 6, "limit"), 24), url.searchParams.get("anonymous_key") ?? undefined) }); return; }
    if (subroute) throw new HttpError(404, "not_found", "Route not found");
    const book = await catalog.getBook(id); if (!book) throw new HttpError(404, "not_found", "Book not found"); json(response, 200, { data: book }); return;
  }

  const entityMatch = url.pathname.match(/^\/api\/(authors|publishers|subjects)(?:\/(\d+))?(\/books)?$/);
  if (entityMatch && request.method === "GET") {
    const [, type, id, booksSuffix] = entityMatch;
    const entityType = type as "authors" | "publishers" | "subjects";
    if (id && booksSuffix) { const key = `${type.slice(0, -1)}Id` as "authorId" | "publisherId" | "subjectId"; json(response, 200, await catalog.listBooks({ ...bookQuery(url), [key]: Number(id) })); return; }
    if (id) { const entity = await catalog.entity(entityType, Number(id)); if (!entity) throw new HttpError(404, "not_found", "Entity not found"); json(response, 200, { data: entity }); return; }
    json(response, 200, await catalog.listEntities(entityType, url.searchParams.get("q") ?? "", positive(url.searchParams.get("page"), 1, "page"), Math.min(positive(url.searchParams.get("limit"), 30, "limit"), 100))); return;
  }

  if (url.pathname === "/api/events" && request.method === "POST") {
    const input = await body(request);
    const type = String(input.event_type ?? "");
    if (!["book_view", "search", "recommendation_click"].includes(type)) throw new HttpError(400, "invalid_event", "Unsupported event_type");
    const eventType = type === "book_view" ? "view" : type;
    const bookId = typeof input.book_id === "string" && /^[0-9a-f-]{32,36}$/i.test(input.book_id) ? Buffer.from(input.book_id.replace(/-/g, ""), "hex") : null;
    await pool.query("INSERT INTO user_interactions (event_id, anonymous_key, book_id, event_type, session_id, query_text, metadata, occurred_at) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))", [typeof input.anonymous_key === "string" ? input.anonymous_key : null, bookId, eventType, typeof input.session_id === "string" ? input.session_id : null, typeof input.query_text === "string" ? input.query_text : null, JSON.stringify(input.metadata ?? {})]);
    json(response, 201, { data: { accepted: true } }); return;
  }
  throw new HttpError(404, "not_found", "Route not found");
}

const server = http.createServer(async (request, response) => {
  try { await route(request, response); } catch (error) { if (error instanceof HttpError) { json(response, error.status, { error: { code: error.code, message: error.message, details: error.details } }); return; } console.error("[API] request failed", error); json(response, 500, { error: { code: "internal_error", message: "Internal server error" } }); }
});

server.listen(port, () => console.log(`Bookstore API listening on http://localhost:${port}`));
process.on("SIGTERM", async () => { server.close(); await pool.end(); });
