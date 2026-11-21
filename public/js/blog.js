import { addComment, canDeleteComment, deleteComment, escapeHtml, formatDate, getComments, getPosts, imageUrl } from "./main.js";

const list = document.querySelector("#blog-list");
const count = document.querySelector("#post-count");
const search = document.querySelector("#blog-search");
const empty = document.querySelector("#blog-empty");
let posts = [];

function matchingPosts() {
  const query = search.value.trim().toLowerCase();
  return posts.filter((post) => [post.title, post.movieTitle, post.author, post.genre, post.content].some((value) => value.toLowerCase().includes(query)));
}

function render() {
  const filtered = matchingPosts();
  count.textContent = `${filtered.length} ${filtered.length === 1 ? "story" : "stories"}`;
  list.innerHTML = filtered.map((post) => {
    const poster = imageUrl(post.poster);
    return `<article class="blog-entry" id="${escapeHtml(post.id)}">
      <div class="blog-entry-main">
        ${poster ? `<img class="blog-poster" src="${escapeHtml(poster)}" alt="${escapeHtml(post.movieTitle)} poster" loading="lazy">` : `<div class="blog-poster" role="img" aria-label="No poster available"></div>`}
        <div class="blog-entry-content">
          <div class="story-meta"><span class="genre-tag">${escapeHtml(post.genre)}</span><span>BY ${escapeHtml(post.author.toUpperCase())}</span><time datetime="${escapeHtml(post.createdAt)}">${formatDate(post.createdAt)}</time></div>
          <h2>${escapeHtml(post.title)}</h2><p class="movie-title">${escapeHtml(post.movieTitle)}</p>
          <div class="article-content">${escapeHtml(post.content)}</div>
        </div>
      </div>
      <section class="comments" aria-label="Comments on ${escapeHtml(post.title)}">
        <h3>Conversation <span class="comment-count" data-count-for="${escapeHtml(post.id)}"></span></h3>
        <div class="comment-list" data-comments-for="${escapeHtml(post.id)}"></div>
        <form class="comment-form" data-post-id="${escapeHtml(post.id)}">
          <input name="author" maxlength="80" placeholder="Your name (optional)" aria-label="Your name, optional">
          <textarea name="text" maxlength="2000" rows="2" placeholder="Share your thoughts..." aria-label="Comment" required></textarea>
          <button type="submit">Post comment</button>
        </form>
        <p class="inline-error hidden" data-error-for="${escapeHtml(post.id)}" role="alert"></p>
      </section>
    </article>`;
  }).join("");
  list.querySelectorAll("img").forEach((image) => image.addEventListener("error", () => image.remove(), { once: true }));
  empty.classList.toggle("hidden", filtered.length > 0);
  empty.textContent = posts.length ? "No stories match your search." : "No stories yet. Be the first to share a review.";
  filtered.forEach((post) => renderComments(post.id));
}

async function renderComments(postId) {
  const container = list.querySelector(`[data-comments-for="${CSS.escape(postId)}"]`);
  if (!container) return;
  try {
    const comments = await getComments(postId);
    const countLabel = list.querySelector(`[data-count-for="${CSS.escape(postId)}"]`);
    if (countLabel) countLabel.textContent = `(${comments.length})`;
    container.innerHTML = comments.map((comment) => `<div class="comment-item">
      <div><strong>${escapeHtml(comment.author)}</strong><time datetime="${escapeHtml(comment.createdAt)}">${formatDate(comment.createdAt)}</time><p>${escapeHtml(comment.text)}</p></div>
      ${canDeleteComment(comment.id) ? `<button class="delete-comment" type="button" data-delete-comment="${escapeHtml(comment.id)}" data-post-id="${escapeHtml(postId)}">Delete</button>` : ""}
    </div>`).join("");
  } catch (error) {
    showError(postId, error.message);
  }
}

function showError(postId, message) {
  const element = list.querySelector(`[data-error-for="${CSS.escape(postId)}"]`);
  if (element) {
    element.textContent = message;
    element.classList.remove("hidden");
  }
}

search.addEventListener("input", render);
list.addEventListener("submit", async (event) => {
  const form = event.target.closest(".comment-form");
  if (!form) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  values.author = values.author.trim();
  values.text = values.text.trim();
  const postId = form.dataset.postId;
  if (!values.text) return showError(postId, "Write a comment before posting.");
  if (values.author.length > 80 || values.text.length > 2000) return showError(postId, "Name must be 80 characters or fewer and comments 2,000 characters or fewer.");
  try {
    await addComment(postId, values);
    form.reset();
    const error = list.querySelector(`[data-error-for="${CSS.escape(postId)}"]`);
    error.classList.add("hidden");
    await renderComments(postId);
  } catch (error) {
    showError(postId, error.message);
  }
});

list.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-comment]");
  if (!button) return;
  button.disabled = true;
  try {
    await deleteComment(button.dataset.postId, button.dataset.deleteComment);
    await renderComments(button.dataset.postId);
  } catch (error) {
    showError(button.dataset.postId, error.message);
    button.disabled = false;
  }
});

try {
  posts = await getPosts();
  render();
  const targetId = decodeURIComponent(location.hash.slice(1));
  if (targetId) document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
} catch (error) {
  count.textContent = "Could not load stories";
  empty.textContent = error.message;
  empty.classList.remove("hidden");
}
