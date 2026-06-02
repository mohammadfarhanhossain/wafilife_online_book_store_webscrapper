Wafilife scraper — scheduling and safe-run notes

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
