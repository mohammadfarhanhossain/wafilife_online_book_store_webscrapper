import subprocess
import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent


PIPELINE = [
    ("scrape_author_list.py", "Author list"),
    ("scrape_author_books.py", "Author books"),
    ("publisher_scraper.py", "Publisher list"),
    ("scrape_publisher_books.py", "Publisher books"),
    ("subject_scraper.py", "Subject list"),
    ("scrape_subject_books.py", "Subject books"),
    ("build_master_database.py", "Master database"),
]


def run_script(script_name, label):
    script_path = BASE_DIR / script_name

    if not script_path.exists():
        print(f"Missing script: {script_name}")
        return False

    print(f"\n=== Running {label}: {script_name} ===")
    result = subprocess.run([sys.executable, str(script_path)], cwd=BASE_DIR)

    if result.returncode != 0:
        print(f"Failed: {script_name} exited with code {result.returncode}")
        return False

    print(f"Completed: {script_name}")
    return True


def main():
    for script_name, label in PIPELINE:
        if not run_script(script_name, label):
            print("Pipeline stopped before completion.")
            return 1

    print("\nAll scraping and build steps completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())