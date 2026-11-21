import assert from "node:assert/strict";
import { test } from "node:test";
import { searchMovies } from "../public/js/movies.js";

async function withBrowser(fetchCatalog, hostname, run) {
  const originalFetch = globalThis.fetch;
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  globalThis.location = { hostname };
  globalThis.fetch = fetchCatalog;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation);
    else delete globalThis.location;
  }
}

test("uses the same-origin movie search endpoint on localhost", async () => {
  let requestUrl;
  await withBrowser((url) => {
    requestUrl = String(url);
    return Promise.resolve(new Response(JSON.stringify({
      movies: [{ id: "tt0120338", title: "Titanic", poster: "", category: "Drama" }],
      source: "api"
    }), { status: 200 }));
  }, "localhost", async () => {
    const result = await searchMovies("Titanic");

    assert.equal(result.source, "api");
    assert.deepEqual(result.movies.map((movie) => movie.title), ["Titanic"]);
  });
  assert.match(requestUrl, /^\/api\/movies\/search\?/);
});

test("uses the published catalog without cross-origin API requests", async () => {
  let requestUrl;
  await withBrowser((url) => {
    requestUrl = new URL(url).pathname;
    return Promise.resolve(new Response(JSON.stringify({
      movies: [{ id: "tt0120338", title: "Titanic", poster: "", category: "Drama" }],
      source: "api"
    }), { status: 200 }));
  }, "muyotjoco.github.io", async () => {
    const result = await searchMovies("titanic");

    assert.equal(result.source, "api");
    assert.deepEqual(result.movies.map((movie) => movie.title), ["Titanic"]);
  });
  assert.match(requestUrl, /\/movies\.json$/);
});

test("falls back to built-in titles when the published catalog cannot load", async () => {
  await withBrowser(() => Promise.reject(new Error("Catalog is offline.")), "muyotjoco.github.io", async () => {
    const result = await searchMovies("titanic");

    assert.equal(result.source, "bundled");
    assert.deepEqual(result.movies.map((movie) => movie.title), ["Titanic"]);
  });
});
