-afilife scraper — scheduling and safe-run notes

Daily scraping

- Use the project's virtual environment and run the pipeline with `--scrape`.
- Example (PowerShell):

```powershell
& ".\.venv\Scripts\python.exe" "wafilife_pipeline.py" --scrape
```

Atomic updates

- The pipeline now writes intermediate CSVs to temporary files and replaces existing files only after a successful write. This prevents partial or corrupted outputs from overwriting previous good data during scheduled runs.

Resume behavior

- Progress markers are stored in `data/state/scraping_progress_authors.txt` (and similar files for publishers/subjects). Scheduled runs will resume from the last saved entity if present.

Replace-on-success for daily runs

- To run daily but keep previous data until a successful run completes, schedule the above command (Task Scheduler on Windows or cron on *nix). The pipeline will replace raw/processed/clean CSVs only after successful writes.

Upgrade consent

- Please confirm before I make further code changes or upgrades to the scraping logic; I will not deploy changes automatically.

How to run (short)

- Full fresh scrape (rebuild entity lists, start from scratch):

```powershell
& '.\.venv\Scripts\python.exe' 'wafilife_pipeline.py' --scrape --force-list
```

- Resume scrape (use saved progress; do not force lists):

```powershell
& '.\.venv\Scripts\python.exe' 'wafilife_pipeline.py' --scrape
```

- Only build clean CSVs (no DB upload):

```powershell
& '.\.venv\Scripts\python.exe' 'wafilife_pipeline.py' --build-only
```

Where outputs & state live

- Processed book rows: `data/processed/Wafilife_Authors_Data.csv` (and similar files for publishers/subjects)
- Resume/progress files: `data/state/scraping_progress_authors.txt` (one per entity)
- Clean CSVs & master: top-level `clean_*.csv` and `master.csv`

What the pipeline does (brief)

- `--scrape`: scrapes lists (authors/publishers/subjects) and then scrapes books per entity.
- Writes per-page progress to the `data/state/` files so runs can resume mid-entity.
- Detects blocking/captcha and stops, preserving progress for the next run.
- After scraping, `--build-only` builds merged `all_scraped_book_rows.csv` and `clean_*.csv`.
- Without `--build-only`, it uploads the tables to MySQL and creates `master`.

Troubleshooting quick tips

- PermissionError writing state: close editors/antivirus that may lock files; rerun (script now retries).
- Network/DNS errors: wait a bit and re-run; progress is saved so no data loss.
- If blocked by captcha, wait longer or run later — the script stops and saves the next page to resume.

Questions or next steps

- Want me to run a fresh full scrape now, or re-run the previously failed run? Reply with `run now` or `resume`.

AI Bookstore foundation
-----------------------

The repository now includes a small TypeScript monorepo for the bookstore UI and API:

- `apps/web`: Next.js storefront with Bengali search and recommendation UI.
- `apps/api`: Node.js TypeScript API. It reads `master.csv` by default and exposes `/health`, `/api/books?q=...`, and `/api/recommendations?bookId=...`.
- `services/ai`: Python FastAPI boundary for Ollama embeddings and future Chroma-backed ranking.
- `database/migrations/001_initial_catalog.sql`: initial MySQL catalog and interaction tables.

Setup
-----

Node.js 20+ and npm are required. From the project root:

```powershell
npm install
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
npm run dev
```

The web app runs on `http://localhost:3000` and the API on `http://localhost:4000`. The current catalog source is the generated `master.csv`; the MySQL migration is intentionally separate so importing the existing CSV can be introduced as an explicit job without silently changing the scraper schema.

Database and AI services
------------------------

Set real credentials in environment variables only. Do not commit `.env` files. Once Docker is available, `docker compose up -d mysql chroma` starts the local MySQL and Chroma services. The migration creates new tables only; it does not alter the scraper's existing tables or CSV outputs.

The current recommendation implementation is deterministic metadata matching. The next AI increment should embed normalized book text through `services/ai`, persist vectors in Chroma, and blend semantic similarity with the interaction signals in `user_book_interactions`.

V1 MySQL catalog import
-----------------------

The approved V1 database is separate from the legacy destructive `upload_sql()` path. Do not run that function against the V1 database. The new importer uses `master.csv` as a read-only input, generates UUIDv7 canonical book IDs, and preserves each existing numeric CSV ID in `legacy_book_ids`.

From the repository root, after setting real values in `apps/api/.env`:

```powershell
npm install
npm run db:migrate
npm run import:master
npm test
```

The importer creates a JSON report under `data/logs/import_reports/`. It reports inserted, updated, unchanged, rejected, review/ambiguous, price anomaly, and duplicate/conflict counts. Re-running the same CSV file is idempotent and does not create another import batch or duplicate catalog rows.

To import a different CSV without changing the repository datasets:

```powershell
npm run import:master -- "C:\path\to\input.csv"
```

The importer never derives canonical IDs from row order, never automatically merges by title alone, and never silently changes source prices.
