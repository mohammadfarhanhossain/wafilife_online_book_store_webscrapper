import os
from datetime import datetime

import pandas as pd


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROCESSED_DIR = os.path.join(BASE_DIR, "data", "processed")
os.makedirs(PROCESSED_DIR, exist_ok=True)

AUTHOR_FILE = os.path.join(PROCESSED_DIR, "Wafilife_Authors_Data.csv")
PUBLISHER_FILE = os.path.join(PROCESSED_DIR, "Wafilife_Publishers_Data.csv")
SUBJECT_FILE = os.path.join(PROCESSED_DIR, "Wafilife_Subjects_Data.csv")
OUTPUT_CSV = os.path.join(PROCESSED_DIR, "Wafilife_Master_Database.csv")
OUTPUT_XLSX = os.path.join(PROCESSED_DIR, "Wafilife_Master_Database.xlsx")


def read_csv_safe(path):
    if not os.path.exists(path):
        print(f"Missing file: {os.path.basename(path)}")
        return pd.DataFrame()

    try:
        return pd.read_csv(path)
    except Exception as exc:
        print(f"Failed to read {os.path.basename(path)}: {exc}")
        return pd.DataFrame()


def normalize_text(value, fallback=""):
    if pd.isna(value):
        return fallback
    text = str(value).strip()
    return text if text else fallback


def canonical_not_listed(value):
    text = normalize_text(value)
    if text.lower() in {"not listed", "not listed on grid", "nan", "none", ""}:
        return "Not Listed"
    return text


def build_author_rows(df):
    if df.empty:
        return pd.DataFrame(columns=[
            "source_type", "author_name", "publisher_name", "book_name", "subject_name", "main_price", "wafilife_price"
        ])

    result = pd.DataFrame({
        "source_type": "Author",
        "author_name": df["Author"].map(normalize_text),
        "publisher_name": df["Publisher"].map(canonical_not_listed),
        "book_name": df["Title"].map(normalize_text),
        "subject_name": "Not Listed",
        "main_price": df["Main_Price"].map(normalize_text),
        "wafilife_price": df["Wafilife_Price"].map(normalize_text),
    })

    return result


def build_publisher_rows(df):
    if df.empty:
        return pd.DataFrame(columns=[
            "source_type", "author_name", "publisher_name", "book_name", "subject_name", "main_price", "wafilife_price"
        ])

    result = pd.DataFrame({
        "source_type": "Publisher",
        "author_name": df["Author"].map(canonical_not_listed),
        "publisher_name": df["Publisher"].map(normalize_text),
        "book_name": df["Title"].map(normalize_text),
        "subject_name": "Not Listed",
        "main_price": df["Main_Price"].map(normalize_text),
        "wafilife_price": df["Wafilife_Price"].map(normalize_text),
    })

    return result


def build_subject_rows(df):
    if df.empty:
        return pd.DataFrame(columns=[
            "source_type", "author_name", "publisher_name", "book_name", "subject_name", "main_price", "wafilife_price"
        ])

    result = pd.DataFrame({
        "source_type": "Subject",
        "author_name": df["Author"].map(canonical_not_listed),
        "publisher_name": df["Publisher"].map(canonical_not_listed),
        "book_name": df["Title"].map(normalize_text),
        "subject_name": df["Subject"].map(normalize_text),
        "main_price": df["Main_Price"].map(normalize_text),
        "wafilife_price": df["Wafilife_Price"].map(normalize_text),
    })

    return result


def extract_price_number(price_str):
    """Extract numeric value from Bengali price string like '৩৫০৳' or '350৳'."""
    import re
    text = normalize_text(price_str)
    if text.lower() in {"not listed", "nan", "none", ""}:
        return None
    # Remove ৳ and any whitespace, then convert Bengali digits to ASCII
    cleaned = text.replace("৳", "").strip()
    bn_digits = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
    cleaned = cleaned.translate(bn_digits)
    # Remove commas
    cleaned = cleaned.replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def format_price_range(prices):
    """Given a list of price strings, return 'min৳ - max৳' range or single value if all equal."""
    nums = [extract_price_number(p) for p in prices]
    nums = [n for n in nums if n is not None]
    if not nums:
        return "Not Listed"

    def to_bengali(n):
        """Convert number back to Bengali digits with ৳ suffix."""
        int_n = int(n)
        digits = str(int_n)
        bn_digits = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")
        return digits.translate(bn_digits) + "৳"

    lo, hi = min(nums), max(nums)
    if lo == hi:
        return to_bengali(lo)
    return f"{to_bengali(lo)} - {to_bengali(hi)}"


def merge_subject_duplicates(df):
    if df.empty:
        return df

    # Group by book identity only (price excluded — will be aggregated into range)
    keys = ["author_name", "publisher_name", "book_name"]

    def join_unique(values, sep=" - "):
        seen = dict.fromkeys(
            v for v in (normalize_text(x) for x in values)
            if v and v.lower() not in {"not listed", "nan", "none"}
        )
        return sep.join(seen) if seen else "Not Listed"

    grouped = df.groupby(keys, sort=False, as_index=False).agg(
        source_type=("source_type", lambda v: join_unique(v, " - ")),
        subject_name=("subject_name", lambda v: join_unique(v, " - ")),
        main_price=("main_price", format_price_range),
        wafilife_price=("wafilife_price", format_price_range),
    )

    # Restore column order
    col_order = ["source_type", "author_name", "publisher_name", "book_name",
                 "subject_name", "main_price", "wafilife_price"]
    grouped = grouped.reindex(columns=col_order)
    return grouped


def dedupe_rows(df):
    if df.empty:
        return df

    df = df.drop_duplicates(subset=["author_name", "publisher_name", "book_name"])
    df = df.reset_index(drop=True)
    return df


def main():
    author_df = read_csv_safe(AUTHOR_FILE)
    publisher_df = read_csv_safe(PUBLISHER_FILE)
    subject_df = read_csv_safe(SUBJECT_FILE)

    master_parts = [
        build_author_rows(author_df),
        build_publisher_rows(publisher_df),
        build_subject_rows(subject_df),
    ]

    master_df = pd.concat(master_parts, ignore_index=True)
    master_df = merge_subject_duplicates(master_df)
    master_df = dedupe_rows(master_df)

    master_df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
    master_df.to_excel(OUTPUT_XLSX, index=False, engine="openpyxl")

    print(f"Created {os.path.basename(OUTPUT_CSV)} with {len(master_df)} rows")
    print(f"Created {os.path.basename(OUTPUT_XLSX)}")
    print(f"Timestamp: {datetime.now().isoformat(timespec='seconds')}")


if __name__ == "__main__":
    main()