import { existsSync } from "node:fs";
import path from "node:path";

export function projectRoot(): string {
  const candidates = [
    process.env.PROJECT_ROOT ? path.resolve(process.env.PROJECT_ROOT) : null,
    process.cwd(),
    path.resolve(process.cwd(), "../.."),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(path.join(candidate, "database", "migrations"))) ?? process.cwd();
}
