import { BookGrid } from "../../components/BookCard";
import { Header } from "../../components/Header";
import { SearchBar } from "../../components/SearchBar";
import { api, type Book, type Page } from "../../lib/api";
import Link from "next/link";

type Params = Promise<Record<string, string | string[] | undefined>>;
export default async function BooksPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const page = typeof params.page === "string" ? params.page : "1";
  let result: Page<Book> | null = null;
  let error = false;
  try { result = await api<Page<Book>>(`/api/books?q=${encodeURIComponent(query)}&page=${page}&limit=24&sort=${params.sort ?? "newest"}`); } catch { error = true; }
  return <><Header /><main className="content"><div className="catalog-head"><div><p className="eyebrow">বইয়ের তাক</p><h1>{query ? `“${query}”` : "সব বই"}</h1></div><SearchBar initial={query} /></div>{error ? <p className="status">API সংযোগ পাওয়া যাচ্ছে না।</p> : result && <><div className="toolbar"><span>{result.pagination.total.toLocaleString("bn-BD")}টি বই</span><select defaultValue={String(params.sort ?? "newest")} aria-label="সাজান"><option value="newest">নতুন আগে</option><option value="title">নাম অনুযায়ী</option><option value="price_asc">কম দাম আগে</option><option value="price_desc">বেশি দাম আগে</option></select></div><BookGrid books={result.data} /><div className="pagination">{result.pagination.page > 1 && <Link href={`/books?page=${result.pagination.page - 1}&q=${encodeURIComponent(query)}`}>আগের পাতা</Link>}<span>পৃষ্ঠা {result.pagination.page} / {result.pagination.totalPages || 1}</span>{result.pagination.page < result.pagination.totalPages && <Link href={`/books?page=${result.pagination.page + 1}&q=${encodeURIComponent(query)}`}>পরের পাতা</Link>}</div></>}</main></>;
}
