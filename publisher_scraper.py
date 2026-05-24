import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
import requests
from bs4 import BeautifulSoup
import pandas as pd
import time


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(BASE_DIR, "data", "raw")
os.makedirs(RAW_DIR, exist_ok=True)

def crawl_all_publisher_pages(max_pages=200): # High limit for the actual run
    domain = "https://www.wafilife.com"
    base_url = "https://www.wafilife.com/cat/books/publisher"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    
    all_publisher_links = []
    page = 1
    
    while page <= max_pages:
        current_url = f"{base_url}?page={page}" if page > 1 else base_url
            
        print(f"\nScanning Publisher Page {page} -> {current_url}")
        response = requests.get(current_url, headers=headers)
        
        if response.status_code != 200:
            print(f"Reached the end or got blocked. Status: {response.status_code}")
            break
            
        soup = BeautifulSoup(response.text, 'html.parser')
        publishers_found = 0
        
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            
            # Hunting specifically for publisher URLs
            if '/cat/books/publisher/' in href and '?page=' not in href:
                full_link = f"{domain}{href}" if not href.startswith('http') else href
                h3_tag = a_tag.find('h3')
                
                if h3_tag:
                    name = h3_tag.get_text(strip=True)
                    all_publisher_links.append({'Publisher_Name': name, 'Profile_Link': full_link})
                    publishers_found += 1
                    
        if publishers_found == 0:
            print("No more publishers found. Extraction complete.")
            break
            
        print(f"-> Extracted {publishers_found} publishers from Page {page}.")
        
        page += 1
        time.sleep(2) 
        
    df = pd.DataFrame(all_publisher_links).drop_duplicates(subset=['Profile_Link'])
    
    print(f"\n--- MISSION ACCOMPLISHED ---")
    print(f"Total Unique Publishers Extracted: {len(df)}")
    
    output_file = os.path.join(RAW_DIR, "Wafilife_All_Publishers.csv")
    df.to_csv(output_file, index=False, encoding='utf-8-sig')
    print(f"Saved to {os.path.basename(output_file)}")

if __name__ == "__main__":
    crawl_all_publisher_pages(max_pages=200)