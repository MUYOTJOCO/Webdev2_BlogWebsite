import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mergeMovies, normalizeMovies } from "../public/js/movies.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(projectRoot, "public");
const destination = path.join(projectRoot, "dist");
const catalogs = [
  ["Animation", "animation"],
  ["Classic", "classic"],
  ["Comedy", "comedy"],
  ["Drama", "drama"],
  ["Horror", "horror"]
];

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
const catalogResults = await Promise.allSettled(catalogs.map(async ([category, catalog]) => {
  const response = await fetch(`https://api.sampleapis.com/movies/${catalog}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Movie catalog request failed (${response.status}).`);
  return normalizeMovies(await response.json(), category);
}));
const available = catalogResults.filter((result) => result.status === "fulfilled");
const movieSnapshot = mergeMovies(available.flatMap((result) => result.value), "", 10000);
const sourceType = available.length === 0 ? "bundled" : available.length < catalogs.length ? "partial" : "api";
await writeFile(path.join(destination, "movies.json"), JSON.stringify({
  movies: movieSnapshot,
  source: sourceType
}, null, 2), "utf8");
if (available.length < catalogs.length) {
  console.warn("Some movie categories were unavailable; the built-in catalog is included.");
}
console.log(`Static site prepared in ${destination}`);
