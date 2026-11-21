import { fallbackMovies } from "./movie-catalog.js";

const movieCatalogs = [
  ["Animation", "animation"],
  ["Classic", "classic"],
  ["Comedy", "comedy"],
  ["Drama", "drama"],
  ["Horror", "horror"]
];

export function normalizeMovies(records, category) {
  if (!Array.isArray(records)) throw new Error("The movie catalog returned an unexpected response.");
  return records.flatMap((record) => {
    if (!record || typeof record.title !== "string" || !record.title.trim()) return [];
    let poster = "";
    try {
      const url = new URL(record.posterURL);
      if (url.protocol === "https:") poster = url.href;
    } catch {}
    return [{
      id: typeof record.imdbId === "string" ? record.imdbId : `${category}-${record.id}`,
      title: record.title.trim(),
      poster,
      category
    }];
  });
}

export function searchFallbackMovies(query = "", limit = 12) {
  const term = query.trim().toLowerCase();
  return fallbackMovies.filter((movie) => !term || movie.title.toLowerCase().includes(term)).slice(0, limit);
}

async function getLocalMovies(query, limit) {
  const params = new URLSearchParams({ query, limit: String(limit) });
  const response = await fetch(`/api/movies/search?${params}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`The movie search is unavailable (${response.status}).`);
  const result = await response.json();
  if (!result || !Array.isArray(result.movies) || !["api", "partial", "local"].includes(result.source)) {
    throw new Error("The movie search returned an unexpected response.");
  }
  return result;
}

async function getPublishedMovies(query, limit) {
  try {
    const response = await fetch(new URL("../movies.json", import.meta.url), { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`The published movie catalog is unavailable (${response.status}).`);
    const catalog = await response.json();
    if (!catalog || !Array.isArray(catalog.movies) || !["api", "partial", "bundled"].includes(catalog.source)) {
      throw new Error("The published movie catalog returned an unexpected response.");
    }
    const term = query.trim().toLowerCase();
    const movies = catalog.movies.filter((movie) => movie && typeof movie.title === "string")
      .filter((movie) => !term || movie.title.toLowerCase().includes(term))
      .slice(0, limit);
    return { movies, source: catalog.source };
  } catch {
    return { movies: searchFallbackMovies(query, limit), source: "bundled" };
  }
}

export async function getMovies(query = "", limit = 12) {
  const term = query.trim();
  if (["localhost", "127.0.0.1"].includes(globalThis.location?.hostname)) return getLocalMovies(term, limit);
  return getPublishedMovies(term, limit);
}

export async function searchMovies(query, limit = 12) {
  return getMovies(query, limit);
}

export function mergeMovies(catalogs, query = "", limit = 12) {
  const term = query.trim().toLowerCase();
  const seen = new Set();
  return [...catalogs, ...fallbackMovies].filter((movie) => {
    if (!movie || typeof movie.title !== "string" || (term && !movie.title.toLowerCase().includes(term))) return false;
    const key = movie.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}
