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
