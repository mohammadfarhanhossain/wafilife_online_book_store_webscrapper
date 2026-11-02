import { createHash } from "node:crypto";

export type MasterRow = {
  legacyBookId: string;
  title: string;
  author: string;
  publisher: string;
  subject: string;
  mainPrice: number;
  salePrice: number;
};

export type PreparedRow = MasterRow & {
  rowNumber: number;
  sourceBookKey: string;
  contentHash: string;
  snapshotHash: string;
  anomalyFlags: string[];
};

export type PreparedCsv = {
  rows: PreparedRow[];
  invalidRows: Array<{ rowNumber: number; reason: string }>;
  duplicateConflicts: Array<{ legacyBookId: string; rowNumbers: number[] }>;
};

const BENGALI_DIGITS: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};

export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

export function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function normalizeKey(value: string): string {
  return normalizeText(value).toLocaleLowerCase();
}

export function parsePrice(value: string): number {
  const englishDigits = Array.from(value, (character) => BENGALI_DIGITS[character] ?? character).join("");
  const digits = englishDigits.replace(/[^0-9.]/g, "");
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

export function prepareMasterCsv(csv: string): PreparedCsv {
  const cleanCsv = csv.replace(/^\uFEFF/, "");
  const lines = cleanCsv.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return { rows: [], invalidRows: [], duplicateConflicts: [] };

  const headers = parseCsvLine(lines[0]).map(normalizeText);
  const index = (name: string) => headers.indexOf(name);
  const required = ["book_id", "book_name", "author_name", "publisher_name", "subject_name", "main_price", "wafilife_price"];
  const missingHeaders = required.filter((name) => index(name) < 0);
  if (missingHeaders.length > 0) {
    throw new Error(`Missing CSV headers: ${missingHeaders.join(", ")}`);
  }

  const rows: PreparedRow[] = [];
  const invalidRows: Array<{ rowNumber: number; reason: string }> = [];
  const byLegacyId = new Map<string, PreparedRow & { rowNumber: number }>();
  const duplicateRows = new Map<string, number[]>();

  lines.slice(1).forEach((line, offset) => {
    const rowNumber = offset + 2;
    const values = parseCsvLine(line);
    const field = (name: string) => values[index(name)] ?? "";
    const legacyBookId = normalizeText(field("book_id"));
    const title = normalizeText(field("book_name"));
    const author = normalizeText(field("author_name"));
    const publisher = normalizeText(field("publisher_name"));
    const subject = normalizeText(field("subject_name"));
    const mainPrice = parsePrice(field("main_price"));
    const salePrice = parsePrice(field("wafilife_price"));

    if (!/^\d+$/.test(legacyBookId) || Number(legacyBookId) <= 0 || !title) {
      invalidRows.push({ rowNumber, reason: "book_id must be positive and book_name is required" });
      return;
    }

    const base = { legacyBookId, title, author, publisher, subject, mainPrice, salePrice };
    const row: PreparedRow = {
      ...base,
      rowNumber,
      sourceBookKey: `legacy:${legacyBookId}`,
      contentHash: hashValue({ title, author, publisher, subject }),
      snapshotHash: hashValue(base),
      anomalyFlags: salePrice > mainPrice ? ["sale_price_greater_than_list_price"] : [],
    };
    const previous = byLegacyId.get(legacyBookId);
    if (previous) {
      duplicateRows.set(legacyBookId, [...(duplicateRows.get(legacyBookId) ?? [previous.rowNumber]), rowNumber]);
      if (previous.snapshotHash === row.snapshotHash) return;
      return;
    }
    byLegacyId.set(legacyBookId, { ...row, rowNumber });
    rows.push(row);
  });

  return {
    rows,
    invalidRows,
    duplicateConflicts: Array.from(duplicateRows, ([legacyBookId, rowNumbers]) => ({ legacyBookId, rowNumbers })),
  };
}
