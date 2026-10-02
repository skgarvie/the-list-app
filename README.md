# TheList

A small, installable list app built with plain HTML, CSS and JavaScript — no frameworks, no build step, no dependencies.

## Features

- Multiple named lists; swipe left/right to move between them
- Items have a title and an optional comment
- Add items from the form pinned to the bottom of the screen
- Press and hold an item to select it, then swipe it left or right to delete it; tap anywhere else to cancel
- Tap the list name (or ⋮) to rename or delete a list, or to turn on per-list settings: show when items were added, and fade older items (both off by default)
- Swipe past the last list, then name the new list in the bottom bar to create it
- Works offline and can be installed to the home screen
- Each list gets its own colour from a pastel palette
- Follows the system light/dark setting

## Running locally

Serve the folder over HTTP (service workers don't run from `file://`):

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. On desktop, use the ‹ › buttons, the dots, or the arrow keys to switch lists.

To stop the server, press `Ctrl+C` in the terminal where it's running. If it was started in the background or from another terminal, find and stop it by port:

```sh
lsof -ti tcp:8000 | xargs kill
```

Stopping the server doesn't remove the app from your browser: the service worker keeps serving the cached copy at that address, even offline. To clear it out completely, open DevTools → Application → Storage → **Clear site data** (this also deletes your lists).

## Deploying

Upload the folder to any static host with HTTPS (e.g. GitHub Pages, Netlify). All paths are relative, so it works from a subdirectory.

When you ship changes, bump the `CACHE` name in [sw.js](sw.js) (e.g. `thelist-v2`) so installed copies pick up the new files.

## Project structure

| File | Purpose |
| --- | --- |
| [index.html](index.html) | App shell, templates, dialogs, service worker registration |
| [styles.css](styles.css) | Layout, theming, scroll-snap paging |
| [app.js](app.js) | State, persistence, rendering and interactions |
| [sw.js](sw.js) | Cache-first service worker for offline use |
| [manifest.webmanifest](manifest.webmanifest) | PWA install metadata |
| [icons/](icons/) | App icons (SVG, 192/512 PNG, maskable) |

## Data

Everything is stored in the browser's `localStorage` under the key `thelist:v1`:

```json
{
  "lists": [
    {
      "id": "…",
      "name": "My List",
      "hue": 235,
      "showAge": false,
      "fadeOld": false,
      "items": [{ "id": "…", "title": "Milk", "comment": "2L", "createdAt": 1700000000000 }]
    }
  ]
}
```

`hue` is an OKLCH hue angle picked from the palette in [app.js](app.js) (`HUES`); every colour in [styles.css](styles.css) is derived from it.

Data stays on the device and isn't synced. Clearing site data deletes it.
