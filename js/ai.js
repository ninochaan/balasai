// ─────────────────────────────────────────────────────────────────────────────
// BalasAI — Firebase AI Logic hybrid-inference wiring.
//
// One SDK, two brains:
//   • Fast path  → InferenceMode.PREFER_ON_DEVICE: Chrome's built-in Gemini Nano
//                  (Prompt API) answers on the user's machine when available —
//                  private, free, offline-capable — and the SDK falls back to a
//                  cloud Gemini model when it is not.
//   • Deep dive  → InferenceMode.PREFER_IN_CLOUD: long threads go to a larger
//                  cloud model on purpose.
// Every call reports result.response.inferenceSource ("ON_DEVICE" | "IN_CLOUD")
// so the UI can show, honestly, which brain answered.
//
// Docs: https://firebase.google.com/docs/ai-logic/hybrid-on-device-inference
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  Schema,
} from "firebase/ai";
import {
  firebaseConfig,
  IS_CONFIGURED,
  RECAPTCHA_V3_SITE_KEY,
  APPCHECK_DEBUG_TOKEN,
} from "./firebase-config.js";

export class NotConfiguredError extends Error {
  constructor() {
    super(
      "Firebase is not configured yet. Paste your project's firebaseConfig " +
        "into js/firebase-config.js (see README → Setup)."
    );
    this.name = "NotConfiguredError";
  }
}

let app = null;
let ai = null;
let deviceWarmupStarted = false;

/** Lazily initialize Firebase + App Check + the AI Logic backend. */
function ensureInit() {
  if (!IS_CONFIGURED) throw new NotConfiguredError();
  if (ai) return ai;

  app = initializeApp(firebaseConfig);

  // App Check — required by AI Logic (enforced by the guided console setup).
  // A debug token (registered in the console) takes precedence when provided;
  // the contest rules explicitly accept debug tokens in submissions.
  if (APPCHECK_DEBUG_TOKEN) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = APPCHECK_DEBUG_TOKEN;
  } else if (location.hostname === "localhost") {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true; // token printed in devtools console
  }
  if (RECAPTCHA_V3_SITE_KEY || APPCHECK_DEBUG_TOKEN || location.hostname === "localhost") {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY || "debug-token-mode"),
      isTokenAutoRefreshEnabled: true,
    });
  }

  // Gemini Developer API backend (free tier; no billing required).
  ai = getAI(app, { backend: new GoogleAIBackend() });
  return ai;
}

// ── Models ───────────────────────────────────────────────────────────────────

const triageSchema = Schema.object({
  properties: {
    intent: Schema.enumString({
      enum: [
        "order",
        "price_question",
        "product_question",
        "payment",
        "shipping",
        "complaint",
        "other",
      ],
    }),
    urgency: Schema.enumString({ enum: ["low", "medium", "high"] }),
    sentiment: Schema.enumString({ enum: ["positive", "neutral", "negative"] }),
    language: Schema.string({
      description: "BCP-47 language code of the customer's messages, e.g. 'id' or 'en'.",
    }),
    summary: Schema.string({ description: "One-line summary of what the customer wants." }),
    suggestedAction: Schema.string({
      description: "One-line suggestion for what the seller should do next.",
    }),
  },
});

function triageModel(mode = InferenceMode.PREFER_ON_DEVICE) {
  // Structured output on BOTH paths: responseSchema for the cloud model,
  // responseConstraint for the on-device model (documented hybrid pattern).
  return getGenerativeModel(ensureInit(), {
    mode,
    inCloudParams: {
      model: "gemini-3.5-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: triageSchema,
        temperature: 0.2,
      },
    },
    onDeviceParams: {
      promptOptions: { responseConstraint: triageSchema },
    },
  });
}

function draftModel(mode = InferenceMode.PREFER_ON_DEVICE) {
  return getGenerativeModel(ensureInit(), {
    mode,
    inCloudParams: {
      model: "gemini-3.5-flash-lite",
      generationConfig: { temperature: 0.6, maxOutputTokens: 400 },
    },
  });
}

function deepModel() {
  return getGenerativeModel(ensureInit(), {
    mode: InferenceMode.PREFER_IN_CLOUD,
    inCloudParams: {
      model: "gemini-3.5-flash",
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
    },
  });
}

// ── On-device availability ───────────────────────────────────────────────────

/**
 * Probe Chrome's built-in model status for display purposes.
 * Returns: "available" | "downloadable" | "downloading" | "unavailable" |
 *          "unsupported" (no Prompt API: non-Chrome, Chrome < 139, mobile)
 * The SDK still makes the real routing decision per request; the ground truth
 * is each response's inferenceSource.
 */
export async function getNanoStatus() {
  try {
    if (!("LanguageModel" in self)) return "unsupported";
    return await self.LanguageModel.availability();
  } catch {
    return "unavailable";
  }
}

/**
 * Trigger the on-device model download/init. Chrome requires this to happen
 * on or after a user interaction (user activation) and before the first
 * prompt. Safe to call repeatedly; only the first call does work.
 * onProgress(fraction|null) is called with download progress when known.
 */
export function warmUpDeviceModel(onProgress) {
  if (deviceWarmupStarted || !IS_CONFIGURED) return;
  deviceWarmupStarted = true;
  try {
    triageModel().initializeDeviceModel((fraction) => {
      if (typeof onProgress === "function") onProgress(fraction);
    });
  } catch (err) {
    // On-device init is best-effort: the SDK falls back to the cloud anyway.
    console.info("On-device model warm-up skipped:", err?.message ?? err);
  }
}

// ── Tasks ────────────────────────────────────────────────────────────────────

function timed(fn) {
  return async (...args) => {
    const t0 = performance.now();
    const out = await fn(...args);
    return { ...out, ms: Math.round(performance.now() - t0) };
  };
}

/**
 * The hybrid SDK reroutes to the cloud when Nano is *unavailable*, but a
 * Prompt API session that errors (e.g. QuotaExceededError in headless or
 * limited Chrome builds) throws straight through. Retry exactly once with an
 * explicitly cloud model so the promised fallback actually happens; a cloud
 * failure surfaces unchanged. NotConfiguredError is never retried.
 */
async function withCloudFallback(hybridCall, cloudCall) {
  try {
    return await hybridCall();
  } catch (err) {
    if (err instanceof NotConfiguredError) throw err;
    console.info("Hybrid path failed; retrying in cloud:", err?.message ?? err);
    return await cloudCall();
  }
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("The model did not return valid JSON. Raw output: " + text.slice(0, 200));
  }
}

/** Triage a pasted conversation → structured card data. Fast path (hybrid). */
export const runTriage = timed(async (conversation) => {
  const prompt =
    "You triage customer messages for a small online seller. " +
    "Read the conversation and return the triage as JSON.\n\nConversation:\n" +
    conversation;
  const attempt = async (model) => {
    const result = await model.generateContent(prompt);
    return {
      data: extractJson(result.response.text()),
      source: result.response.inferenceSource ?? "IN_CLOUD",
    };
  };
  return withCloudFallback(
    () => attempt(triageModel()),
    () => attempt(triageModel(InferenceMode.PREFER_IN_CLOUD))
  );
});

/** Draft a reply. Fast path (hybrid), streamed. onChunk(textSoFar) optional. */
export const runDraft = timed(async (conversation, triage, tone, onChunk) => {
  const toneGuide = {
    friendly: "warm, friendly and helpful, with a personal touch",
    formal: "polite and professional",
    short: "as short as possible while staying polite — a few lines at most",
  }[tone ?? "friendly"];

  const prompt =
    `You help a small online seller reply to a customer on WhatsApp.\n` +
    `Write a ready-to-send reply in the SAME language as the customer's messages ` +
    `(language code: ${triage?.language ?? "the customer's"}). ` +
    `Tone: ${toneGuide}. Do not invent prices, stock, or delivery promises that are ` +
    `not in the conversation; if something is unknown, say the seller will check. ` +
    `Output ONLY the reply text, no explanations.\n\n` +
    (triage ? `Triage: intent=${triage.intent}, urgency=${triage.urgency}, summary=${triage.summary}\n\n` : "") +
    `Conversation:\n${conversation}`;

  const attempt = async (model) => {
    let text = "";
    const streamResult = await model.generateContentStream(prompt);
    for await (const chunk of streamResult.stream) {
      text += chunk.text();
      if (typeof onChunk === "function") onChunk(text);
    }
    const response = await streamResult.response;
    return { text: text.trim(), source: response.inferenceSource ?? "IN_CLOUD" };
  };
  return withCloudFallback(
    () => attempt(draftModel()),
    () => attempt(draftModel(InferenceMode.PREFER_IN_CLOUD))
  );
});

/** Deep dive on a long thread. Cloud-preferred on purpose. */
export const runDeepDive = timed(async (conversation) => {
  const prompt =
    "You are an analyst helping a small online seller understand a long customer " +
    "conversation thread. Reply in English with exactly these sections:\n" +
    "## Summary\n## Unanswered questions from the customer\n## Promises or follow-ups the seller made\n" +
    "## Recommended next step\nBe specific and quote short fragments where useful.\n\nThread:\n" +
    conversation;
  const result = await deepModel().generateContent(prompt);
  return {
    text: result.response.text(),
    source: result.response.inferenceSource ?? "IN_CLOUD",
  };
});
