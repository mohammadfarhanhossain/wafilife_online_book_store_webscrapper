export type Author = { id: number; name: string };
export type Publisher = { id: number; name: string };
export type Subject = { id: number; name: string };
export type Book = { id: string; title: string; normalizedTitle: string; isbn13: string | null; languageCode: string; description: string | null; status: string; mainPrice: number | null; salePrice: number | null; availability: string; authors: Author[]; publishers: Publisher[]; subjects: Subject[] };
export type Page<T> = { data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } };

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export async function api<T>(path: string): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
