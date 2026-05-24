import os
import random
import sys
import time

import pandas as pd
import requests
from bs4 import BeautifulSoup
from requests.exceptions import RequestException


stdout_reconfigure = getattr(sys.stdout, 'reconfigure', None)
if callable(stdout_reconfigure):
    stdout_reconfigure(encoding='utf-8')


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(BASE_DIR, "data", "raw")
PROCESSED_DIR = os.path.join(BASE_DIR, "data", "processed")
STATE_DIR = os.path.join(BASE_DIR, "data", "state")
os.makedirs(RAW_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)
os.makedirs(STATE_DIR, exist_ok=True)


def fetch_page(session, url, headers, max_retries=3, timeout=15):
    last_error = None

    for attempt in range(1, max_retries + 1):
        try:
            response = session.get(url, headers=headers, timeout=timeout)
            if response.status_code == 200:
                return response

            last_error = f"status {response.status_code}"
            print(f"Request failed for {url} (attempt {attempt}/{max_retries}) with {last_error}")
        except RequestException as exc:
            last_error = str(exc)
            print(f"Request error for {url} (attempt {attempt}/{max_retries}): {exc}")

        if attempt < max_retries:
            time.sleep(random.uniform(1.0, 2.5))

    print(f"Skipping {url} after retries: {last_error}")
    return None


OUTPUT_FILE = os.path.join(PROCESSED_DIR, "Wafilife_Authors_Data.csv")
PROGRESS_FILE = os.path.join(STATE_DIR, "scraping_progress_authors.txt")


def load_existing_data():
    if os.path.exists(OUTPUT_FILE):
        try:
            df = pd.read_csv(OUTPUT_FILE)
            print(f"Loaded {len(df)} previously scraped records from {os.path.basename(OUTPUT_FILE)}")
            return df
        except Exception as exc:
            print(f"Error loading existing data: {exc}")
            return pd.DataFrame()
    return pd.DataFrame()


def get_last_scraped_author():
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, 'r', encoding='utf-8') as file_handle:
                return file_handle.read().strip()
        except Exception:
            return None
    return None


def save_progress(author_name):
    try:
        with open(PROGRESS_FILE, 'w', encoding='utf-8') as file_handle:
            file_handle.write(author_name)
    except Exception as exc:
        print(f"Error saving progress: {exc}")


def save_data_incrementally(df):
    try:
        df.to_csv(OUTPUT_FILE, index=False, encoding='utf-8')
        print(f"✓ Saved {len(df)} total records to {os.path.basename(OUTPUT_FILE)}")
    except Exception as exc:
        print(f"Error saving data: {exc}")


def scrape_wafilife_authors_data():
    try:
        authors_df = pd.read_csv(os.path.join(RAW_DIR, "Wafilife_All_Authors.csv"))
    except FileNotFoundError:
        print("Error: Wafilife_All_Authors.csv not found! Run the Tier 1 Crawler first.")
        return

    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    session = requests.Session()

    existing_df = load_existing_data()
    all_books = existing_df.to_dict('records') if not existing_df.empty else []

    last_author = get_last_scraped_author()
    start_from_index = 0

    if last_author:
        for idx, (_, row) in enumerate(authors_df.iterrows()):
            if row['Author_Name'] == last_author:
                start_from_index = idx + 1
                print(f"Resuming from author: {authors_df.iloc[start_from_index]['Author_Name'] if start_from_index < len(authors_df) else 'COMPLETED'}")
                break

    test_authors = authors_df

    for position, (_, row) in enumerate(test_authors.iterrows()):
        if position < start_from_index:
            continue

        author_name = row['Author_Name']
        base_author_url = row['Profile_Link'].rstrip('/')
        page = 1
        total_books_for_author = 0

        print(f"\n--- Scraping Books for: {author_name} ({position + 1}/{len(authors_df)}) ---")

        while True:
            current_url = f"{base_author_url}/page/{page}/" if page > 1 else base_author_url

            response = fetch_page(session, current_url, headers)

            if response is None:
                break

            if response.status_code != 200:
                break

            soup = BeautifulSoup(response.text, 'html.parser')
            book_containers = soup.find_all('article')

            if not book_containers:
                break

            books_found_on_page = 0

            for book in book_containers:
                title = book.get('title')
                if not title:
                    continue

                price_container = book.find('div', class_='-mx-1 mt-1')

                if price_container:
                    del_tag = price_container.find('del')
                    main_price = del_tag.get_text(strip=True) if del_tag else "0"

                    span_tag = price_container.find('span')
                    wafilife_price = span_tag.get_text(strip=True) if span_tag else main_price
                else:
                    main_price = "0"
                    wafilife_price = "0"

                all_books.append({
                    'Author': author_name,
                    'Publisher': 'Not Listed',
                    'Title': title,
                    'Main_Price': main_price,
                    'Wafilife_Price': wafilife_price,
                })
                books_found_on_page += 1
                total_books_for_author += 1

            if books_found_on_page == 0:
                break

            page += 1
            time.sleep(random.uniform(0.1, 0.3))

        print(f"  -> Finished! Extracted {total_books_for_author} books.")

        df = pd.DataFrame(all_books)
        save_data_incrementally(df)
        save_progress(author_name)

    if all_books:
        df = pd.DataFrame(all_books)
        df.to_excel(os.path.join(PROCESSED_DIR, "Wafilife_Authors_Data.xlsx"), index=False, engine='openpyxl')
        print(f"\nSUCCESS! Extracted a total of {len(df)} books to both CSV and Excel formats")
    else:
        print("\nFAILED: No books were extracted. Check your internet connection.")


if __name__ == "__main__":
    print("INITIALIZING WAFILIFE AUTHOR SCRAPER (HIGH-SPEED PRODUCTION MODE)...")
    scrape_wafilife_authors_data()