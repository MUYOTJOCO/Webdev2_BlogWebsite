import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeMovies } from "../public/js/movies.js";

test("normalizes movie catalog records and rejects unsafe poster URLs", () => {
  assert.deepEqual(normalizeMovies([
    { imdbId: "tt123", title: "  A Movie  ", posterURL: "https://example.com/poster.jpg" },
    { id: 2, title: "No poster", posterURL: "javascript:alert(1)" },
    { id: 3, title: "   ", posterURL: "https://example.com/ignored.jpg" },
    null
  ], "Drama"), [
    { id: "tt123", title: "A Movie", poster: "https://example.com/poster.jpg", category: "Drama" },
    { id: "Drama-2", title: "No poster", poster: "", category: "Drama" }
  ]);
});

test("rejects malformed catalog responses", () => {
  assert.throws(() => normalizeMovies(null, "Drama"), /unexpected response/);
});
