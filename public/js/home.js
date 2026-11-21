import { escapeHtml, formatDate, getPosts, imageUrl } from "./main.js";
import { searchMovies } from "./movies.js";

const grid = document.querySelector("#story-grid");
const search = document.querySelector("#search-input");
const empty = document.querySelector("#empty-state");
const categoryList = document.querySelector("#category-list");
const movieGrid = document.querySelector("#movie-grid");
const movieSearch = document.querySelector("#movie-search");
const movieStatus = document.querySelector("#movie-status");
let posts = [];
let category = "All";

function renderMovies(movies) {
  movieGrid.innerHTML = movies.map((movie) => {
    const poster = imageUrl(movie.poster);
    const reviewUrl = new URL("create.html", location.href);
    reviewUrl.searchParams.set("movie", movie.title);
    if (poster) reviewUrl.searchParams.set("poster", poster);
    return `<article class="movie-card">
      <a class="movie-poster" href="${escapeHtml(reviewUrl.href)}" aria-label="Write a review of ${escapeHtml(movie.title)}">
        ${poster ? `<img src="${escapeHtml(poster)}" alt="${escapeHtml(movie.title)} poster" loading="lazy">` : ""}
        <span class="genre-tag">${escapeHtml(movie.category)}</span>
      </a>
      <div class="movie-card-body"><h3>${escapeHtml(movie.title)}</h3><a class="read-link" href="${escapeHtml(reviewUrl.href)}">Write a review <span>→</span></a></div>
    </article>`;
  }).join("");
  movieGrid.querySelectorAll("img").forEach((image) => image.addEventListener("error", () => image.remove(), { once: true }));
  movieStatus.classList.toggle("hidden", movies.length > 0);
  if (!movies.length) movieStatus.textContent = "No movies found. Try another search.";
}

let movieSearchSequence = 0;
let movieSearchTimer;
async function updateMovies(sequence = ++movieSearchSequence) {
  movieStatus.textContent = "Loading movies...";
  movieStatus.classList.remove("hidden");
  try {
    const result = await searchMovies(movieSearch.value);
    if (sequence !== movieSearchSequence) return;
    renderMovies(result.movies);
    if (result.source !== "api") {
      movieStatus.textContent = result.source === "local"
        ? result.movies.length
          ? "The live catalog is unavailable. Showing built-in movie titles."
          : "The live catalog is unavailable. No built-in movie titles match this search."
        : result.source === "partial"
          ? result.movies.length
          ? "Some live movie categories are unavailable."
          : "Some live movie categories are unavailable. No matching titles were found."
          : result.movies.length
            ? "Showing the built-in movie catalog."
            : "No matching movies found.";
      movieStatus.classList.remove("hidden");
    }
  } catch (error) {
    if (sequence !== movieSearchSequence) return;
    movieGrid.innerHTML = "";
    movieStatus.textContent = `${error.message} Check your connection and try again.`;
    movieStatus.classList.remove("hidden");
  }
}

function render() {
  const query = search.value.trim().toLowerCase();
  const matches = posts.filter((post) => {
    const textMatch = [post.title, post.movieTitle, post.author, post.genre].some((value) => value.toLowerCase().includes(query));
    return textMatch && (category === "All" || post.genre === category);
  });
  grid.innerHTML = matches.map((post) => {
    const poster = imageUrl(post.poster);
    return `<article class="story-card">
      <a class="poster-wrap" href="blog.html#${encodeURIComponent(post.id)}" aria-label="Read ${escapeHtml(post.title)}">
        ${poster ? `<img src="${escapeHtml(poster)}" alt="${escapeHtml(post.movieTitle)} poster" loading="lazy">` : ""}
        <span class="genre-tag">${escapeHtml(post.genre)}</span>
      </a>
      <div class="story-card-body">
        <div class="story-meta"><span>BY ${escapeHtml(post.author.toUpperCase())}</span><time datetime="${escapeHtml(post.createdAt)}">${formatDate(post.createdAt)}</time></div>
        <h3>${escapeHtml(post.title)}</h3><p class="movie-title">${escapeHtml(post.movieTitle)}</p>
        <p class="story-excerpt">${escapeHtml(post.content.slice(0, 125))}${post.content.length > 125 ? "…" : ""}</p>
        <a class="read-link" href="blog.html#${encodeURIComponent(post.id)}">Read the story <span>→</span></a>
      </div>
    </article>`;
  }).join("");
  empty.classList.toggle("hidden", matches.length > 0);
}

search.addEventListener("input", render);
movieSearch.addEventListener("input", () => {
  clearTimeout(movieSearchTimer);
  const sequence = ++movieSearchSequence;
  if (movieSearch.value.trim().length === 1) {
    movieGrid.innerHTML = "";
    movieStatus.textContent = "Enter at least 2 characters to search.";
    movieStatus.classList.remove("hidden");
    return;
  }
  movieSearchTimer = setTimeout(() => updateMovies(sequence), 300);
});
categoryList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  category = button.dataset.category;
  categoryList.querySelector(".active")?.classList.remove("active");
  button.classList.add("active");
  render();
});

updateMovies();

try {
  posts = await getPosts();
  render();
} catch (error) {
  grid.innerHTML = "";
  empty.textContent = error.message;
  empty.classList.remove("hidden");
}
