import { readFile } from "node:fs/promises";
import path from "node:path";

export type Book = {
  bookId: number;
  name: string;
  author: string;
  publisher: string;
  subject: string;
  mainPrice: number;
  price: number;
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

export function parseBooksCsv(csv: string): Book[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const indexOf = (name: string) => headers.indexOf(name);
  const field = (row: string[], name: string) => row[indexOf(name)]?.trim() ?? "";

  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line);
    return {
      bookId: Number(field(row, "book_id")),
      name: field(row, "book_name"),
      author: field(row, "author_name"),
      publisher: field(row, "publisher_name"),
      subject: field(row, "subject_name"),
      mainPrice: Number(field(row, "main_price")) || 0,
      price: Number(field(row, "wafilife_price")) || 0,
    };
  }).filter((book) => book.name);
}

export async function loadCatalog(): Promise<Book[]> {
  const csvPath = process.env.CATALOG_CSV_PATH
    ? path.resolve(process.env.CATALOG_CSV_PATH)
    : path.resolve(process.cwd(), "master.csv");
  return parseBooksCsv(await readFile(csvPath, "utf8"));
}

function scoreBook(book: Book, query: string): number {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const weightedFields: Array<[string, number]> = [
    [book.name, 5],
    [book.author, 3],
    [book.subject, 2],
    [book.publisher, 1],
  ];
  return terms.reduce((score, term) => score + weightedFields.reduce(
    (fieldScore, [field, weight]) => field.toLocaleLowerCase().includes(term) ? fieldScore + weight : fieldScore,
    0,
  ), 0);
}

export function searchBooks(books: Book[], query: string, limit = 24): Book[] {
  const cleanQuery = query.trim();
  if (!cleanQuery) return books.slice(0, limit);
  return books
    .map((book) => ({ book, score: scoreBook(book, cleanQuery) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.book.bookId - right.book.bookId)
    .slice(0, limit)
    .map(({ book }) => book);
}

export function recommendBooks(books: Book[], seed: Book, limit = 6): Book[] {
  return books
    .filter((book) => book.bookId !== seed.bookId)
    .map((book) => ({
      book,
      score: (book.subject === seed.subject ? 4 : 0) + (book.author === seed.author ? 3 : 0) + (book.publisher === seed.publisher ? 1 : 0),
    }))
    .sort((left, right) => right.score - left.score || Math.abs(left.book.price - seed.price) - Math.abs(right.book.price - seed.price))
    .slice(0, limit)
    .map(({ book }) => book);
}
