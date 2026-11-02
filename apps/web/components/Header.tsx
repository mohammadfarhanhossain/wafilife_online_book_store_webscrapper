import Link from "next/link";

export function Header() {
  return <header className="topbar"><Link className="brand" href="/"><span className="brand-mark">প</span><span>পাতার ভেতর</span></Link><nav><Link href="/books">বইয়ের তাক</Link><Link href="/subjects">বিষয়</Link><Link href="/authors">লেখক</Link><Link href="/publishers">প্রকাশক</Link></nav><Link className="quiet-button" href="/books" aria-label="বই খুঁজুন">⌕</Link></header>;
}
