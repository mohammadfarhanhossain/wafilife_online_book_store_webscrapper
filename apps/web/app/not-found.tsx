import Link from "next/link";
import { Header } from "../components/Header";

export default function NotFound() { return <><Header /><main className="content empty-state"><p className="eyebrow">পাতা পাওয়া যায়নি</p><h1>এই বইটি তাকটিতে নেই।</h1><Link className="primary-link" href="/books">বইয়ের তাকে ফিরুন</Link></main></>; }
