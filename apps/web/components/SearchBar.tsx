"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SearchBar({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const [smart, setSmart] = useState(false);
  const router = useRouter();
  return <form className="search" onSubmit={(event) => { event.preventDefault(); router.push(`/search?q=${encodeURIComponent(value)}${smart ? "&mode=semantic" : ""}`); }}><span aria-hidden="true">⌕</span><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="বই, লেখক বা বিষয় খুঁজুন" /><label className="smart-toggle"><input type="checkbox" checked={smart} onChange={(event) => setSmart(event.target.checked)} /> smart</label><button type="submit">খুঁজুন</button></form>;
}
