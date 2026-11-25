// ─────────────────────────────────────────────────────────────────────────────
// Firebase configuration — project "bot-reply-fd7cd" (created by the user in
// the Firebase console on 2026-11-21; values from Project settings → General
// → Your apps → Web app → SDK setup).
//
// The web firebaseConfig is a *client identifier*: it ships in every Firebase
// web app and is not a server secret. The app is protected by Firebase
// App Check (enforced automatically by the AI Logic guided setup) and by
// API-key restrictions in Google Cloud Console. Never put server keys,
// service-account JSON, or any real secret in this file or this repo
// (the contest rules also prohibit that).
// ─────────────────────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyAE-NV4-_oU19FPyhD3NEECs1XP7LlbUvc",
  authDomain: "bot-reply-fd7cd.firebaseapp.com",
  projectId: "bot-reply-fd7cd",
  storageBucket: "bot-reply-fd7cd.firebasestorage.app",
  messagingSenderId: "270214836425",
  appId: "1:270214836425:web:4cc012bfd3d3eceb4c9d18",
};

/** True once real config values have been pasted in. */
export const IS_CONFIGURED = firebaseConfig.apiKey !== "REPLACE_ME";

// ── App Check ────────────────────────────────────────────────────────────────
// AI Logic enforces App Check. Two supported ways to satisfy it:
//
//  A) reCAPTCHA v3 (production): register reCAPTCHA v3 in
//     Firebase console → App Check, then paste the site key here.
//  B) Debug token (accepted in hackathon submissions per the official rules):
//     APPCHECK_DEBUG_TOKEN below is a random UUID generated for this project
//     on 2026-11-21. It only starts working once that exact string is
//     registered in Firebase console → App Check → Apps → the web app →
//     "Manage debug tokens" (user console step, due by Tue Nov 25).
//     Until then, cloud calls fail with App Check errors, which the UI
//     surfaces honestly. On-device inference is not affected by App Check.
export const RECAPTCHA_V3_SITE_KEY = ""; // e.g. "6Lc..." — option A
export const APPCHECK_DEBUG_TOKEN = "5493be71-3a38-4c7c-9c0c-fe0788de01b3"; // option B — register this string in the console
