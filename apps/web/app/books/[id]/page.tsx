import Link from "next/link";
import { notFound } from "next/navigation";
import { api, type Book } from "../../../lib/api";
import { Header } from "../../../components/Header";
import { Footer } from "../../../components/Footer";
import { BookGrid } from "../../../components/BookCard";

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let book: Book;
  try { const result = await api<{ data: Book }>(`/api/books/${id}`); book = result.data; } catch { notFound(); }
  let recommendations: Book[] = [];
  try { recommendations = (await api<{ data: Book[] }>(`/api/books/${id}/recommendations`)).data; } catch { /* recommendations are optional */ }
  return <><Header /><main className="content detail"><div className="detail-cover"><span>পাতার<br />ভেতর</span></div><article><p className="eyebrow">বইয়ের পাতা</p><h1>{book!.title}</h1><p className="detail-meta">{book!.authors.map((author) => <Link key={author.id} href={`/authors/${author.id}`}>{author.name}</Link>)}</p><p className="detail-meta">{book!.publishers.map((publisher) => <Link key={publisher.id} href={`/publishers/${publisher.id}`}>{publisher.name}</Link>)}</p><p className="detail-meta">{book!.subjects.map((subject) => <Link key={subject.id} href={`/subjects/${subject.id}`}>{subject.name}</Link>)}</p><div className="detail-price">৳{(book!.salePrice ?? book!.mainPrice ?? 0).toLocaleString("bn-BD")}</div><p className="availability">{book!.availability === "in_stock" ? "মজুত আছে" : "প্রাপ্যতা যাচাইাধীন"}</p>{book!.isbn13 && <p>ISBN: {book!.isbn13}</p>}<p className="description">{book!.description || "এই বই সম্পর্কে আরও তথ্য শিগগিরই যোগ হবে।"}</p></article></main>{recommendations.length > 0 && <section className="recommendation-band"><div className="content"><p className="eyebrow">আপনার জন্য</p><h2>এই বইয়ের মতো আরও বই</h2><BookGrid books={recommendations} /></div></section>}<Footer /></>;
}
