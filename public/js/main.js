import { samplePosts } from "./sample-posts.js";

const STORAGE_KEY = "reel-talk-store-v1";
const GENRES = ["Action", "Horror", "Comedy", "Romance", "Sci-Fi", "Drama", "Other"];

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function imageUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function localStore() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.posts)) return parsed;
    }
  } catch (error) {
    console.error("Could not read the local blog data.", error);
    throw new Error("Saved blog data could not be read. Clear this site's storage to continue.");
  }
  const initial = { posts: samplePosts.map((post) => ({ ...post, comments: [] })) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

function saveLocal(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.error("Could not save blog data locally.", error);
    throw new Error("Your browser could not save this change. Check available storage and try again.");
  }
}

export async function getPosts() {
  return [...localStore().posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function createPost(values) {
  const postValues = {
    ...values,
    title: values.title || `Thoughts on ${values.movieTitle}`,
    author: values.author || "Anonymous",
    genre: values.genre || "Other",
    poster: values.poster || ""
  };
  const post = {
    ...postValues,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    comments: []
  };
  const store = localStore();
  store.posts.push(post);
  saveLocal(store);
  return post;
}

export async function getComments(postId) {
  const post = localStore().posts.find((item) => item.id === postId);
  return post?.comments || [];
}

export async function addComment(postId, values) {
  const commentValues = { ...values, author: values.author || "Anonymous" };
  const store = localStore();
  const post = store.posts.find((item) => item.id === postId);
  if (!post) throw new Error("This post could not be found.");
  const comment = { id: crypto.randomUUID(), ...commentValues, createdAt: new Date().toISOString() };
  post.comments = post.comments || [];
  post.comments.push(comment);
  saveLocal(store);
  saveOwnerToken(comment.id, "local");
  return comment;
}

function ownerStorageKey(commentId) {
  return `reel-talk-comment-owner-${commentId}`;
}

export function saveOwnerToken(commentId, token) {
  if (token) localStorage.setItem(ownerStorageKey(commentId), token);
}

export function canDeleteComment(commentId) {
  return Boolean(localStorage.getItem(ownerStorageKey(commentId)));
}

export async function deleteComment(postId, commentId) {
  const token = localStorage.getItem(ownerStorageKey(commentId));
  if (!token) throw new Error("You can only delete comments created in this browser.");
  const store = localStore();
  const post = store.posts.find((item) => item.id === postId);
  if (!post) throw new Error("This post could not be found.");
  post.comments = (post.comments || []).filter((comment) => comment.id !== commentId);
  saveLocal(store);
  localStorage.removeItem(ownerStorageKey(commentId));
}

export function validPost(values) {
  if (!values.movieTitle || values.movieTitle.length > 140) return "Enter a movie title (140 characters maximum).";
  if (values.title && values.title.length > 140) return "Review headline must be 140 characters or fewer.";
  if (values.author && values.author.length > 80) return "Name must be 80 characters or fewer.";
  if (values.genre && !GENRES.includes(values.genre)) return "Choose one of the listed movie genres.";
  if (values.poster && !imageUrl(values.poster)) return "Poster URL must be a valid HTTP or HTTPS link.";
  if (!values.content || values.content.length > 20000) return "Share your thoughts (20,000 characters maximum).";
  return "";
}

export function setupNavigation() {
  const button = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".main-nav");
  button?.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    button.setAttribute("aria-expanded", String(isOpen));
  });
}

setupNavigation();
