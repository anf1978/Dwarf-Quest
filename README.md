# Dwarf Quest Tracker — GitHub Pages Setup

This app is hosted entirely on GitHub — no third-party hosting account needed. Every time you
push to `main`, a GitHub Actions workflow automatically builds the app and publishes it to
GitHub Pages.

The data layer (Firebase Realtime Database) is unchanged — this only replaces *how the site is
hosted*, not how the app works.

---

## One-time setup

### 1. Turn on GitHub Pages for this repo

1. Go to your repo on GitHub → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions** (not "Deploy from a
   branch" — that's the older method and won't use the workflow file included here).

### 2. Add your Firebase config as repository secrets

Same seven values you had in Netlify, just added in a different place:

1. Go to **Settings → Secrets and variables → Actions**.
2. Click **New repository secret** seven times, once for each of:

   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_DATABASE_URL`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

   Use the exact same values as before. These are **secrets**, not "variables" — make sure
   you're in the right tab, since the workflow file specifically looks for secrets.

### 3. Push to `main`

That's it — pushing to `main` triggers `.github/workflows/deploy.yml`, which installs
dependencies, runs `npm run build`, and publishes the result. You can watch it run under your
repo's **Actions** tab, which shows a build log in a similar shape to what you saw on Netlify.

### 4. Your site's URL

**https://anf1978.github.io/Dwarf-Quest/**

The trailing slash matters here — this is a subpath, not the domain root, so `vite.config.js`
is configured with `base: "/Dwarf-Quest/"` to match. If you ever rename the repo, that value
needs to change to match.

---

## Why this instead of Netlify

Free forever, with no build-minute budget to run out of. It also removes an entire category of
"why didn't my push show up" problems, since there's no separate third-party service's webhook
connection to your repo that can quietly desync — GitHub is building its own repo directly.

## What changed from the Netlify version

- `vite.config.js` now sets `base: "/Dwarf-Quest/"` so every asset path resolves correctly from
  the subpath GitHub Pages serves this repo from.
- The favicon links in `index.html` use Vite's `%BASE_URL%` placeholder instead of a hardcoded
  `/`.
- The logo `<img>` in `App.jsx` builds its path from `import.meta.env.BASE_URL` for the same
  reason — a plain `/dq-rune-hero.png` would have pointed at the wrong place.
- Nothing about Firebase, the app's features, or its behavior changed at all.

## A note on testing

Same caveat as the Firebase migration itself: I've written and validated this carefully, but I
don't have a way to run a real GitHub Actions build or a live GitHub Pages deployment from my
own environment. Please treat this as "should work" until you've seen the Actions tab actually
turn green and the real URL load correctly.
