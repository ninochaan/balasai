// BalasAI — UI logic. All AI calls live in ai.js; this file owns the DOM,
// samples, local-only history, and the route log.

import { IS_CONFIGURED } from "./firebase-config.js";
import {
  getNanoStatus,
  warmUpDeviceModel,
  runTriage,
  runDraft,
  runDeepDive,
  NotConfiguredError,
} from "./ai.js";

const $ = (sel) => document.querySelector(sel);

const els = {
  configBanner: $("#configBanner"),
  nanoStatus: $("#nanoStatus"),
  input: $("#conversation"),
  charCount: $("#charCount"),
  triageBtn: $("#triageBtn"),
  draftBtn: $("#draftBtn"),
  deepBtn: $("#deepBtn"),
  tone: $("#tone"),
  triageCard: $("#triageCard"),
  replyBox: $("#replyBox"),
  replyText: $("#replyText"),
  copyBtn: $("#copyBtn"),
  deepBox: $("#deepBox"),
  deepText: $("#deepText"),
  routeLog: $("#routeLog"),
  historyList: $("#historyList"),
  clearHistory: $("#clearHistory"),
  errorBox: $("#errorBox"),
};

const SAMPLES = {
  id: {
    label: "Sample — Indonesian shipping complaint",
    text:
      "Customer: Kak, paket saya kok belum sampai ya? Sudah 5 hari dari estimasi\n" +
      "Customer: Saya cek resi terakhir masih di Jakarta, padahal saya di Surabaya\n" +
      "Customer: Ini buat kado ulang tahun ibu saya lusa, tolong dibantu ya kak 🙏\n" +
      "Seller: Mohon maaf kak, kami cek dulu ke ekspedisinya ya\n" +
      "Customer: Tolong kabari hari ini ya, kalau tidak bisa sampai lusa saya minta refund saja",
  },
  en: {
    label: "Sample — English bulk-order enquiry",
    text:
      "Customer: Hi! I love your batik tote bags. Do you offer a discount for bulk orders?\n" +
      "Customer: We'd need 150 pieces for a company event on Dec 12, with our logo printed on them\n" +
      "Customer: Could you send a price quote and tell me the production time?\n" +
      "Customer: Also, do you ship to Singapore?",
  },
  mix: {
    label: "Sample — Mixed Indonesian/English payment question",
    text:
      "Customer: Halo kak, saya sudah transfer tadi pagi untuk order #2841, tapi statusnya masih 'awaiting payment'\n" +
      "Customer: I already sent the receipt screenshot, can you check please?\n" +
      "Seller: Siap kak, kami cek dulu ya 🙏\n" +
      "Customer: Soalnya barangnya mau saya pakai buat hadiah, need it before Friday ya kak\n" +
      "Customer: Kalau belum masuk juga gimana? Bisa refund atau harus nunggu?",
  },
};

let lastTriage = null;

// ── Small helpers ────────────────────────────────────────────────────────────

function showError(err) {
  console.error(err);
  els.errorBox.hidden = false;
  els.errorBox.textContent =
    err instanceof NotConfiguredError
      ? err.message
      : "Something went wrong: " + (err?.message ?? String(err));
}
function clearError() {
  els.errorBox.hidden = true;
  els.errorBox.textContent = "";
}

function routeBadge(source) {
  const onDevice = source === "ON_DEVICE";
  return `<span class="badge ${onDevice ? "badge-device" : "badge-cloud"}">${
    onDevice ? "ON-DEVICE · Gemini Nano" : "CLOUD · Gemini"
  }</span>`;
}

function logRoute(task, source, ms, chars) {
  const li = document.createElement("li");
  li.innerHTML =
    `<span class="log-task">${task}</span> ${routeBadge(source)} ` +
    `<span class="log-meta">${ms} ms · ${chars} chars in</span>`;
  els.routeLog.prepend(li);
}

function setBusy(btn, busy) {
  btn.disabled = busy;
  btn.dataset.label ??= btn.textContent;
  btn.textContent = busy ? "Working…" : btn.dataset.label;
}

function getConversation() {
  return els.input.value.trim();
}

// ── History (local device only) ──────────────────────────────────────────────

const HISTORY_KEY = "balasai.history.v1";

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) ?? [];
  } catch {
    return [];
  }
}
function saveHistoryItem(item) {
  const items = [item, ...loadHistory()].slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  renderHistory();
}
function renderHistory() {
  const items = loadHistory();
  els.historyList.innerHTML =
    items.length === 0
      ? '<li class="muted">No triages yet — history is stored only on this device.</li>'
      : items
          .map(
            (it) =>
              `<li><strong>${it.data.intent}</strong> · urgency ${it.data.urgency} · ` +
              `${it.data.summary} <span class="muted">(${new Date(it.at).toLocaleString()})</span></li>`
          )
          .join("");
}

// ── Actions ──────────────────────────────────────────────────────────────────

async function onTriage() {
  const conversation = getConversation();
  if (!conversation) return showError(new Error("Paste a conversation first."));
  clearError();
  setBusy(els.triageBtn, true);
  try {
    const { data, source, ms } = await runTriage(conversation);
    lastTriage = data;
    els.triageCard.hidden = false;
    els.triageCard.innerHTML = `
      <div class="triage-head"><h3>Triage</h3>${routeBadge(source)}</div>
      <dl>
        <div><dt>Intent</dt><dd>${data.intent}</dd></div>
        <div><dt>Urgency</dt><dd><span class="urgency urgency-${data.urgency}">${data.urgency}</span></dd></div>
        <div><dt>Sentiment</dt><dd>${data.sentiment}</dd></div>
        <div><dt>Language</dt><dd>${data.language}</dd></div>
      </dl>
      <p><strong>Summary:</strong> ${data.summary}</p>
      <p><strong>Suggested action:</strong> ${data.suggestedAction}</p>`;
    logRoute("Triage", source, ms, conversation.length);
    saveHistoryItem({ at: Date.now(), data });
    els.draftBtn.disabled = false;
  } catch (err) {
    showError(err);
  } finally {
    setBusy(els.triageBtn, false);
  }
}

async function onDraft() {
  const conversation = getConversation();
  if (!conversation) return showError(new Error("Paste a conversation first."));
  clearError();
  setBusy(els.draftBtn, true);
  els.replyBox.hidden = false;
  els.replyText.textContent = "";
  try {
    const { text, source, ms } = await runDraft(
      conversation,
      lastTriage,
      els.tone.value,
      (partial) => {
        els.replyText.textContent = partial;
      }
    );
    els.replyText.textContent = text;
    els.replyBox.dataset.route = source;
    $("#replyRoute").innerHTML = routeBadge(source);
    logRoute("Reply draft", source, ms, conversation.length);
  } catch (err) {
    showError(err);
  } finally {
    setBusy(els.draftBtn, false);
  }
}

async function onDeepDive() {
  const conversation = getConversation();
  if (!conversation) return showError(new Error("Paste a conversation first."));
  clearError();
  setBusy(els.deepBtn, true);
  try {
    const { text, source, ms } = await runDeepDive(conversation);
    els.deepBox.hidden = false;
    els.deepText.textContent = text;
    $("#deepRoute").innerHTML = routeBadge(source);
    logRoute("Deep dive", source, ms, conversation.length);
  } catch (err) {
    showError(err);
  } finally {
    setBusy(els.deepBtn, false);
  }
}

// ── Wiring ───────────────────────────────────────────────────────────────────

function init() {
  if (!IS_CONFIGURED) els.configBanner.hidden = false;

  getNanoStatus().then((status) => {
    const labels = {
      available: "Gemini Nano: available on this device — fast path runs on-device",
      downloadable: "Gemini Nano: downloadable — first fast-path use will fetch the model",
      downloading: "Gemini Nano: downloading…",
      unavailable: "Gemini Nano: not available on this device — cloud fallback will answer",
      unsupported: "Gemini Nano: needs Chrome on Desktop (v139+) — cloud fallback will answer",
    };
    els.nanoStatus.textContent = labels[status] ?? labels.unavailable;
  });

  // Chrome requires initializeDeviceModel() on/after a user interaction.
  const warm = () =>
    warmUpDeviceModel((fraction) => {
      if (typeof fraction === "number") {
        els.nanoStatus.textContent = `Gemini Nano: downloading model… ${Math.round(fraction * 100)}%`;
      }
    });
  document.addEventListener("pointerdown", warm, { once: true });
  document.addEventListener("keydown", warm, { once: true });

  els.input.addEventListener("input", () => {
    els.charCount.textContent = `${els.input.value.length} chars`;
  });

  document.querySelectorAll("[data-sample]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sample = SAMPLES[btn.dataset.sample];
      els.input.value = sample.text;
      els.input.dispatchEvent(new Event("input"));
      lastTriage = null;
      els.draftBtn.disabled = true;
    });
  });

  els.triageBtn.addEventListener("click", onTriage);
  els.draftBtn.addEventListener("click", onDraft);
  els.deepBtn.addEventListener("click", onDeepDive);
  els.copyBtn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(els.replyText.textContent);
    els.copyBtn.textContent = "Copied ✓";
    setTimeout(() => (els.copyBtn.textContent = "Copy reply"), 1500);
  });
  els.clearHistory.addEventListener("click", () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  });

  renderHistory();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* offline shell is a progressive enhancement */
    });
  }
}

init();
