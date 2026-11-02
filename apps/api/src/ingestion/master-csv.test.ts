import test from "node:test";
import assert from "node:assert/strict";
import { parsePrice, prepareMasterCsv } from "./master-csv.js";

test("strips UTF-8 BOM and preserves quoted comma fields", () => {
  const csv = '\uFEFFbook_id,book_name,author_id,author_name,publisher_id,publisher_name,subject_id,subject_name,main_price,wafilife_price\n1,"বাংলার প্রকৃতি",5,"তিশা রানী ঘোষ",598,"গ্রন্থ কুটির",21,"ছড়া, কবিতা ও আবৃত্তি",100,90';
  const result = prepareMasterCsv(csv);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].title, "বাংলার প্রকৃতি");
  assert.match(result.rows[0].subject, /^.+, কবিতা ও আবৃত্তি$/);
  assert.equal(result.rows[0].rowNumber, 2);
});

test("normalizes Bengali digits and records price anomalies without changing values", () => {
  assert.equal(parsePrice("৳১,২৫০"), 1250);
  const csv = [
    "book_id,book_name,author_id,author_name,publisher_id,publisher_name,subject_id,subject_name,main_price,wafilife_price",
    "7,বই,1,লেখক,1,প্রকাশক,1,বিষয়,100,120",
  ].join("\n");
  const result = prepareMasterCsv(csv);
  assert.deepEqual(result.rows[0].anomalyFlags, ["sale_price_greater_than_list_price"]);
  assert.equal(result.rows[0].mainPrice, 100);
  assert.equal(result.rows[0].salePrice, 120);
});

test("does not merge conflicting duplicate legacy IDs", () => {
  const csv = [
    "book_id,book_name,author_id,author_name,publisher_id,publisher_name,subject_id,subject_name,main_price,wafilife_price",
    "7,প্রথম বই,1,লেখক,1,প্রকাশক,1,বিষয়,100,100",
    "7,অন্য বই,2,অন্য লেখক,2,অন্য প্রকাশক,2,অন্য বিষয়,200,180",
  ].join("\n");
  const result = prepareMasterCsv(csv);
  assert.equal(result.rows.length, 1);
  assert.equal(result.duplicateConflicts.length, 1);
  assert.deepEqual(result.duplicateConflicts[0].rowNumbers, [2, 3]);
});