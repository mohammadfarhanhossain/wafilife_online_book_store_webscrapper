import Link from "next/link";
import { api, type Book, type Page, type Subject } from "../lib/api";
import { Header } from "../components/Header";
import { SearchBar } from "../components/SearchBar";
import { BookGrid } from "../components/BookCard";
import { Footer } from "../components/Footer";

export default async function HomePage() {
  let books: Book[] = [];
  let subjects: Subject[] = [];
  try { books = (await api<Page<Book>>("/api/books?limit=8&sort=newest")).data; subjects = (await api<Page<Subject>>("/api/subjects?limit=12")).data; } catch { /* loading/error routes handle unavailable API during navigation */ }
  return <><Header /><main><section className="hero" id="top"><div className="hero-copy"><p className="eyebrow">আপনার পরের প্রিয় বই</p><h1>একটি বই থেকে<br /><em>আরও অনেক গল্প।</em></h1><p className="hero-text">বাংলা বইয়ের বিশাল ভাণ্ডারে খুঁজুন আপনার মনের মতো পাঠ। বই, লেখক আর বিষয় মিলিয়ে তৈরি হোক আপনার নিজস্ব পাঠের যাত্রা।</p><SearchBar /></div><div className="hero-art" aria-hidden="true"><div className="sun"></div><div className="open-book"><span></span><span></span></div><p>read<br />slowly</p></div></section><section className="content"><div className="section-heading"><div><p className="eyebrow">বইয়ের তাক</p><h2>আজকের আবিষ্কার</h2></div><Link className="text-link" href="/books">সব বই দেখুন →</Link></div>{books.length ? <BookGrid books={books} /> : <p className="status">বইয়ের catalog এখন প্রস্তুত হচ্ছে...</p>}</section><section className="content subject-band"><p className="eyebrow">বিষয় বেছে নিন</p><h2>যেদিকে মন যায়</h2><div className="subject-grid">{subjects.map((subject) => <Link key={subject.id} href={`/subjects/${subject.id}`}>{subject.name}</Link>)}</div></section></main><Footer /></>;
}
