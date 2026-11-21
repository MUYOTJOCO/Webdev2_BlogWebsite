import { createPost, escapeHtml, validPost } from "./main.js";
import { searchMovies } from "./movies.js";

const form = document.querySelector("#post-form");
const message = document.querySelector("#form-message");
const button = form.querySelector('button[type="submit"]');
const movieSearch = document.querySelector("#movie-search");
const movieResults = document.querySelector("#movie-results");
const movieTitle = form.elements.movieTitle;
const poster = form.elements.poster;

const initialMovie = new URLSearchParams(location.search);
if (initialMovie.has("movie")) {
  movieTitle.value = initialMovie.get("movie").slice(0, 140);
  poster.value = initialMovie.get("poster") || "";
}

let searchSequence = 0;
let searchTimer;
movieSearch.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const query = movieSearch.value.trim();
  const sequence = ++searchSequence;
  if (query.length < 2) {
    movieResults.innerHTML = "";
    return;
  }
  movieResults.textContent = "Searching movies...";
  searchTimer = setTimeout(async () => {
    try {
      const result = await searchMovies(query, 6);
      if (sequence !== searchSequence) return;
      const notice = result.source === "local"
        ? "Live catalog unavailable."
        : result.source === "partial"
          ? "Some catalog categories are unavailable."
          : result.source === "bundled" ? "Using the built-in movie catalog." : "";
      movieResults.innerHTML = result.movies.length
        ? `${notice ? `<span>${notice} Showing available titles.</span>` : ""}${result.movies.map((movie) => `<button class="movie-result" type="button" data-title="${escapeHtml(movie.title)}" data-poster="${escapeHtml(movie.poster)}">${escapeHtml(movie.title)} <span>${escapeHtml(movie.category)}</span></button>`).join("")}`
        : `${notice ? `${notice} ` : ""}No matching movies found.`;
    } catch (error) {
      if (sequence !== searchSequence) return;
      movieResults.textContent = `${error.message} You can still enter the movie title manually.`;
    }
  }, 250);
});

movieResults.addEventListener("click", (event) => {
  const result = event.target.closest("[data-title]");
  if (!result) return;
  movieTitle.value = result.dataset.title;
  poster.value = result.dataset.poster;
  movieSearch.value = result.dataset.title;
  movieResults.textContent = `Selected ${result.dataset.title}.`;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.classList.add("hidden");
  const values = Object.fromEntries(new FormData(form));
  for (const key of Object.keys(values)) values[key] = values[key].trim();
  const validationError = validPost(values);
  if (validationError) {
    message.textContent = validationError;
    message.classList.remove("hidden");
    return;
  }
  button.disabled = true;
  button.textContent = "Publishing...";
  try {
    await createPost(values);
    location.href = "blog.html";
  } catch (error) {
    message.textContent = error.message;
    message.classList.remove("hidden");
    button.disabled = false;
    button.innerHTML = 'Publish story <span>↗</span>';
  }
});
