# Dwarf Quest Tracker — Firebase + Netlify Setup

This is the same app you've been using, with one real change underneath: it now talks to a
proper Firebase Realtime Database instead of Claude's artifact storage. That gets you true
real-time sync (instant updates, not a 7-second poll) and, more importantly, a database that
can actually guarantee two people's saves don't overwrite each other — the thing we kept
chasing bugs around before.

Everything below marked **(you do this)** requires your own accounts and can't be done for you.
Everything else is already written.

---

## 1. Create a Firebase project **(you do this)**

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with any
   Google account.
2. Click **Add project**, give it a name (e.g. "dwarf-quest"), and finish the wizard. You can
   decline Google Analytics — you don't need it.
3. Once created, in the left sidebar go to **Build → Realtime Database**.
4. Click **Create Database**. Pick any region close to you. Start in **test mode** for now —
   we'll lock it down properly in step 3 below, but test mode lets you get running immediately.

## 2. Get your Firebase config **(you do this)**

1. In the Firebase console, click the gear icon next to "Project Overview" → **Project settings**.
2. Scroll to "Your apps" and click the **</>** (web) icon to register a new web app. Give it any
   nickname. You don't need Firebase Hosting — just click through to finish.
3. You'll be shown a `firebaseConfig` object with values like `apiKey`, `authDomain`, etc. Keep
   this tab open — you'll copy these into Netlify in step 4.
4. One value won't be in that snippet: your **Database URL**. Find it on the Realtime Database
   page from step 1 — it looks like `https://your-project-default-rtdb.firebaseio.com`.

## 3. Lock down database access **(you do this, but here's exactly what to paste)**

Test mode leaves your database wide open to anyone on the internet who finds the URL. For a
private campaign tracker this is a real (if unlikely) risk worth closing before your event. In
the Realtime Database page, go to the **Rules** tab and replace the contents with:

```json
{
  "rules": {
    "campaigns": {
      "dq27": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

This scopes read/write to just this one campaign's data (not your whole Firebase project) while
still keeping things simple — no login system needed for your group. Click **Publish**.

*(If you want real access control later — e.g. requiring a shared passphrase — that's a further
step we can add; this level matches what you already had with a published Claude link.)*

## 4. Connect Netlify **(you do this)**

Since you're already using Netlify:

1. Push this project folder to a new GitHub (or GitLab/Bitbucket) repo.
2. In Netlify, **Add new site → Import an existing project**, and point it at that repo. Netlify
   will detect `netlify.toml` automatically (build command and publish folder are already set).
3. Before deploying, go to **Site settings → Environment variables** and add each of these,
   using the values from step 2:

   | Key | Value |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | from firebaseConfig |
   | `VITE_FIREBASE_AUTH_DOMAIN` | from firebaseConfig |
   | `VITE_FIREBASE_DATABASE_URL` | from the Realtime Database page |
   | `VITE_FIREBASE_PROJECT_ID` | from firebaseConfig |
   | `VITE_FIREBASE_STORAGE_BUCKET` | from firebaseConfig |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | from firebaseConfig |
   | `VITE_FIREBASE_APP_ID` | from firebaseConfig |

4. Trigger a deploy. That's it — your group uses the resulting Netlify URL exactly like the old
   published Claude link.

## 5. Local development (optional)

```bash
npm install
cp .env.example .env      # then fill in the same values as above
npm run dev
```

---

## What actually changed under the hood

- **Each player's war band now lives at its own database path** (`players/{id}`), instead of
  everyone sharing one giant blob. Two players editing their own war bands at the same time now
  genuinely cannot collide — they're writing to different places entirely.
- **Real-time push, not polling.** Changes show up instantly on every device instead of within
  ~7 seconds.
- **The one class of bug we kept fighting on the old storage** — a save silently overwriting
  someone else's more recent change — is structurally much harder to hit now, because most
  writes touch narrow, isolated paths rather than the whole campaign at once.

## What I haven't hardened yet (next step, not urgent)

The Barracks (claiming/releasing a shared mercenary) and the renown/turn-tally button are the
two places multiple people could still, in principle, act on the exact same shared value at the
same moment. Firebase has a real "only apply this if nothing else changed" primitive
(`runTransaction`) built for exactly this, and the groundwork for it is already in `firebase.js`
— it just isn't wired into those two specific screens yet. Worth doing before the event, but it's
a small, contained addition on top of what's here, not something blocking you from testing now.

## A note on testing

I've written and reasoned through this code carefully, but I don't have a way to run a real (or
emulated) Firebase database in my own environment to test it end-to-end the way I stress-tested
the previous version in a real browser. Please do a real test pass once this is deployed —
multiple devices, rapid actions, the works — and bring me anything that looks off. I'd treat this
as "should work, not yet proven" until that happens.
