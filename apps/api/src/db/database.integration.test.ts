import test from "node:test";
import assert from "node:assert/strict";
import { createDatabasePool } from "./database.js";
import type { RowDataPacket } from "mysql2";

test("MySQL migration constraints and seed data are available when integration tests are enabled", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  const pool = createDatabasePool();
  try {
    const [tables] = await pool.query<Array<RowDataPacket & { Tables_in_wafilife: string }>>("SHOW TABLES");
    const names = tables.map((row) => Object.values(row)[0]);
    assert.ok(names.includes("books"));
    assert.ok(names.includes("legacy_book_ids"));
    assert.ok(names.includes("staging_book_rows"));
    assert.ok(names.includes("embedding_outbox"));
    const [sources] = await pool.query<Array<RowDataPacket & { code: string }>>("SELECT code FROM sources ORDER BY code");
    assert.deepEqual(sources.map((row) => row.code), ["csv_legacy", "rokomari", "wafilife"]);
  } finally {
    await pool.end();
  }
});