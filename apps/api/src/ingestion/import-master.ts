import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { createDatabasePool, withTransaction } from "../db/database.js";
import { createUuidV7 } from "../db/uuidv7.js";
import { projectRoot } from "../config/paths.js";
import { prepareMasterCsv, type PreparedRow } from "./master-csv.js";

const rootDirectory = projectRoot();
const csvPath = process.env.MASTER_CSV_PATH ? path.resolve(process.env.MASTER_CSV_PATH) : path.join(rootDirectory, "master.csv");

type IdRow = RowDataPacket & { id: number };
type ExistingSourceRow = RowDataPacket & { source_book_id: number; book_id: Buffer; last_content_hash: string; canonical_content_hash: string; };
export type ImportReport = {
  sourceFile: string;
  batchId?: number;
  rowsRead: number;
  inserted: number;
  updated: number;
  unchanged: number;
  rejected: number;
  ambiguousReview: number;
  priceAnomalies: number;
  duplicateConflictCases: number;
  duplicateConflictRows: number;
  invalidRows: Array<{ rowNumber: number; reason: string }>;
};

function sourceRowHash(row: PreparedRow): string {
  return createHash("sha256").update(JSON.stringify({
    title: row.title,
    author: row.author,
    publisher: row.publisher,
    subject: row.subject,
    mainPrice: row.mainPrice,
    salePrice: row.salePrice,
  }), "utf8").digest("hex");
}

async function getEntityId(connection: Parameters<Parameters<typeof withTransaction>[1]>[0], table: "authors" | "publishers" | "subjects", name: string): Promise<number> {
  const normalized = name.toLocaleLowerCase();
  const [result] = await connection.query<ResultSetHeader>(
    `INSERT INTO ${table} (canonical_name, normalized_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE ${table === "authors" ? "author_id" : table === "publishers" ? "publisher_id" : "subject_id"} = LAST_INSERT_ID(${table === "authors" ? "author_id" : table === "publishers" ? "publisher_id" : "subject_id"})`,
    [name || `Unknown ${table.slice(0, -1)}` , normalized || `unknown-${table}`],
  );
  return Number(result.insertId);
}

async function upsertBook(connection: Parameters<Parameters<typeof withTransaction>[1]>[0], row: PreparedRow, sourceId: number, batchId: number, report: ImportReport): Promise<Buffer> {
  const snapshotHash = sourceRowHash(row);
  const [existingRows] = await connection.query<ExistingSourceRow[]>(
    "SELECT sb.source_book_id, sb.book_id, sb.last_content_hash, b.canonical_content_hash FROM source_books sb JOIN books b ON b.book_id = sb.book_id WHERE sb.source_id = ? AND sb.source_book_key = ? FOR UPDATE",
    [sourceId, row.sourceBookKey],
  );
  const existing = existingRows[0];
  const authorId = await getEntityId(connection, "authors", row.author);
  const publisherId = await getEntityId(connection, "publishers", row.publisher);
  const subjectId = await getEntityId(connection, "subjects", row.subject);
  const observedAt = new Date();
  let bookId: Buffer;
  let sourceBookId: number;

  if (existing) {
    bookId = existing.book_id;
    sourceBookId = existing.source_book_id;
    const contentChanged = existing.canonical_content_hash !== row.contentHash;
    if (existing.last_content_hash === snapshotHash) {
      report.unchanged += 1;
    } else {
      report.updated += 1;
      if (contentChanged) {
        await connection.query(
          "UPDATE books SET canonical_title = ?, normalized_title = ?, canonical_content_hash = ?, updated_at = CURRENT_TIMESTAMP(6) WHERE book_id = ?",
          [row.title, row.title.toLocaleLowerCase(), row.contentHash, bookId],
        );
      }
    }
  } else {
    bookId = createUuidV7();
    const [insertBook] = await connection.query<ResultSetHeader>(
      "INSERT INTO books (book_id, canonical_title, normalized_title, canonical_content_hash) VALUES (?, ?, ?, ?)",
      [bookId, row.title, row.title.toLocaleLowerCase(), row.contentHash],
    );
    void insertBook;
    const [insertSource] = await connection.query<ResultSetHeader>(
      `INSERT INTO source_books
        (source_id, source_book_key, book_id, first_seen_at, last_seen_at, last_content_hash, match_method, match_confidence)
       VALUES (?, ?, ?, ?, ?, ?, 'external_id', 1.0000)`,
      [sourceId, row.sourceBookKey, bookId, observedAt, observedAt, snapshotHash],
    );
    sourceBookId = Number(insertSource.insertId);
    report.inserted += 1;
  }

  await connection.query(
    `UPDATE source_books SET last_seen_at = ?, last_content_hash = ?, status = 'active' WHERE source_book_id = ?`,
    [observedAt, snapshotHash, sourceBookId],
  );
  await connection.query(
    `INSERT INTO source_book_state
      (source_book_id, source_title, source_author_text, source_publisher_text, source_subject_text, list_price, sale_price, anomaly_flags, raw_payload, observed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE source_title = VALUES(source_title), source_author_text = VALUES(source_author_text), source_publisher_text = VALUES(source_publisher_text), source_subject_text = VALUES(source_subject_text), list_price = VALUES(list_price), sale_price = VALUES(sale_price), anomaly_flags = VALUES(anomaly_flags), raw_payload = VALUES(raw_payload), observed_at = VALUES(observed_at)`,
    [sourceBookId, row.title, row.author, row.publisher, row.subject, row.mainPrice, row.salePrice, JSON.stringify(row.anomalyFlags), JSON.stringify(row), observedAt],
  );

  if (!existing || existing.last_content_hash !== snapshotHash) {
    await connection.query(
      "INSERT INTO price_history (source_book_id, list_price, sale_price, anomaly_flags, observed_at, batch_id) VALUES (?, ?, ?, ?, ?, ?)",
      [sourceBookId, row.mainPrice, row.salePrice, JSON.stringify(row.anomalyFlags), observedAt, batchId],
    );
  }
  await connection.query("DELETE FROM book_authors WHERE book_id = ?", [bookId]);
  await connection.query("DELETE FROM book_publishers WHERE book_id = ?", [bookId]);
  await connection.query("DELETE FROM book_subjects WHERE book_id = ?", [bookId]);
  await connection.query("INSERT INTO book_authors (book_id, author_id) VALUES (?, ?)", [bookId, authorId]);
  await connection.query("INSERT INTO book_publishers (book_id, publisher_id) VALUES (?, ?)", [bookId, publisherId]);
  await connection.query("INSERT INTO book_subjects (book_id, subject_id) VALUES (?, ?)", [bookId, subjectId]);
  await connection.query(
    "INSERT INTO legacy_book_ids (legacy_system, legacy_book_id, book_id, confidence) VALUES ('master.csv', ?, ?, 1.0000) ON DUPLICATE KEY UPDATE book_id = book_id",
    [row.legacyBookId, bookId],
  );
  if (!existing || existing.canonical_content_hash !== row.contentHash) {
    await connection.query(
      "INSERT INTO embedding_outbox (book_id, content_hash, reason, status, available_at) VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE status = 'pending', available_at = CURRENT_TIMESTAMP(6)",
      [bookId, row.contentHash, existing ? "content_changed" : "created"],
    );
  }
  if (row.anomalyFlags.length > 0) report.priceAnomalies += 1;
  return bookId;
}

export async function importMasterCsv(csvFile = csvPath): Promise<ImportReport> {
  const csv = await readFile(csvFile, "utf8");
  const prepared = prepareMasterCsv(csv);
  const report: ImportReport = {
    sourceFile: csvFile,
    rowsRead: prepared.rows.length + prepared.invalidRows.length,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    rejected: prepared.invalidRows.length,
    ambiguousReview: prepared.duplicateConflicts.length,
    priceAnomalies: 0,
    duplicateConflictCases: prepared.duplicateConflicts.length,
    duplicateConflictRows: prepared.duplicateConflicts.reduce((total, item) => total + item.rowNumbers.length, 0),
    invalidRows: prepared.invalidRows,
  };
  const pool = createDatabasePool();
  try {
    await withTransaction(pool, async (connection) => {
      const [sourceRows] = await connection.query<IdRow[]>("SELECT source_id AS id FROM sources WHERE code = 'csv_legacy'");
      if (!sourceRows[0]) throw new Error("Missing csv_legacy source. Run npm run db:migrate first.");
      const sourceId = sourceRows[0].id;
      const fileHash = createHash("sha256").update(csv, "utf8").digest("hex");
      const [batchResult] = await connection.query<ResultSetHeader>(
        "INSERT INTO ingestion_batches (source_id, input_type, file_name, file_hash, status, row_count) VALUES (?, 'csv', ?, ?, 'received', ?) ON DUPLICATE KEY UPDATE batch_id = LAST_INSERT_ID(batch_id), status = status",
        [sourceId, path.basename(csvFile), fileHash, report.rowsRead],
      );
      const batchId = Number(batchResult.insertId);
      report.batchId = batchId;
      const [existingBatchRows] = await connection.query<Array<RowDataPacket & { status: string }>>("SELECT status FROM ingestion_batches WHERE batch_id = ?", [batchId]);
      if (existingBatchRows[0]?.status === "imported" || existingBatchRows[0]?.status === "partial") {
        report.inserted = 0;
        report.updated = 0;
        report.unchanged = prepared.rows.length;
        return;
      }
      for (const invalid of prepared.invalidRows) {
        await connection.query(
          "INSERT INTO staging_book_rows (batch_id, `row_number`, raw_row, validation_status, error_message) VALUES (?, ?, JSON_OBJECT(), 'invalid', ?)",
          [batchId, invalid.rowNumber, invalid.reason],
        );
      }
      for (const conflict of prepared.duplicateConflicts) {
        await connection.query(
          "INSERT INTO staging_book_rows (batch_id, `row_number`, source_book_key, raw_row, validation_status, error_message) VALUES (?, ?, ?, JSON_OBJECT(), 'review', ?)",
          [batchId, conflict.rowNumbers[0], `legacy:${conflict.legacyBookId}`, `conflicting duplicate rows: ${conflict.rowNumbers.join(", ")}`],
        );
      }
      for (const row of prepared.rows) {
        await connection.query(
          "INSERT INTO staging_book_rows (batch_id, `row_number`, source_book_key, raw_row, normalized_row, validation_status, matched_book_id) VALUES (?, ?, ?, ?, ?, 'valid', NULL)",
          [batchId, row.rowNumber, row.sourceBookKey, JSON.stringify(row), JSON.stringify(row)],
        );
        const bookId = await upsertBook(connection, row, sourceId, batchId, report);
        await connection.query("UPDATE staging_book_rows SET matched_book_id = ? WHERE batch_id = ? AND `row_number` = ?", [bookId, batchId, row.rowNumber]);
      }
      await connection.query("UPDATE ingestion_batches SET status = ?, error_count = ?, completed_at = CURRENT_TIMESTAMP(6) WHERE batch_id = ?", [report.rejected > 0 || report.ambiguousReview > 0 ? "partial" : "imported", report.rejected + report.ambiguousReview, batchId]);
    });
  } finally {
    await pool.end();
  }
  const reportDirectory = path.join(rootDirectory, "data", "logs", "import_reports");
  await mkdir(reportDirectory, { recursive: true });
  const reportPath = path.join(reportDirectory, `master_import_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(reportPath, JSON.stringify({ ...report, reportPath }, null, 2), "utf8");
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  return report;
}

if (process.argv[1]?.endsWith("import-master.ts")) {
  importMasterCsv(process.argv[2] ? path.resolve(process.argv[2]) : csvPath).catch((error: unknown) => {
    console.error("[IMPORT] failed", error);
    process.exitCode = 1;
  });
}
