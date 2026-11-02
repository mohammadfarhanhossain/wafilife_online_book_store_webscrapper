import Link from "next/link";
import { Header } from "../../components/Header";
import { api, type Subject, type Page } from "../../lib/api";
export default async function SubjectsPage() { const result = await api<Page<Subject>>("/api/subjects?limit=60"); return <><Header /><main className="content"><p className="eyebrow">বিষয়</p><h1>আপনার আগ্রহের দিক</h1><div className="subject-grid">{result.data.map((subject) => <Link key={subject.id} href={`/subjects/${subject.id}`}>{subject.name}</Link>)}</div></main></>; }
