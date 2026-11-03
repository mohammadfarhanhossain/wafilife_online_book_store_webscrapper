# Wafilife Scraper & Catalog Database Pipeline

Production-grade web scraper, relational catalog database, and data integrity pipeline for **Wafilife** (https://www.wafilife.com), structured identically to Wafilife and Rokomari.

---

## Overview
- **Bookstore Name:** Wafilife
- **Website:** [https://www.wafilife.com](https://www.wafilife.com)
- **Category:** Islamic
- **Total Indexed Books:** 59,886
- **Database Engine:** SQLite (with FTS5 Full-Text Search) & MySQL Migrations

---

## Directory Layout
```
wafilife_scrapper/
├── data/
│   ├── raw/                  # Raw scraper outputs and cached HTTP payloads
│   ├── processed/            # Cleaned intermediate outputs
│   ├── clean/                # Production relational CSVs
│   ├── state/                # Crawl checkpoints & entity bookmarks
│   └── logs/                 # Execution and daily scheduler logs
├── database/
│   ├── migrations/           # MySQL / PostgreSQL schema migrations
│   │   └── 001_catalog_schema.sql
│   └── wafilife_catalog.sqlite3 # Populated relational SQLite database (Indexed & FTS5)
├── master.csv                # Complete Wafilife catalog with prices & URLs
├── clean_books.csv           # Relational books table with foreign keys
├── clean_authors.csv         # Deduplicated authors directory
├── clean_publishers.csv      # Deduplicated publishers directory
├── clean_subjects.csv        # Categories and topics
├── wafilife_pipeline.py        # Unified CLI crawler, cleaner, and database manager
├── run_wafilife_daily.ps1      # Windows Task Scheduler automation wrapper
├── docker-compose.yml        # MySQL container configuration
└── README.md                 # Project documentation
```

---

## CLI Usage

### 1. Verify Data & Database Integrity
Check CSV rows, SQLite database health, orphan foreign keys, and price distribution:
```powershell
python wafilife_pipeline.py --verify
```

### 2. Live Search
Search books directly from the online website and local indexed database:
```powershell
python wafilife_pipeline.py --search "প্যারাডক্সিক্যাল সাজিদ"
```

### 3. Rebuild Database from CSVs
Re-ingest clean CSVs and rebuild full-text search indexes:
```powershell
python wafilife_pipeline.py --db
```

### 4. Scheduled Daily Scraping
```powershell
powershell -ExecutionPolicy Bypass -File .\run_wafilife_daily.ps1
```
