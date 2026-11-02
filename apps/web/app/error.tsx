"use client";

export default function ErrorState({ reset }: { reset: () => void }) { return <main className="content"><div className="error-state"><h2>তথ্য পাওয়া গেল না</h2><p>সাময়িক সমস্যা হয়েছে। আবার চেষ্টা করুন।</p><button onClick={reset}>আবার চেষ্টা করুন</button></div></main>; }
