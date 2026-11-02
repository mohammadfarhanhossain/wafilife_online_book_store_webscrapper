import { notFound } from "next/navigation";
import { api, type Author, type Book, type Page } from "../../../lib/api";
import { Header } from "../../../components/Header";
import { BookGrid } from "../../../components/BookCard";
export default async function AuthorPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; let author: Author; let books: Page<Book>; try { author = (await api<{ data: Author }>(`/api/authors/${id}`)).data; books = await api<Page<Book>>(`/api/authors/${id}/books`); } catch { notFound(); } return <><Header /><main className="content"><p className="eyebrow">লেখক</p><h1>{author!.name}</h1><BookGrid books={books!.data} /></main></>; }
