import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { createDatabasePool } from "./database.js";
import { projectRoot } from "../config/paths.js";

function statements(sql: string): string[] {
  return sql.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const pool = createDatabasePool();
  try {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const migrationDirectory = path.join(projectRoot(), "database", "migrations");
    const files = (await readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();
    const [appliedRows] = await pool.query<Array<RowDataPacket & { version: string }>>("SELECT version FROM schema_migrations");
    const applied = new Set(appliedRows.map((row) => row.version));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(migrationDirectory, file), "utf8");
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        for (const statement of statements(sql)) await connection.query(statement);
        await connection.query("INSERT INTO schema_migrations (version) VALUES (?)", [file]);
        await connection.commit();
        console.log(`[MIGRATE] applied ${file}`);
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("[MIGRATE] failed", error);
  process.exitCode = 1;
});
