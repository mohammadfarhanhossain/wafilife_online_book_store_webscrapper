import sys
stdout_reconfigure = getattr(sys.stdout, 'reconfigure', None)
if callable(stdout_reconfigure):
    stdout_reconfigure(encoding='utf-8')
import pandas as pd
import requests
from bs4 import BeautifulSoup
import time
import random
import os
from requests.exceptions import RequestException


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

# Output files
OUTPUT_FILE = "Wafilife_Authors_Data.csv"
PROGRESS_FILE = "scraping_progress_authors.txt"

def load_existing_data():
    """Load previously scraped author data if it exists"""
    if os.path.exists(OUTPUT_FILE):
        try:
            df = pd.read_csv(OUTPUT_FILE)
            print(f"Loaded {len(df)} previously scraped records from {OUTPUT_FILE}")
            return df
        except Exception as e:
            print(f"Error loading existing data: {e}")
            return pd.DataFrame()
    return pd.DataFrame()

def get_last_scraped_author():
    """Get the last author that was successfully scraped"""
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
                return f.read().strip()
        except:
            return None
    return None

def save_progress(author_name):
    """Save the current author being scraped"""
    try:
        with open(PROGRESS_FILE, 'w', encoding='utf-8') as f:
            f.write(author_name)
    except Exception as e:
        print(f"Error saving progress: {e}")

def save_data_incrementally(df):
    """Save data to CSV (author books)"""
    try:
        # Save to author-specific file
        df.to_csv(OUTPUT_FILE, index=False, encoding='utf-8')
        print(f"✓ Saved {len(df)} total records to {OUTPUT_FILE}")
    except Exception as e:
        print(f"Error saving data: {e}")

def scrape_wafilife_authors_data():
    try:
        authors_df = pd.read_csv("Wafilife_All_Authors.csv")
    except FileNotFoundError:
        print("Error: Wafilife_All_Authors.csv not found! Run the Tier 1 Crawler first.")
        return

    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    session = requests.Session()
    
    # Load existing data to avoid duplicates
    existing_df = load_existing_data()
    all_books = existing_df.to_dict('records') if not existing_df.empty else []
    
    # Get last scraped author to resume from there
    last_author = get_last_scraped_author()
    start_from_index = 0
    
    if last_author:
        for idx, (index, row) in enumerate(authors_df.iterrows()):
            if row['Author_Name'] == last_author:
                start_from_index = idx + 1  # Start from the next author
                print(f"Resuming from author: {authors_df.iloc[start_from_index]['Author_Name'] if start_from_index < len(authors_df) else 'COMPLETED'}")
                break

    # THE SAFETY LIMIT IS REMOVED. IT WILL NOW SCRAPE ALL AUTHORS.
    test_authors = authors_df

    for position, (_, row) in enumerate(test_authors.iterrows()):
        if position < start_from_index:
            continue  # Skip already scraped authors
            
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
                    'Publisher': 'Not Listed', # Acknowledging missing data on the Author grid
                    'Title': title,
                    'Main_Price': main_price,
                    'Wafilife_Price': wafilife_price
                })
                books_found_on_page += 1
                total_books_for_author += 1

            if books_found_on_page == 0:
                break 
            
            page += 1
            
            # OPTIMIZATION: Randomized sleep between 0.4 and 1.1 seconds. 
            # Fast enough for data pipelines, random enough to avoid IP bans.
            time.sleep(random.uniform(0.1, 0.3)) 

        # MACRO PRINT: Only prints once per author, saving massive Terminal I/O latency.
        print(f"  -> Finished! Extracted {total_books_for_author} books.")
        
        # Save data incrementally after each author
        df = pd.DataFrame(all_books)
        save_data_incrementally(df)
        save_progress(author_name)

    # Final Export
    if all_books:
        df = pd.DataFrame(all_books)
        df.to_excel("Wafilife_Authors_Data.xlsx", index=False, engine='openpyxl')
        print(f"\nSUCCESS! Extracted a total of {len(df)} books to both CSV and Excel formats")
    else:
        print("\nFAILED: No books were extracted. Check your internet connection.")

if __name__ == "__main__":
    print("INITIALIZING WAFILIFE AUTHOR SCRAPER (HIGH-SPEED PRODUCTION MODE)...")
    scrape_wafilife_authors_data()