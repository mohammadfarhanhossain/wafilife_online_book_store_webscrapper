import test from "node:test";
import assert from "node:assert/strict";
import { parseBooksCsv, recommendBooks, searchBooks } from "./catalog.js";

const csv = [
  "book_id,book_name,author_id,author_name,publisher_id,publisher_name,subject_id,subject_name,main_price,wafilife_price",
  '1,"বাংলার প্রকৃতি",5,"তিশা রানী ঘোষ",598,"গ্রন্থ কুটির",21,"ছড়া, কবিতা ও আবৃত্তি",100,90',
  '2,"বাংলার ইতিহাস",3,"ইরফান শেখ",226,"আদিত্য প্রকাশ",9,"ইতিহাস ও ঐতিহ্য",600,550',
].join("\n");

test("parses quoted Bengali CSV fields", () => {
  const books = parseBooksCsv(csv);
  assert.equal(books[0].name, "বাংলার প্রকৃতি");
  assert.equal(books[0].subject, "ছড়া, কবিতা ও আবৃত্তি");
});

test("search ranks title matches before metadata matches", () => {
  const books = parseBooksCsv(csv);
  assert.equal(searchBooks(books, "বাংলার প্রকৃতি")[0].bookId, 1);
});

test("recommendations prefer the same subject", () => {
  const books = parseBooksCsv(csv);
  assert.equal(recommendBooks(books, books[0])[0].bookId, 2);
});
