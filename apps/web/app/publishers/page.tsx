import Link from "next/link";
import { Header } from "../../components/Header";
import { api, type Publisher, type Page } from "../../lib/api";
export default async function PublishersPage() { const result = await api<Page<Publisher>>("/api/publishers?limit=60"); return <><Header /><main className="content"><p className="eyebrow">প্রকাশকেরা</p><h1>প্রকাশনা সংস্থা</h1><div className="entity-grid">{result.data.map((publisher) => <Link key={publisher.id} href={`/publishers/${publisher.id}`}>{publisher.name}</Link>)}</div></main></>; }
