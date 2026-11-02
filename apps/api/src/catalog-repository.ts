import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Author, Book, PaginatedResponse, Publisher, Subject } from "./contracts.js";

export type BookQuery = {
  page: number;
  limit: number;
  search?: string;
  authorId?: number;
  publisherId?: number;
  subjectId?: number;
  minPrice?: number;
  maxPrice?: number;
  availability?: string;
  sort: "newest" | "title" | "price_asc" | "price_desc";
};

type CountRow = RowDataPacket & { total: number };
type IdRow = RowDataPacket & { id: number; name?: string };

type BookRow = RowDataPacket & {
  id: string;
  title: string;
  normalized_title: string;
  isbn13: string | null;
  language_code: string;
  description: string | null;
  status: string;
  updated_at: Date;
  main_price: number | null;
  sale_price: number | null;
  availability: string;
};

function idParam(id: string): Buffer {
  const value = id.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(value)) throw new Error("Invalid book id");
  return Buffer.from(value, "hex");
}

function placeholders(values: unknown[]): string {
  return values.map(() => "?").join(", ");
}

function bookJoins(query: BookQuery, args: unknown[]): string {
  const filters: string[] = ["b.status <> 'deleted'"];
  if (query.search) {
    const term = `%${query.search}%`;
    filters.push("(b.canonical_title LIKE ? OR EXISTS (SELECT 1 FROM book_authors ba JOIN authors a ON a.author_id = ba.author_id WHERE ba.book_id = b.book_id AND a.canonical_name LIKE ?) OR EXISTS (SELECT 1 FROM book_publishers bp JOIN publishers p ON p.publisher_id = bp.publisher_id WHERE bp.book_id = b.book_id AND p.canonical_name LIKE ?) OR EXISTS (SELECT 1 FROM book_subjects bs JOIN subjects s ON s.subject_id = bs.subject_id WHERE bs.book_id = b.book_id AND s.canonical_name LIKE ?))");
    args.push(term, term, term, term);
  }
  if (query.authorId !== undefined) { filters.push("EXISTS (SELECT 1 FROM book_authors ba WHERE ba.book_id = b.book_id AND ba.author_id = ?)"); args.push(query.authorId); }
  if (query.publisherId !== undefined) { filters.push("EXISTS (SELECT 1 FROM book_publishers bp WHERE bp.book_id = b.book_id AND bp.publisher_id = ?)"); args.push(query.publisherId); }
  if (query.subjectId !== undefined) { filters.push("EXISTS (SELECT 1 FROM book_subjects bs WHERE bs.book_id = b.book_id AND bs.subject_id = ?)"); args.push(query.subjectId); }
  if (query.minPrice !== undefined) { filters.push("COALESCE(sbs.sale_price, sbs.list_price) >= ?"); args.push(query.minPrice); }
  if (query.maxPrice !== undefined) { filters.push("COALESCE(sbs.sale_price, sbs.list_price) <= ?"); args.push(query.maxPrice); }
  if (query.availability) { filters.push("sbs.availability = ?"); args.push(query.availability); }
  return `FROM books b LEFT JOIN source_books sb ON sb.book_id = b.book_id AND sb.status = 'active' LEFT JOIN source_book_state sbs ON sbs.source_book_id = sb.source_book_id WHERE ${filters.join(" AND ")}`;
}

function mapBook(row: BookRow, authors: Author[], publishers: Publisher[], subjects: Subject[]): Book {
  return { id: row.id, title: row.title, normalizedTitle: row.normalized_title, isbn13: row.isbn13, languageCode: row.language_code, description: row.description, status: row.status, mainPrice: row.main_price, salePrice: row.sale_price, availability: row.availability ?? "unknown", authors, publishers, subjects };
}

export class CatalogRepository {
  constructor(private readonly pool: Pool) {}

  async listBooks(query: BookQuery): Promise<PaginatedResponse<Book>> {
    const args: unknown[] = [];
    const joins = bookJoins(query, args);
    const [countRows] = await this.pool.query<CountRow[]>(`SELECT COUNT(DISTINCT b.book_id) AS total ${joins}`, args);
    const total = Number(countRows[0]?.total ?? 0);
    const order = { newest: "b.updated_at DESC", title: "b.canonical_title ASC", price_asc: "COALESCE(sbs.sale_price, sbs.list_price) ASC", price_desc: "COALESCE(sbs.sale_price, sbs.list_price) DESC" }[query.sort];
    const offset = (query.page - 1) * query.limit;
    const [rows] = await this.pool.query<BookRow[]>(`SELECT DISTINCT HEX(b.book_id) AS id, b.canonical_title AS title, b.normalized_title, b.isbn13, b.language_code, b.description, b.status, b.updated_at, sbs.list_price AS main_price, sbs.sale_price, COALESCE(sbs.availability, 'unknown') AS availability ${joins} ORDER BY ${order} LIMIT ? OFFSET ?`, [...args, query.limit, offset]);
    const data = await this.attachRelations(rows);
    return { data, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }

  async getBook(id: string): Promise<Book | null> {
    const [rows] = await this.pool.query<BookRow[]>(`SELECT HEX(b.book_id) AS id, b.canonical_title AS title, b.normalized_title, b.isbn13, b.language_code, b.description, b.status, b.updated_at, sbs.list_price AS main_price, sbs.sale_price, COALESCE(sbs.availability, 'unknown') AS availability FROM books b LEFT JOIN source_books sb ON sb.book_id = b.book_id AND sb.status = 'active' LEFT JOIN source_book_state sbs ON sbs.source_book_id = sb.source_book_id WHERE b.book_id = ? AND b.status <> 'deleted' LIMIT 1`, [idParam(id)]);
    if (!rows[0]) return null;
    return (await this.attachRelations(rows))[0];
  }

  async getBooksByIds(ids: string[]): Promise<Book[]> {
    const books: Book[] = [];
    for (const id of ids) {
      const book = await this.getBook(id);
      if (book) books.push(book);
    }
    return books;
  }

  async recommendations(id: string, limit = 6, anonymousKey?: string): Promise<Book[]> {
    const bookId = idParam(id);
    const behaviorScore = anonymousKey ? " + (SELECT COUNT(*) FROM user_interactions ui JOIN book_subjects viewed_bs ON viewed_bs.book_id=ui.book_id JOIN book_subjects candidate_bs ON candidate_bs.subject_id=viewed_bs.subject_id WHERE ui.anonymous_key=? AND candidate_bs.book_id=candidate.book_id)" : "";
    const args: unknown[] = [bookId, bookId, bookId];
    if (anonymousKey) args.push(anonymousKey);
    args.push(bookId, limit);
    const [rows] = await this.pool.query<BookRow[]>(`SELECT HEX(candidate.book_id) AS id, candidate.canonical_title AS title, candidate.normalized_title, candidate.isbn13, candidate.language_code, candidate.description, candidate.status, candidate.updated_at, state.list_price AS main_price, state.sale_price, COALESCE(state.availability, 'unknown') AS availability, ((EXISTS (SELECT 1 FROM book_subjects x JOIN book_subjects y ON y.subject_id = x.subject_id WHERE x.book_id = ? AND y.book_id = candidate.book_id)) * 4 + (EXISTS (SELECT 1 FROM book_authors x JOIN book_authors y ON y.author_id = x.author_id WHERE x.book_id = ? AND y.book_id = candidate.book_id)) * 3 + (EXISTS (SELECT 1 FROM book_publishers x JOIN book_publishers y ON y.publisher_id = x.publisher_id WHERE x.book_id = ? AND y.book_id = candidate.book_id)) * 2${behaviorScore}) AS relevance FROM books candidate LEFT JOIN source_books source ON source.book_id = candidate.book_id AND source.status = 'active' LEFT JOIN source_book_state state ON state.source_book_id = source.source_book_id WHERE candidate.book_id <> ? AND candidate.status = 'active' ORDER BY relevance DESC, candidate.updated_at DESC LIMIT ?`, args);
    return this.attachRelations(rows);
  }

  async listEntities(type: "authors" | "publishers" | "subjects", search = "", page = 1, limit = 30): Promise<PaginatedResponse<Author | Publisher | Subject>> {
    const config = { authors: { id: "author_id", name: "canonical_name" }, publishers: { id: "publisher_id", name: "canonical_name" }, subjects: { id: "subject_id", name: "canonical_name" } }[type];
    const args: unknown[] = [];
    const filter = search ? "WHERE canonical_name LIKE ?" : "";
    if (search) args.push(`%${search}%`);
    const [countRows] = await this.pool.query<CountRow[]>(`SELECT COUNT(*) AS total FROM ${type} ${filter}`, args);
    const [rows] = await this.pool.query<IdRow[]>(`SELECT ${config.id} AS id, ${config.name} AS name FROM ${type} ${filter} ORDER BY ${config.name} LIMIT ? OFFSET ?`, [...args, limit, (page - 1) * limit]);
    return { data: rows.map((row) => ({ id: Number(row.id), name: String(row.name ?? "") })), pagination: { page, limit, total: Number(countRows[0]?.total ?? 0), totalPages: Math.ceil(Number(countRows[0]?.total ?? 0) / limit) } } as PaginatedResponse<Author | Publisher | Subject>;
  }

  async entity(type: "authors" | "publishers" | "subjects", entityId: number): Promise<Author | Publisher | Subject | null> {
    const config = { authors: { id: "author_id", name: "canonical_name" }, publishers: { id: "publisher_id", name: "canonical_name" }, subjects: { id: "subject_id", name: "canonical_name" } }[type];
    const [rows] = await this.pool.query<IdRow[]>(`SELECT ${config.id} AS id, ${config.name} AS name FROM ${type} WHERE ${config.id} = ?`, [entityId]);
    if (!rows[0]) return null;
    return { id: Number(rows[0].id), name: String(rows[0].name ?? "") };
  }

  private async attachRelations(rows: BookRow[]): Promise<Book[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => Buffer.from(row.id, "hex"));
    const marks = placeholders(ids);
    const [authors] = await this.pool.query<RowDataPacket[]>(`SELECT HEX(ba.book_id) AS book_id, a.author_id AS id, a.canonical_name AS name FROM book_authors ba JOIN authors a ON a.author_id = ba.author_id WHERE ba.book_id IN (${marks}) ORDER BY ba.display_order`, ids);
    const [publishers] = await this.pool.query<RowDataPacket[]>(`SELECT HEX(bp.book_id) AS book_id, p.publisher_id AS id, p.canonical_name AS name FROM book_publishers bp JOIN publishers p ON p.publisher_id = bp.publisher_id WHERE bp.book_id IN (${marks})`, ids);
    const [subjects] = await this.pool.query<RowDataPacket[]>(`SELECT HEX(bs.book_id) AS book_id, s.subject_id AS id, s.canonical_name AS name FROM book_subjects bs JOIN subjects s ON s.subject_id = bs.subject_id WHERE bs.book_id IN (${marks})`, ids);
    return rows.map((row) => mapBook(row, authors.filter((item) => item.book_id === row.id).map((item) => ({ id: Number(item.id), name: item.name })), publishers.filter((item) => item.book_id === row.id).map((item) => ({ id: Number(item.id), name: item.name })), subjects.filter((item) => item.book_id === row.id).map((item) => ({ id: Number(item.id), name: item.name }))));
  }
}
