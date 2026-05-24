import os
import sys
stdout_reconfigure = getattr(sys.stdout, 'reconfigure', None)
if callable(stdout_reconfigure):
    stdout_reconfigure(encoding='utf-8')
import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
import random
import logging
from requests.exceptions import RequestException


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(BASE_DIR, "data", "raw")
os.makedirs(RAW_DIR, exist_ok=True)

def crawl_all_author_pages(max_pages=3): # Safety limit for testing
    domain = "https://www.wafilife.com"
    base_url = "https://www.wafilife.com/cat/books/author"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    
    all_author_links = []
    page = 1
    
    while page <= max_pages:
        # 1. FIXED: URL Generation using Query Parameters
        if page == 1:
            current_url = base_url
        else:
            current_url = f"{base_url}?page={page}"
            
        print(f"\nScanning Page {page} -> {current_url}")

        # request with retries and timeout to avoid hanging
        response = None
        max_retries = 3
        backoff = 1.0
        for attempt in range(1, max_retries + 1):
            try:
                response = requests.get(current_url, headers=headers, timeout=10)
                if response.status_code == 200:
                    break
                else:
                    logging.warning("Non-200 status %s for %s (attempt %s)", response.status_code, current_url, attempt)
            except RequestException as e:
                logging.warning("Request error for %s on attempt %s: %s", current_url, attempt, e)

            # exponential-ish backoff before retrying
            sleep_retry = random.uniform(backoff, backoff * 2)
            time.sleep(sleep_retry)
            backoff *= 2

        if response is None or response.status_code != 200:
            print(f"Reached the end or got blocked. Status: {getattr(response, 'status_code', 'no-response')}")
            break
            
        soup = BeautifulSoup(response.text, 'html.parser')
        authors_found_on_page = 0
        
        for a_tag in soup.find_all('a', href=True):
            href = str(a_tag['href'])
            
            # 2. FIXED: Ignore pagination buttons that contain '?page='
            if '/cat/books/author/' in href and '?page=' not in href:
                full_link = f"{domain}{href}" if not href.startswith('http') else href
                h3_tag = a_tag.find('h3')
                
                if h3_tag:
                    name = h3_tag.get_text(strip=True)
                    all_author_links.append({'Author_Name': name, 'Profile_Link': full_link})
                    authors_found_on_page += 1
                    
        if authors_found_on_page == 0:
            print("No more authors found on this page. Extraction complete.")
            break
            
        print(f"-> Successfully extracted {authors_found_on_page} authors from Page {page}.")
        
        page += 1
        # random sleep to avoid hammering the server (0.5s - 2.0s)
        sleep_time = random.uniform(0.5, 2.0)
        logging.info("Sleeping %.2fs before next page", sleep_time)
        time.sleep(sleep_time)
    # Clean up duplicates
    df = pd.DataFrame(all_author_links).drop_duplicates(subset=['Profile_Link'])
    
    print(f"\n--- MISSION ACCOMPLISHED ---")
    print(f"Total Unique Authors Extracted: {len(df)}")
    
    output_file = os.path.join(RAW_DIR, "Wafilife_All_Authors.csv")
    df.to_csv(output_file, index=False, encoding='utf-8-sig')
    print(f"Saved all data to {os.path.basename(output_file)}")

if __name__ == "__main__":
    # Test with 3 pages first. If it works perfectly, you can increase this number!
    crawl_all_author_pages(max_pages=304)