# BalasAI

**Private AI triage & reply drafting for WhatsApp sellers** — paste a customer conversation and get an instant triage card plus a ready-to-send reply. The fast path runs **on-device** with Gemini Nano when Chrome offers it (private, free, offline-capable); a **cloud deep-dive** is one tap away for long threads.

Built with **Firebase AI Logic hybrid inference** for the #BuildHybridAI 2026 hackathon (Web/Chrome).

## Why hybrid?

Customer chats contain names, phone numbers, addresses and payment complaints. Sending every message to the cloud is a privacy cost and a per-token cost. BalasAI routes each job to the right brain:

| Job | Model config | Why |
|---|---|---|
| Triage (intent, urgency, sentiment, summary) | `PREFER_ON_DEVICE`, structured JSON on both paths | Small, fast, private — ideal for Gemini Nano |
| Reply draft | `PREFER_ON_DEVICE`, streamed | Same |
| Deep dive (long-thread summary, unanswered questions, promises made) | `PREFER_IN_CLOUD`, larger Gemini model | Needs the big context window — used only when the seller asks |

Every answer carries a badge showing its real serving path (`response.inferenceSource` → `ON_DEVICE` / `IN_CLOUD`), and the route log records path + latency for every request. History is stored **only on the device** (localStorage).

## Try it

- **Live demo:** _(GitHub Pages URL — added at deployment)_
- **Run locally:** any static server, e.g. `npx serve .` or `python3 -m http.server`, then open the page in Chrome.
- Three built-in sample conversations (Indonesian, English, and a mixed ID/EN thread) give a result in two clicks.

> On-device inference needs **Chrome on Desktop v139+** with Gemini Nano available. Everywhere else, the same code answers from the cloud — that's the point of hybrid.

## Setup (your own Firebase project)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com) and add a **Web app**.
2. In the console: **AI Services → AI Logic → Get started**, and choose the **Gemini Developer API** provider (free tier, no billing). This also enforces **App Check**, which AI Logic requires.
3. Copy your web app's `firebaseConfig` into [`js/firebase-config.js`](js/firebase-config.js). (It's a client identifier, not a secret — but never commit server keys or service-account files.)
4. Satisfy App Check one of two ways (see the comments in `js/firebase-config.js`):
   - register **reCAPTCHA v3** in the console and paste the site key, or
   - set a **debug token** in the config and register that string under App Check → Apps → *Manage debug tokens* (the hackathon rules explicitly accept debug tokens).
5. Serve the folder statically (or deploy to GitHub Pages / Firebase Hosting).

## How it works

- [`js/ai.js`](js/ai.js) — all Firebase AI Logic wiring: `getAI` with `GoogleAIBackend`, `getGenerativeModel` with `InferenceMode.PREFER_ON_DEVICE` / `PREFER_IN_CLOUD`, the triage `Schema` passed as cloud `responseSchema` **and** on-device `responseConstraint`, `initializeDeviceModel()` on first user interaction, and `inferenceSource` reporting.
- [`js/app.js`](js/app.js) — UI, samples, route log, local-only history, service-worker registration.
- On-device limits are respected by design: single-turn tasks only (no chat memory on the fast path), text in / text out.

## Project structure

```
index.html            UI shell + import map (Firebase JS SDK v13.0.0 via CDN)
styles.css
manifest.webmanifest  PWA metadata
sw.js                 App-shell cache (offline UI)
icons/                PWA icons
js/
  firebase-config.js  Your Firebase config + App Check options (placeholder)
  ai.js               Hybrid-inference wiring
  app.js              UI logic
```

## Disclosure

New project, created during the #BuildHybridAI 2026 submission period. Built with the help of AI coding tools, as the contest rules expressly permit; no pre-existing project code was incorporated. The only third-party code is the Firebase JavaScript SDK, loaded from Google's CDN at runtime.

## License

MIT — see [LICENSE](LICENSE).
