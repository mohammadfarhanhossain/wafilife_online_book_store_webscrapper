import Link from "next/link";
import type { Book } from "../lib/api";

export function BookCard({ book }: { book: Book }) {
  return <Link className="book-card" href={`/books/${book.id}`}><span className="book-cover"><span>পাতার<br />ভেতর</span></span><span className="book-info"><strong>{book.title}</strong><small>{book.authors[0]?.name || "অজানা লেখক"}</small><small className="muted">{book.subjects[0]?.name || "বিবিধ"}</small><span className="price">{book.salePrice && book.mainPrice && book.salePrice < book.mainPrice ? <><del>৳{book.mainPrice.toLocaleString("bn-BD")}</del> ৳{book.salePrice.toLocaleString("bn-BD")}</> : `৳${(book.salePrice ?? book.mainPrice ?? 0).toLocaleString("bn-BD")}`}</span></span></Link>;
}

export function BookGrid({ books }: { books: Book[] }) { return <div className="book-grid">{books.map((book) => <BookCard key={book.id} book={book} />)}</div>; }
