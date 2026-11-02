import "dotenv/config";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { aiConfig, bookDocument, ChromaVectorStore, OllamaEmbeddingProvider } from "./ai.js";
import { createDatabasePool } from "./db/database.js";

type Job = RowDataPacket & { outbox_id: number; book_id: Buffer; content_hash: string; attempt_count: number; title: string; isbn13: string | null; language_code: string; description: string | null; authors: string | null; publishers: string | null; subjects: string | null };

export async function indexEmbeddings(pool: Pool, batchSize = Number(process.env.EMBEDDING_BATCH_SIZE ?? 16)): Promise<{ processed: number; succeeded: number; failed: number }> {
  const config = aiConfig();
  const provider = new OllamaEmbeddingProvider(config);
  const store = new ChromaVectorStore(config);
  let processed = 0; let succeeded = 0; let failed = 0;
  const maxJobs = Number(process.env.EMBEDDING_MAX_JOBS ?? 0);
  while (true) {
    const fetchSize = maxJobs > 0 ? Math.min(batchSize, maxJobs - processed) : batchSize;
    if (fetchSize <= 0) break;
    const [jobs] = await pool.query<Job[]>(`SELECT o.outbox_id, o.book_id, o.content_hash, o.attempt_count, b.canonical_title title, b.isbn13, b.language_code, b.description, GROUP_CONCAT(DISTINCT a.canonical_name SEPARATOR ', ') authors, GROUP_CONCAT(DISTINCT p.canonical_name SEPARATOR ', ') publishers, GROUP_CONCAT(DISTINCT s.canonical_name SEPARATOR ', ') subjects FROM embedding_outbox o JOIN books b ON b.book_id=o.book_id LEFT JOIN book_authors ba ON ba.book_id=b.book_id LEFT JOIN authors a ON a.author_id=ba.author_id LEFT JOIN book_publishers bp ON bp.book_id=b.book_id LEFT JOIN publishers p ON p.publisher_id=bp.publisher_id LEFT JOIN book_subjects bs ON bs.book_id=b.book_id LEFT JOIN subjects s ON s.subject_id=bs.subject_id WHERE o.status IN ('pending','failed') AND o.available_at <= CURRENT_TIMESTAMP(6) GROUP BY o.outbox_id, o.book_id, o.content_hash, o.attempt_count, b.canonical_title, b.isbn13, b.language_code, b.description ORDER BY o.outbox_id LIMIT ?`, [fetchSize]);
    if (!jobs.length) break;
    for (let start = 0; start < jobs.length; start += batchSize) {
      const batch = jobs.slice(start, start + batchSize);
      const ids = batch.map((job) => job.book_id.toString("hex").toUpperCase());
      try {
        const documents = batch.map((job) => bookDocument({ title: job.title, authors: job.authors ? job.authors.split(', ') : [], publishers: job.publishers ? job.publishers.split(', ') : [], subjects: job.subjects ? job.subjects.split(', ') : [], description: job.description, language: job.language_code, isbn13: job.isbn13 }));
        const vectors = await provider.embedTexts(documents);
        if (vectors.length !== documents.length) throw new Error("Embedding provider returned an incomplete batch");
        await store.upsert(ids, vectors, batch.map((job) => ({ book_id: ids[batch.indexOf(job)], content_hash: job.content_hash, embedding_model: config.model, embedding_version: config.version })), documents);
        const connection = await pool.getConnection();
        try { await connection.beginTransaction(); for (let index = 0; index < batch.length; index += 1) { const job = batch[index]; await connection.query("UPDATE embedding_outbox SET status='completed', locked_at=NULL, last_error=NULL WHERE outbox_id=?", [job.outbox_id]); await connection.query("INSERT INTO embedding_records (book_id, embedding_provider, embedding_model, embedding_version, content_hash, collection_name, vector_key, status, generated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE content_hash=VALUES(content_hash), collection_name=VALUES(collection_name), vector_key=VALUES(vector_key), status='active', generated_at=CURRENT_TIMESTAMP(6), error_message=NULL", [job.book_id, config.provider, config.model, config.version, job.content_hash, config.collection, `book:${ids[index]}`]); } await connection.commit(); } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
        succeeded += batch.length;
      } catch (error) {
        failed += batch.length; const message = error instanceof Error ? error.message : String(error);
        for (const job of batch) await pool.query("UPDATE embedding_outbox SET status='failed', attempt_count=attempt_count+1, available_at=DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 15 MINUTE), last_error=? WHERE outbox_id=?", [message, job.outbox_id]);
        console.error(`[EMBEDDINGS] batch failed: ${message}`);
        if (process.env.EMBEDDING_FAIL_FAST === "1") throw error;
      }
      processed += batch.length; console.log(`[EMBEDDINGS] processed=${processed} succeeded=${succeeded} failed=${failed}`);
    }
    if (failed > 0 && succeeded === 0) break;
  }
  return { processed, succeeded, failed };
}

if (process.argv[1]?.endsWith("embeddings-index.ts")) { const pool = createDatabasePool(); indexEmbeddings(pool).then((result) => { console.log(JSON.stringify(result)); return pool.end(); }).catch(async (error) => { console.error("[EMBEDDINGS] unavailable", error instanceof Error ? error.message : error); await pool.end(); process.exitCode = 1; }); }
