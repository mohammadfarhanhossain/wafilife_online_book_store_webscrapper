import { notFound } from "next/navigation";
import { api, type Publisher, type Book, type Page } from "../../../lib/api";
import { Header } from "../../../components/Header";
import { BookGrid } from "../../../components/BookCard";
export default async function PublisherPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; let publisher: Publisher; let books: Page<Book>; try { publisher = (await api<{ data: Publisher }>(`/api/publishers/${id}`)).data; books = await api<Page<Book>>(`/api/publishers/${id}/books`); } catch { notFound(); } return <><Header /><main className="content"><p className="eyebrow">প্রকাশক</p><h1>{publisher!.name}</h1><BookGrid books={books!.data} /></main></>; }
