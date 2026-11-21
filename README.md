# Reel Talk

A movie review site for browsing films, posting reviews, and commenting on stories.

## Run locally

Install dependencies and start the site:

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Reviews and comments

Reviews and comments are saved in the current browser's local storage. They are not sent to the server and are available only in the same browser and site origin.

## Movie search

When running locally, the site requests movie data through its server to avoid browser cross-origin restrictions. GitHub Pages builds include a movie-catalog snapshot, so searches do not depend on cross-origin browser requests. If the catalog API is unavailable during a build or search, the built-in movie titles remain searchable.