import sys

stdout_reconfigure = getattr(sys.stdout, 'reconfigure', None)
if callable(stdout_reconfigure):
    stdout_reconfigure(encoding='utf-8')

import random
import time

import pandas as pd
import requests
from bs4 import BeautifulSoup
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


def crawl_all_subject_pages(max_pages=200):
    domain = "https://www.wafilife.com"
    base_url = "https://www.wafilife.com/cat/books/subject"

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    all_subject_links = []
    session = requests.Session()
    page = 1

    def extract_subject_name(a_tag):
        h3_tag = a_tag.find('h3')
        if h3_tag:
            return h3_tag.get_text(strip=True)

        h2_tag = a_tag.find('h2')
        if h2_tag:
            return h2_tag.get_text(strip=True)

        span_tag = a_tag.find('span')
        if span_tag:
            return span_tag.get_text(strip=True)

        return a_tag.get_text(strip=True)

    while page <= max_pages:
        current_url = f"{base_url}?page={page}" if page > 1 else base_url

        print(f"\nScanning Subject Page {page} -> {current_url}")
        response = fetch_page(session, current_url, headers)

        if response is None:
            break

        if response.status_code != 200:
            print(f"Reached the end or got blocked. Status: {response.status_code}")
            break

        soup = BeautifulSoup(response.text, 'html.parser')
        subjects_found = 0

        for a_tag in soup.find_all('a', href=True):
            href = str(a_tag['href'])

            if '/cat/books/subject/' in href and '?page=' not in href and href.rstrip('/') != base_url.rstrip('/'):
                full_link = f"{domain}{href}" if not href.startswith('http') else href
                name = extract_subject_name(a_tag)

                if name:
                    all_subject_links.append({'Subject_Name': name, 'Profile_Link': full_link})
                    subjects_found += 1

        if subjects_found == 0:
            print("No more subjects found. Extraction complete.")
            break

        print(f"-> Extracted {subjects_found} subjects from Page {page}.")

        page += 1
        time.sleep(random.uniform(0.8, 1.8))

    df = pd.DataFrame(all_subject_links).drop_duplicates(subset=['Profile_Link'])

    print(f"\n--- MISSION ACCOMPLISHED ---")
    print(f"Total Unique Subjects Extracted: {len(df)}")

    df.to_csv("Wafilife_All_Subjects.csv", index=False, encoding='utf-8-sig')
    print("Saved to Wafilife_All_Subjects.csv")


if __name__ == "__main__":
    crawl_all_subject_pages(max_pages=200)