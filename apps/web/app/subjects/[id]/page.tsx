import { notFound } from "next/navigation";
import { api, type Subject, type Book, type Page } from "../../../lib/api";
import { Header } from "../../../components/Header";
import { BookGrid } from "../../../components/BookCard";
export default async function SubjectPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; let subject: Subject; let books: Page<Book>; try { subject = (await api<{ data: Subject }>(`/api/subjects/${id}`)).data; books = await api<Page<Book>>(`/api/subjects/${id}/books`); } catch { notFound(); } return <><Header /><main className="content"><p className="eyebrow">বিষয়</p><h1>{subject!.name}</h1><BookGrid books={books!.data} /></main></>; }
