import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "../config/paths.js";

test("V1 migration contains approved identity and integrity boundaries", async () => {
  const migration = await readFile(path.join(projectRoot(), "database/migrations/001_catalog_schema.sql"), "utf8");
  assert.match(migration, /book_id BINARY\(16\) NOT NULL PRIMARY KEY/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS legacy_book_ids/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS source_books/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS staging_book_rows/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS embedding_outbox/);
  assert.match(migration, /UNIQUE KEY uq_embedding_outbox_book_hash_status/);
  assert.doesNotMatch(migration.toLowerCase(), /create table editions/);
});

test("source and relationship foreign keys use non-destructive delete behavior", async () => {
  const migration = await readFile(path.join(projectRoot(), "database/migrations/001_catalog_schema.sql"), "utf8");
  assert.match(migration, /fk_source_books_book[\s\S]*ON UPDATE CASCADE ON DELETE RESTRICT/);
  assert.match(migration, /fk_book_authors_book[\s\S]*ON UPDATE CASCADE ON DELETE CASCADE/);
  assert.match(migration, /fk_source_book_state_source_book[\s\S]*ON UPDATE CASCADE ON DELETE CASCADE/);
});