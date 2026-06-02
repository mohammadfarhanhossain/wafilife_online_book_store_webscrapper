import argparse
import logging
import os
import random
import re
import shutil
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import requests
from bs4 import BeautifulSoup
from requests.exceptions import RequestException
from sqlalchemy import create_engine, text


stdout_reconfigure = getattr(sys.stdout, "reconfigure", None)
if callable(stdout_reconfigure):
    stdout_reconfigure(encoding="utf-8")


PROJECT_DIR = Path(__file__).resolve().parent
RAW_DIR = PROJECT_DIR / "data" / "raw"
PROCESSED_DIR = PROJECT_DIR / "data" / "processed"
STATE_DIR = PROJECT_DIR / "data" / "state"
LOG_DIR = PROJECT_DIR / "data" / "logs"

for directory in [RAW_DIR, PROCESSED_DIR, STATE_DIR, LOG_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# --- Logging Configuration ---
log_formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
log_file = LOG_DIR / "wafilife_scrape.log"
err_file = LOG_DIR / "wafilife_scrape.err.log"

# Main File Handler (INFO and above)
file_handler = logging.FileHandler(log_file, encoding="utf-8")
file_handler.setFormatter(log_formatter)
file_handler.setLevel(logging.INFO)

# Error File Handler (ERROR and above)
error_handler = logging.FileHandler(err_file, encoding="utf-8")
error_handler.setFormatter(log_formatter)
error_handler.setLevel(logging.ERROR)

# Console Handler
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(log_formatter)
console_handler.setLevel(logging.INFO)

# Configure Root Logger
logging.basicConfig(
    level=logging.INFO,
    handlers=[file_handler, error_handler, console_handler]
)
logger = logging.getLogger(__name__)


DB_USER = os.getenv("WAFILIFE_DB_USER", "root")
DB_PASS = os.getenv("WAFILIFE_DB_PASS", "farhan")
DB_HOST = os.getenv("WAFILIFE_DB_HOST", "localhost")
DB_PORT = os.getenv("WAFILIFE_DB_PORT", "3306")
DB_NAME = os.getenv("WAFILIFE_DB_NAME", "wafilife_db")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}
BN_DIGITS = {chr(0x09E6 + i): str(i) for i in range(10)}
INVALID_TEXTS = {"", "nan", "none", "not listed", "not listed on grid"}

ENTITY_CONFIGS = {
    "author": {
        "raw_file": RAW_DIR / "Wafilife_All_Authors.csv",
        "raw_name_col": "Author_Name",
        "clean_file": PROCESSED_DIR / "clean_authors.csv",
        "id_col": "author_id",
        "name_col": "author_name",
        "default_name": "Unknown Author",
        "list_url": "https://www.wafilife.com/cat/books/author",
        "href_part": "/cat/books/author/",
        "max_pages": 304,
        "processed_file": PROCESSED_DIR / "Wafilife_Authors_Data.csv",
        "progress_file": STATE_DIR / "scraping_progress_authors.txt",
    },
    "publisher": {
        "raw_file": RAW_DIR / "Wafilife_All_Publishers.csv",
        "raw_name_col": "Publisher_Name",
        "clean_file": PROCESSED_DIR / "clean_publishers.csv",
        "id_col": "publisher_id",
        "name_col": "publisher_name",
        "default_name": "Unknown Publisher",
        "list_url": "https://www.wafilife.com/cat/books/publisher",
        "href_part": "/cat/books/publisher/",
        "max_pages": 200,
        "processed_file": PROCESSED_DIR / "Wafilife_Publishers_Data.csv",
        "progress_file": STATE_DIR / "scraping_progress_publishers.txt",
    },
    "subject": {
        "raw_file": RAW_DIR / "Wafilife_All_Subjects.csv",
        "raw_name_col": "Subject_Name",
        "clean_file": PROCESSED_DIR / "clean_subjects.csv",
        "id_col": "subject_id",
        "name_col": "subject_name",
        "default_name": "Unknown Subject",
        "list_url": "https://www.wafilife.com/cat/books/subject",
        "href_part": "/cat/books/subject/",
        "max_pages": 200,
        "processed_file": PROCESSED_DIR / "Wafilife_Subjects_Data.csv",
        "progress_file": STATE_DIR / "scraping_progress_subjects.txt",
    },
}

ENTITY_TYPES = ["author", "publisher", "subject"]
TEXT_COLUMNS = ["book_name", "author_name", "publisher_name", "subject_name"]
BOOK_COLUMNS = TEXT_COLUMNS + ["main_price", "wafilife_price"]


def normalize_text(value):
    if pd.isna(value):
        return np.nan

    text_value = str(value)
    text_value = text_value.replace('"', "").replace("'", "")
    text_value = text_value.replace("“", "").replace("”", "")
    text_value = re.sub(r"\s+", " ", text_value).strip()

    if text_value.lower() in INVALID_TEXTS:
        return np.nan
    return text_value


def clean_price(value):
    if pd.isna(value):
        return 0

    digits_only = "".join(re.findall(r"[\u09E6-\u09EF0-9]", str(value)))
    if not digits_only:
        return 0

    english_digits = "".join(BN_DIGITS.get(char, char) for char in digits_only)
    try:
        return int(english_digits)
    except ValueError:
        return 0


def fetch_page(session, url, max_retries=3, timeout=15):
    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            response = session.get(url, headers=HEADERS, timeout=timeout)
            if response.status_code == 200:
                return response
            last_error = f"status {response.status_code}"
        except RequestException as exc:
            last_error = str(exc)

        logger.warning(f"Request failed for {url} ({attempt}/{max_retries}): {last_error}")
        if attempt < max_retries:
            time.sleep(random.uniform(1.0, 2.5))

    logger.error(f"Skipping {url} after retries: {last_error}")
    return None


def extract_entity_name(a_tag):
    for selector in ["h3", "h2", "span"]:
        tag = a_tag.find(selector)
        if tag:
            return tag.get_text(strip=True)
    return a_tag.get_text(strip=True)


def scrape_entity_list(entity_type, force=False):
    config = ENTITY_CONFIGS[entity_type]
    output_file = config["raw_file"]

    if output_file.exists() and not force:
        logger.info(f"[SKIP] {output_file.name} already exists. Use --force-list to refresh.")
        return normalize_entity_list(entity_type, pd.read_csv(output_file, low_memory=False), persist=True)

    session = requests.Session()
    rows = []
    domain = "https://www.wafilife.com"

    for page in range(1, config["max_pages"] + 1):
        current_url = config["list_url"] if page == 1 else f"{config['list_url']}?page={page}"
        logger.info(f"[LIST] Scraping {entity_type} list page {page}: {current_url}")
        response = fetch_page(session, current_url)
        if response is None:
            break

        soup = BeautifulSoup(response.text, "html.parser")
        found = 0
        for a_tag in soup.find_all("a", href=True):
            href = str(a_tag["href"])
            if config["href_part"] not in href or "?page=" in href:
                continue
            if href.rstrip("/") == config["list_url"].rstrip("/"):
                continue

            profile_link = f"{domain}{href}" if not href.startswith("http") else href
            name = extract_entity_name(a_tag)
            if name:
                rows.append({config["raw_name_col"]: name, "Profile_Link": profile_link})
                found += 1

        logger.info(f"[LIST] {entity_type} list page {page} found {found} profiles")
        if found == 0:
            break
        time.sleep(random.uniform(0.5, 1.8))

    df = normalize_entity_list(entity_type, pd.DataFrame(rows))
    df.to_csv(output_file, index=False, encoding="utf-8-sig")
    logger.info(f"[OK] Saved {len(df)} {entity_type} rows to {output_file}")
    return df


def normalize_entity_list(entity_type, df, persist=False):
    config = ENTITY_CONFIGS[entity_type]
    id_col = config["id_col"]
    name_col = config["raw_name_col"]
    output_file = config["raw_file"]

    for col in [name_col, "Profile_Link"]:
        if col not in df.columns:
            df[col] = np.nan
        df[col] = df[col].map(normalize_text)

    df.dropna(subset=[name_col], inplace=True)
    dedupe_cols = ["Profile_Link"] if df["Profile_Link"].notna().any() else [name_col]
    df.drop_duplicates(subset=dedupe_cols, keep="first", inplace=True)
    df.reset_index(drop=True, inplace=True)

    if id_col in df.columns:
        df.drop(columns=[id_col], inplace=True)
    df.insert(0, id_col, df.index + 2)
    df = df[[id_col, name_col, "Profile_Link"]]

    if persist:
        df.to_csv(output_file, index=False, encoding="utf-8-sig")
    return df


def read_progress(path):
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8").strip() or None


def write_progress(path, value):
    path.write_text(str(value), encoding="utf-8")


def load_existing_processed(path):
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path, low_memory=False)


def extract_book_title(book):
    title = book.get("title")
    if title:
        return title.strip()

    for selector in ["h2", "h3"]:
        heading = book.find(selector)
        if heading:
            link = heading.find("a")
            return link.get_text(strip=True) if link else heading.get_text(strip=True)

    link = book.find("a")
    return link.get_text(strip=True) if link else None


def extract_prices(book):
    price_container = book.find("div", class_="-mx-1 mt-1")
    if not price_container:
        return "0", "0"

    del_tag = price_container.find("del")
    main_price = del_tag.get_text(strip=True) if del_tag else "0"

    span_tag = price_container.find("span")
    wafilife_price = span_tag.get_text(strip=True) if span_tag else main_price
    return main_price, wafilife_price


def book_page_url(entity_type, base_url, page):
    if page == 1:
        return base_url
    if entity_type == "author":
        return f"{base_url}/page/{page}/"
    return f"{base_url}?page={page}"


def scrape_entity_books(entity_type):
    config = ENTITY_CONFIGS[entity_type]
    raw_file = config["raw_file"]
    if not raw_file.exists():
        raise FileNotFoundError(f"Missing {raw_file}; run list scraping first.")

    entity_df = normalize_entity_list(entity_type, pd.read_csv(raw_file, low_memory=False), persist=True)
    existing_df = load_existing_processed(config["processed_file"])
    all_rows = existing_df.to_dict("records") if not existing_df.empty else []
    last_done = read_progress(config["progress_file"])

    start_index = 0
    if last_done:
        matches = entity_df.index[entity_df[config["raw_name_col"]] == last_done].tolist()
        if matches:
            start_index = matches[0] + 1

    session = requests.Session()
    for idx, (position, row) in enumerate(entity_df.iloc[start_index:].iterrows(), start=start_index + 1):
        entity_name = row[config["raw_name_col"]]
        base_url = str(row["Profile_Link"]).rstrip("/")
        total_for_entity = 0
        page = 1

        print(f"[BOOKS] Scraping {entity_type}: {entity_name} ({idx}/{len(entity_df)})")
        while True:
            url = book_page_url(entity_type, base_url, page)
            print(f"[BOOKS] {entity_type}={entity_name} | page={page} | url={url}")
            response = fetch_page(session, url)
            if response is None:
                break

            soup = BeautifulSoup(response.text, "html.parser")
            articles = soup.find_all("article")
            if not articles:
                break

            found = 0
            for article in articles:
                title = extract_book_title(article)
                if not title:
                    continue
                main_price, wafilife_price = extract_prices(article)

                data: dict[str, Any] = {
                    "Author": "Not Listed on Grid",
                    "Publisher": "Not Listed on Grid",
                    "Subject": "Not Listed on Grid",
                    "Title": title,
                    "Main_Price": main_price,
                    "Wafilife_Price": wafilife_price,
                }
                if entity_type == "author":
                    data["Author"] = entity_name
                    data["Publisher"] = "Not Listed"
                    data.pop("Subject")
                elif entity_type == "publisher":
                    data["Publisher"] = entity_name
                    data.pop("Subject")
                else:
                    data["Subject"] = entity_name

                all_rows.append(data)
                found += 1
                total_for_entity += 1

            print(f"[BOOKS] {entity_type}={entity_name} | page={page} | books_found={found}")
            if found == 0:
                break
            page += 1
            time.sleep(random.uniform(0.1, 0.3))

        pd.DataFrame(all_rows).to_csv(config["processed_file"], index=False, encoding="utf-8-sig")
        write_progress(config["progress_file"], entity_name)
        print(f"[BOOKS] Finished {entity_type}={entity_name} | scraped={total_for_entity} | saved_total={len(all_rows)}")


def make_entity_table(entity_type, final_df):
    config = ENTITY_CONFIGS[entity_type]
    raw_df = normalize_entity_list(entity_type, pd.read_csv(config["raw_file"], low_memory=False), persist=True)
    seed_df = pd.DataFrame({
        config["name_col"]: raw_df[config["raw_name_col"]].map(normalize_text),
        "profile_link": raw_df["Profile_Link"].map(normalize_text),
    })
    seed_df.dropna(subset=[config["name_col"]], inplace=True)

    scraped_df = pd.DataFrame({
        config["name_col"]: final_df[config["name_col"]],
        "profile_link": np.nan,
    })

    entity_df = pd.concat([seed_df, scraped_df], ignore_index=True)
    entity_df.dropna(subset=[config["name_col"]], inplace=True)
    entity_df = entity_df[entity_df[config["name_col"]] != config["default_name"]]
    entity_df.drop_duplicates(subset=[config["name_col"]], keep="first", inplace=True)
    entity_df.reset_index(drop=True, inplace=True)
    entity_df.insert(0, config["id_col"], entity_df.index + 2)

    default_row = pd.DataFrame({
        config["id_col"]: [1],
        config["name_col"]: [config["default_name"]],
        "profile_link": [np.nan],
    })
    return pd.concat([default_row, entity_df], ignore_index=True)


def first_valid(values, fallback):
    valid = values.dropna()
    return valid.iloc[0] if valid.size else fallback


def load_source_books():
    source_specs = [
        (ENTITY_CONFIGS["author"]["processed_file"], {"Author": "author_name", "Publisher": "publisher_name", "Title": "book_name", "Main_Price": "main_price", "Wafilife_Price": "wafilife_price"}),
        (ENTITY_CONFIGS["publisher"]["processed_file"], {"Author": "author_name", "Publisher": "publisher_name", "Title": "book_name", "Main_Price": "main_price", "Wafilife_Price": "wafilife_price"}),
        (ENTITY_CONFIGS["subject"]["processed_file"], {"Subject": "subject_name", "Author": "author_name", "Publisher": "publisher_name", "Title": "book_name", "Main_Price": "main_price", "Wafilife_Price": "wafilife_price"}),
    ]
    frames = []

    for path, rename_map in source_specs:
        if not path.exists():
            raise FileNotFoundError(f"Missing processed book file: {path}")
        df = pd.read_csv(path, low_memory=False)
        df.rename(columns=rename_map, inplace=True)
        for col in BOOK_COLUMNS:
            if col not in df.columns:
                df[col] = np.nan
        frames.append(df[BOOK_COLUMNS])

    combined_df = pd.concat(frames, ignore_index=True)
    for col in TEXT_COLUMNS:
        combined_df[col] = combined_df[col].map(normalize_text)

    combined_df.dropna(subset=["book_name"], inplace=True)
    combined_df["main_price"] = combined_df["main_price"].apply(clean_price)
    combined_df["wafilife_price"] = combined_df["wafilife_price"].apply(clean_price)
    combined_df["main_price"] = np.where(combined_df["main_price"] == 0, combined_df["wafilife_price"], combined_df["main_price"])
    return combined_df


def build_clean_csvs():
    print("[BUILD] Loading and merging processed book rows...")
    combined_df = load_source_books()
    combined_df.to_csv(PROCESSED_DIR / "all_scraped_book_rows.csv", index=False, encoding="utf-8-sig")
    combined_df.to_csv(PROJECT_DIR / "all_scraped_book_rows.csv", index=False, encoding="utf-8-sig")
    final_df = combined_df.groupby("book_name", sort=False).agg({
        "author_name": lambda x: first_valid(x, "Unknown Author"),
        "publisher_name": lambda x: first_valid(x, "Unknown Publisher"),
        "subject_name": lambda x: first_valid(x, "Unknown Subject"),
        "main_price": "max",
        "wafilife_price": "max",
    }).reset_index()

    authors = make_entity_table("author", final_df)
    publishers = make_entity_table("publisher", final_df)
    subjects = make_entity_table("subject", final_df)

    books = final_df.merge(authors, on="author_name", how="left") \
                    .merge(publishers, on="publisher_name", how="left") \
                    .merge(subjects, on="subject_name", how="left")

    for id_col in ["author_id", "publisher_id", "subject_id"]:
        books[id_col] = books[id_col].fillna(1).astype(int)

    books = books[["book_name", "author_id", "publisher_id", "subject_id", "main_price", "wafilife_price"]].reset_index(drop=True)
    books.insert(0, "book_id", books.index + 1)

    outputs = {
        "clean_authors.csv": authors,
        "clean_publishers.csv": publishers,
        "clean_subjects.csv": subjects,
        "clean_books.csv": books,
    }
    for filename, df in outputs.items():
        root_path = PROJECT_DIR / filename
        processed_path = PROCESSED_DIR / filename
        df.to_csv(root_path, index=False, encoding="utf-8-sig")
        shutil.copyfile(root_path, processed_path)
        print(f"[OK] {filename}: {len(df)} rows")

    return authors, publishers, subjects, books


def upload_sql(authors, publishers, subjects, books):
    print("[SQL] Connecting and rebuilding 5-table database...")
    server_uri = f"mysql+mysqlconnector://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}"
    base_engine = create_engine(server_uri)
    with base_engine.begin() as conn:
        conn.execute(text(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}"))

    database_uri = f"mysql+mysqlconnector://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    engine = create_engine(database_uri)

    with engine.begin() as conn:
        existing_objects = conn.execute(text("SHOW FULL TABLES")).fetchall()
        for row in existing_objects:
            object_name = row[0]
            object_type = str(row[1]).upper()
            escaped_name = str(object_name).replace("`", "``")
            if object_type == "VIEW":
                conn.execute(text(f"DROP VIEW IF EXISTS `{escaped_name}`"))
            else:
                conn.execute(text(f"DROP TABLE IF EXISTS `{escaped_name}`"))

    authors.to_sql("authors", con=engine, if_exists="replace", index=False)
    publishers.to_sql("publishers", con=engine, if_exists="replace", index=False)
    subjects.to_sql("subjects", con=engine, if_exists="replace", index=False)
    books.to_sql("books", con=engine, if_exists="replace", index=False)

    master_query = """
        CREATE TABLE master AS
        SELECT
            b.book_id,
            b.book_name,
            b.author_id,
            a.author_name,
            b.publisher_id,
            p.publisher_name,
            b.subject_id,
            s.subject_name,
            b.main_price,
            b.wafilife_price
        FROM books b
        LEFT JOIN authors a ON b.author_id = a.author_id
        LEFT JOIN publishers p ON b.publisher_id = p.publisher_id
        LEFT JOIN subjects s ON b.subject_id = s.subject_id
    """
    with engine.begin() as conn:
        conn.execute(text(master_query))

    master_df = pd.read_sql(text("SELECT * FROM master ORDER BY book_id"), con=engine)
    for path in [PROJECT_DIR / "master.csv", PROCESSED_DIR / "master.csv"]:
        master_df.to_csv(path, index=False, encoding="utf-8-sig")

    print("[SQL] Created tables: authors, publishers, subjects, books, master")
    print(f"[SQL] Master rows: {len(master_df)}")


def verify_sql():
    database_uri = f"mysql+mysqlconnector://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    engine = create_engine(database_uri)
    with engine.connect() as conn:
        for table in ["authors", "publishers", "subjects", "books", "master"]:
            count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            print(f"[VERIFY] {table}: {count}")

        checks = {
            "orphan_author_fk": "SELECT COUNT(*) FROM books b LEFT JOIN authors a ON b.author_id=a.author_id WHERE a.author_id IS NULL",
            "orphan_publisher_fk": "SELECT COUNT(*) FROM books b LEFT JOIN publishers p ON b.publisher_id=p.publisher_id WHERE p.publisher_id IS NULL",
            "orphan_subject_fk": "SELECT COUNT(*) FROM books b LEFT JOIN subjects s ON b.subject_id=s.subject_id WHERE s.subject_id IS NULL",
        }
        for label, query in checks.items():
            count = conn.execute(text(query)).scalar()
            print(f"[VERIFY] {label}: {count}")


def run_scrape(force_list=False):
    print("[SCRAPE] Building raw author/publisher/subject lists...")
    for entity_type in ENTITY_TYPES:
        scrape_entity_list(entity_type, force=force_list)

    print("[SCRAPE] Scraping books under each entity...")
    for entity_type in ENTITY_TYPES:
        scrape_entity_books(entity_type)


def main():
    parser = argparse.ArgumentParser(description="Single-file Wafilife scrape, clean, and SQL pipeline.")
    parser.add_argument("--scrape", action="store_true", help="Scrape raw entity lists and books before building.")
    parser.add_argument("--force-list", action="store_true", help="Refresh raw author/publisher/subject lists even if CSVs exist.")
    parser.add_argument("--build-only", action="store_true", help="Build clean CSVs only; do not upload SQL.")
    args = parser.parse_args()

    if args.scrape:
        run_scrape(force_list=args.force_list)

    authors, publishers, subjects, books = build_clean_csvs()
    if not args.build_only:
        upload_sql(authors, publishers, subjects, books)
        verify_sql()

    print("[DONE] Pipeline completed.")


if __name__ == "__main__":
    main()
