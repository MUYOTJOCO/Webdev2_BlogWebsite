import bodyParser from "body-parser";
import express from "express";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { samplePosts } from "../public/js/sample-posts.js";
import { mergeMovies, normalizeMovies } from "../public/js/movies.js";

const app = express();
const port = Number(process.env.PORT) || 3000;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = path.resolve(process.env.DATA_FILE || path.join(projectRoot, "data", "movie-blog.json"));
const movieApiBaseUrl = (process.env.MOVIE_API_BASE_URL || "https://api.sampleapis.com/movies").replace(/\/+$/, "");
const publicDirectory = path.join(projectRoot, "public");
const genres = new Set(["Action", "Horror", "Comedy", "Romance", "Sci-Fi", "Drama", "Other"]);
const movieCatalogs = [
  ["Animation", "animation"],
  ["Classic", "classic"],
  ["Comedy", "comedy"],
  ["Drama", "drama"],
  ["Horror", "horror"]
];
const maxTitleLength = 140;
const maxContentLength = 20000;

app.disable("x-powered-by");
app.use((request, response, next) => {
  const allowedOrigin = process.env.CORS_ORIGIN || "*";
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Comment-Owner-Token");
  if (request.method === "OPTIONS") return response.sendStatus(204);
  next();
});
app.use(bodyParser.json({ limit: "1mb" }));

let writeQueue = Promise.resolve();

app.get("/api/movies/search", async (request, response) => {
  const query = cleanText(request.query.query).slice(0, 140);
  const requestedLimit = Number(request.query.limit);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 50) : 12;
  const results = await Promise.allSettled(movieCatalogs.map(async ([category, catalog]) => {
    const params = new URLSearchParams({ _limit: String(limit) });
    if (query) params.set("title_like", query);
    const result = await fetch(`${movieApiBaseUrl}/${catalog}?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!result.ok) throw new Error(`Movie catalog request failed (${result.status}).`);
    return normalizeMovies(await result.json(), category);
  }));
  const available = results.filter((result) => result.status === "fulfilled");
  const source = available.length === 0 ? "local" : available.length < results.length ? "partial" : "api";
  const catalogs = available.flatMap((result) => result.value);
  response.json({ movies: mergeMovies(catalogs, query, limit), source });
});

async function readStore() {
  try {
    const contents = await readFile(dataFile, "utf8");
    const store = JSON.parse(contents);
    if (!Array.isArray(store.posts)) throw new Error("The data file has an invalid format.");
    return store;
  } catch (error) {
    if (error.code === "ENOENT") return { posts: samplePosts.map((post) => ({ ...post, comments: [] })) };
    throw error;
  }
}

function updateStore(update) {
  const operation = writeQueue.then(async () => {
    const store = await readStore();
    const result = await update(store);
    await mkdir(path.dirname(dataFile), { recursive: true });
    const temporaryFile = `${dataFile}.${randomUUID()}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(store, null, 2), "utf8");
    await rename(temporaryFile, dataFile);
    return result;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validImageUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validatePost(body) {
  const post = {
    movieTitle: cleanText(body.movieTitle),
    title: cleanText(body.title),
    author: cleanText(body.author) || "Anonymous",
    genre: cleanText(body.genre) || "Other",
    poster: cleanText(body.poster),
    content: cleanText(body.content)
  };
  if (!post.title && post.movieTitle) post.title = `Thoughts on ${post.movieTitle}`;
  const errors = [];
  if (!post.movieTitle || post.movieTitle.length > maxTitleLength) errors.push("Movie title is required and must be 140 characters or fewer.");
  if (!post.title || post.title.length > maxTitleLength) errors.push("Blog title is required and must be 140 characters or fewer.");
  if (post.author.length > 80) errors.push("Author name must be 80 characters or fewer.");
  if (!genres.has(post.genre)) errors.push("Choose a valid movie genre.");
  if (!validImageUrl(post.poster)) errors.push("Poster URL must use HTTP or HTTPS.");
  if (!post.content || post.content.length > maxContentLength) errors.push("Article content is required and must be 20,000 characters or fewer.");
  return { post, errors };
}

function publicComment(comment) {
  const { ownerToken, ...visibleComment } = comment;
  return visibleComment;
}

function publicPost(post) {
  return { ...post, comments: (post.comments || []).map(publicComment) };
}

app.get("/api/posts", async (request, response, next) => {
  try {
    const { posts } = await readStore();
    response.json([...posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicPost));
  } catch (error) {
    next(error);
  }
});

app.get("/api/posts/:postId", async (request, response, next) => {
  try {
    const { posts } = await readStore();
    const post = posts.find((item) => item.id === request.params.postId);
    if (!post) return response.status(404).json({ error: "Post not found." });
    response.json(publicPost(post));
  } catch (error) {
    next(error);
  }
});

app.post("/api/posts", async (request, response, next) => {
  try {
    const { post, errors } = validatePost(request.body || {});
    if (errors.length) return response.status(400).json({ error: errors.join(" ") });
    const created = await updateStore((store) => {
      const newPost = {
        id: randomUUID(),
        ...post,
        createdAt: new Date().toISOString(),
        comments: []
      };
      store.posts.push(newPost);
      return newPost;
    });
    response.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

app.get("/api/posts/:postId/comments", async (request, response, next) => {
  try {
    const { posts } = await readStore();
    const post = posts.find((item) => item.id === request.params.postId);
    if (!post) return response.status(404).json({ error: "Post not found." });
    response.json((post.comments || []).map(publicComment));
  } catch (error) {
    next(error);
  }
});

app.post("/api/posts/:postId/comments", async (request, response, next) => {
  try {
    const author = cleanText(request.body?.author) || "Anonymous";
    const text = cleanText(request.body?.text);
    if (author.length > 80) return response.status(400).json({ error: "Name must be 80 characters or fewer." });
    if (!text || text.length > 2000) return response.status(400).json({ error: "Comment is required and must be 2,000 characters or fewer." });
    const comment = await updateStore((store) => {
      const post = store.posts.find((item) => item.id === request.params.postId);
      if (!post) return null;
      post.comments = post.comments || [];
      const created = {
        id: randomUUID(),
        author,
        text,
        createdAt: new Date().toISOString(),
        ownerToken: randomUUID()
      };
      post.comments.push(created);
      return created;
    });
    if (!comment) return response.status(404).json({ error: "Post not found." });
    response.status(201).json(comment);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/posts/:postId/comments/:commentId", async (request, response, next) => {
  try {
    const ownerToken = request.get("X-Comment-Owner-Token");
    if (!ownerToken) return response.status(401).json({ error: "Comment ownership token is required." });
    const result = await updateStore((store) => {
      const post = store.posts.find((item) => item.id === request.params.postId);
      if (!post) return "post-missing";
      const index = (post.comments || []).findIndex((comment) => comment.id === request.params.commentId);
      if (index < 0) return "comment-missing";
      if (post.comments[index].ownerToken !== ownerToken) return "not-owner";
      post.comments.splice(index, 1);
      return "deleted";
    });
    if (result === "post-missing") return response.status(404).json({ error: "Post not found." });
    if (result === "comment-missing") return response.status(404).json({ error: "Comment not found." });
    if (result === "not-owner") return response.status(403).json({ error: "You can only delete comments created in this browser." });
    response.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(publicDirectory));
app.use((error, request, response, next) => {
  console.error(error);
  if (response.headersSent) return next(error);
  if (error.type === "entity.parse.failed") return response.status(400).json({ error: "Request body must be valid JSON." });
  response.status(500).json({ error: "An unexpected server error occurred." });
});

app.listen(port, () => {
  console.log(`Reel Talk is running at http://localhost:${port}`);
});
