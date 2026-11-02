import Link from "next/link";
import { Header } from "../../components/Header";
import { api, type Author, type Page } from "../../lib/api";
export default async function AuthorsPage() { const result = await api<Page<Author>>("/api/authors?limit=60"); return <><Header /><main className="content"><p className="eyebrow">লেখকেরা</p><h1>লেখকের নাম</h1><div className="entity-grid">{result.data.map((author) => <Link key={author.id} href={`/authors/${author.id}`}>{author.name}</Link>)}</div></main></>; }
