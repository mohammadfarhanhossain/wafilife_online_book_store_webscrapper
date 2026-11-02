import { Header } from "../../components/Header";
import { SearchBar } from "../../components/SearchBar";
import { BookGrid } from "../../components/BookCard";
import { api, type Book, type Page } from "../../lib/api";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; mode?: string }> }) {
  const { q = "", mode = "" } = await searchParams;
  let result: Page<Book> | null = null;
  try { result = await api<Page<Book>>(`${mode === "semantic" ? "/api/search/semantic" : "/api/books"}?q=${encodeURIComponent(q)}&limit=24`); } catch { return <><Header /><main className="content"><SearchBar initial={q} /><p className="status">Search service is unavailable.</p></main></>; }
  return <><Header /><main className="content"><SearchBar initial={q} /><div className="section-heading"><div><p className="eyebrow">{mode === "semantic" ? "স্মার্ট অনুসন্ধান" : "অনুসন্ধান"}</p><h1>{q ? `“${q}” এর ফলাফল` : "কী খুঁজছেন?"}</h1></div><span className="count">{result.pagination.total.toLocaleString("bn-BD")}টি ফল</span></div><BookGrid books={result.data} /></main></>;
}
