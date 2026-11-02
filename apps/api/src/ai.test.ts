import test from "node:test";
import assert from "node:assert/strict";
import { FallbackQueryUnderstanding, bookDocument } from "./ai.js";

test("embedding document is deterministic, Bengali-safe, and excludes price", () => {
  const document = bookDocument({ title: "বাংলা ইতিহাস", authors: ["লেখক"], publishers: ["প্রকাশক"], subjects: ["ইতিহাস"], language: "bn", description: "একটি বই", isbn13: "123" });
  assert.match(document, /বাংলা ইতিহাস/);
  assert.match(document, /ISBN: 123/);
  assert.doesNotMatch(document, /price|৳/i);
});

test("fallback query understanding preserves normal-search availability", async () => {
  const intent = await new FallbackQueryUnderstanding().understand("বাংলা বই ৫০০ টাকার মধ্যে");
  assert.equal(intent.expandedQuery, "বাংলা বই ৫০০ টাকার মধ্যে");
  assert.equal(intent.maxPrice, 500);
  assert.ok(intent.keywords.length > 0);
});