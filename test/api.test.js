import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

let server;
let movieApiServer;
let dataDirectory;
let baseUrl;
let movieApiMode = "live";

async function unusedPort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/posts`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("The test API server did not start.");
}

before(async () => {
  dataDirectory = await mkdtemp(path.join(os.tmpdir(), "reel-talk-test-"));
  const movieApiPort = await unusedPort();
  movieApiServer = createServer((request, response) => {
    const catalog = new URL(request.url, "http://localhost").pathname.split("/").pop();
    const shouldFail = movieApiMode === "offline" || (movieApiMode === "partial" && catalog !== "animation");
    if (shouldFail) {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Unavailable" }));
      return;
    }
    const movies = catalog === "animation"
      ? [{ id: 1, title: "WALL-E", posterURL: "https://example.com/wall-e.jpg" }]
      : catalog === "drama"
        ? [{ imdbId: "tt0120338", title: "Titanic", posterURL: "https://example.com/titanic.jpg" }]
        : [];
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(movies));
  });
  await new Promise((resolve) => movieApiServer.listen(movieApiPort, "127.0.0.1", resolve));
  const port = await unusedPort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server/module.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: path.join(dataDirectory, "posts.json"),
      MOVIE_API_BASE_URL: `http://127.0.0.1:${movieApiPort}/movies`
    },
    stdio: "ignore"
  });
  await waitForServer();
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
  if (movieApiServer) await new Promise((resolve) => movieApiServer.close(resolve));
  if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true });
});

test("requires only movie thoughts and comment text, and protects comment ownership", async () => {
  const invalid = await fetch(`${baseUrl}/api/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Missing required fields" })
  });
  assert.equal(invalid.status, 400);

  const createdResponse = await fetch(`${baseUrl}/api/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ movieTitle: "Arrival", content: "A thoughtful review." })
  });
  assert.equal(createdResponse.status, 201);
  const post = await createdResponse.json();
  assert.ok(post.id);
  assert.equal(post.title, "Thoughts on Arrival");
  assert.equal(post.author, "Anonymous");
  assert.equal(post.genre, "Other");
  assert.equal((await (await fetch(`${baseUrl}/api/posts/${post.id}`)).json()).movieTitle, "Arrival");

  const commentResponse = await fetch(`${baseUrl}/api/posts/${post.id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Great perspective." })
  });
  assert.equal(commentResponse.status, 201);
  const comment = await commentResponse.json();
  assert.ok(comment.ownerToken);
  assert.equal(comment.author, "Anonymous");

  const listedComments = await (await fetch(`${baseUrl}/api/posts/${post.id}/comments`)).json();
  assert.equal(listedComments.length, 1);
  assert.equal("ownerToken" in listedComments[0], false);
  const listedPosts = await (await fetch(`${baseUrl}/api/posts`)).json();
  assert.equal("ownerToken" in listedPosts[0].comments[0], false);

  const unauthorized = await fetch(`${baseUrl}/api/posts/${post.id}/comments/${comment.id}`, {
    method: "DELETE",
    headers: { "X-Comment-Owner-Token": "not-the-owner" }
  });
  assert.equal(unauthorized.status, 403);

  const deleted = await fetch(`${baseUrl}/api/posts/${post.id}/comments/${comment.id}`, {
    method: "DELETE",
    headers: { "X-Comment-Owner-Token": comment.ownerToken }
  });
  assert.equal(deleted.status, 204);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/posts/${post.id}/comments`)).json(), []);
});

test("searches live movie catalogs through the local API", async () => {
  movieApiMode = "live";
  const response = await fetch(`${baseUrl}/api/movies/search?query=titanic`);

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, "api");
  assert.deepEqual(result.movies.map((movie) => movie.title), ["Titanic"]);
});

test("returns successful catalog results when another category is unavailable", async () => {
  movieApiMode = "partial";
  const response = await fetch(`${baseUrl}/api/movies/search?query=wall-e`);

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, "partial");
  assert.deepEqual(result.movies.map((movie) => movie.title), ["WALL-E"]);
});

test("searches built-in movie titles when every upstream category is unavailable", async () => {
  movieApiMode = "offline";
  const response = await fetch(`${baseUrl}/api/movies/search?query=titanic`);

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, "local");
  assert.deepEqual(result.movies.map((movie) => movie.title), ["Titanic"]);
});
