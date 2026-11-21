import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

class MemoryStorage {
  #values = new Map();

  clear() {
    this.#values.clear();
  }

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

let originalDocument;
let originalLocalStorage;
let originalLocation;
let originalFetch;
let blog;

before(async () => {
  originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  originalFetch = globalThis.fetch;
  globalThis.document = { querySelector: () => null };
  globalThis.localStorage = new MemoryStorage();
  globalThis.location = { hostname: "localhost", origin: "http://localhost:3000" };
  blog = await import("../public/js/main.js");
});

beforeEach(() => {
  globalThis.localStorage.clear();
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
  else delete globalThis.document;
  if (originalLocalStorage) Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  else delete globalThis.localStorage;
  if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation);
  else delete globalThis.location;
});

test("stores reviews in this browser on localhost", async () => {
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    throw new Error("Reviews should not be sent to a server.");
  };

  const post = await blog.createPost({
    movieTitle: "Arrival",
    title: "A thoughtful film",
    author: "Reader",
    genre: "Sci-Fi",
    poster: "",
    content: "A local review."
  });

  assert.ok(post.id);
  assert.equal((await blog.getPosts()).find((item) => item.id === post.id).content, "A local review.");
  assert.ok(globalThis.localStorage.getItem("reel-talk-store-v1"));
  assert.equal(fetchCalls, 0);
});

test("stores and deletes comments in this browser", async () => {
  globalThis.fetch = () => {
    throw new Error("Comments should not be sent to a server.");
  };

  await blog.addComment("sample-avatar", { author: "Reader", text: "A local comment." });
  const [comment] = await blog.getComments("sample-avatar");

  assert.equal(comment.text, "A local comment.");
  assert.equal(blog.canDeleteComment(comment.id), true);

  await blog.deleteComment("sample-avatar", comment.id);

  assert.deepEqual(await blog.getComments("sample-avatar"), []);
  assert.equal(blog.canDeleteComment(comment.id), false);
});
