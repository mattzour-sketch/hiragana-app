// --- PWA: register service worker for installability + offline use ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

let deferredInstallPrompt = null;
const installBtn = document.getElementById("installBtn");
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  installBtn.hidden = true;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
});
window.addEventListener("appinstalled", () => {
  installBtn.hidden = true;
});

// --- Theme ---
const themeToggle = document.getElementById("themeToggle");
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
  localStorage.setItem("hiragana-theme", theme);
}
applyTheme(localStorage.getItem("hiragana-theme") || "light");
themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
});

// --- Tabs ---
// Also called from in-app links (word of the day ↔ flashcards).
function showTab(id) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === id));
  // These panels depend on stored progress that other tabs change, and on
  // wall-clock time (SRS due dates, the local day), so they refresh on every visit.
  if (id === "progress") renderProgress();
  if (id === "flashcards") buildFlashcardDeck();
  if (id === "typing") startTypingRound();
  if (id === "wordOfDay") renderWordOfDay();
}
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});

// --- Speech ---
let ttsVolume = parseFloat(localStorage.getItem("hiragana-volume") ?? "1");
let selectedVoiceURI = localStorage.getItem("hiragana-voice") || "";

// Card words are spoken from their furigana, not their kanji: on its own a
// single kanji has no context and TTS often picks another reading
// (四 → し instead of よん, 月 → げつ instead of つき). Sentences keep their
// kanji, which gives the engine context for particles like は.
let cardReadings = null;
function speechText(text) {
  if (!cardReadings) {
    cardReadings = new Map(FLASHCARDS.map(c =>
      [segmentsToPlainText(c.segments), c.segments.map(s => s.f || s.t).join("")]));
  }
  return cardReadings.get(text) ?? text;
}

function speak(char) {
  if (!("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(speechText(char));
  utter.lang = "ja-JP";
  utter.volume = ttsVolume;
  const voice = speechSynthesis.getVoices().find(v => v.voiceURI === selectedVoiceURI);
  if (voice) utter.voice = voice;
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

// Voice picker: only shown when the system offers more than one Japanese voice.
const voiceSelect = document.getElementById("voiceSelect");
function populateVoices() {
  if (!("speechSynthesis" in window)) return;
  const jaVoices = speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith("ja"));
  if (jaVoices.length < 2) {
    voiceSelect.hidden = true;
    return;
  }
  voiceSelect.hidden = false;
  voiceSelect.innerHTML = jaVoices.map(v =>
    `<option value="${v.voiceURI}"${v.voiceURI === selectedVoiceURI ? " selected" : ""}>${v.name}</option>`
  ).join("");
  if (!jaVoices.some(v => v.voiceURI === selectedVoiceURI)) {
    selectedVoiceURI = jaVoices[0].voiceURI;
  }
}
if ("speechSynthesis" in window) {
  populateVoices();
  speechSynthesis.addEventListener("voiceschanged", populateVoices);
}
voiceSelect.addEventListener("change", () => {
  selectedVoiceURI = voiceSelect.value;
  localStorage.setItem("hiragana-voice", selectedVoiceURI);
});

const volumeSlider = document.getElementById("volumeSlider");
const volumeValue = document.getElementById("volumeValue");
volumeSlider.value = Math.round(ttsVolume * 100);
volumeValue.textContent = `${volumeSlider.value}%`;
volumeSlider.addEventListener("input", () => {
  ttsVolume = volumeSlider.value / 100;
  volumeValue.textContent = `${volumeSlider.value}%`;
  localStorage.setItem("hiragana-volume", ttsVolume);
});

// --- Shared learning state ---
// One store per concern, all keyed by the item itself (a kana char or a plain
// word), so the quiz, typing drills and flashcards all describe the same item
// with the same key and feed each other.
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const KANA_STATS_KEY = "hiragana-kana-stats";
function loadKanaStats() {
  try {
    return JSON.parse(localStorage.getItem(KANA_STATS_KEY)) || {};
  } catch {
    return {};
  }
}
function saveKanaStats(stats) {
  localStorage.setItem(KANA_STATS_KEY, JSON.stringify(stats));
}
function updateKanaStat(key, correct) {
  const stats = loadKanaStats();
  if (!stats[key]) stats[key] = { correct: 0, wrong: 0 };
  stats[key][correct ? "correct" : "wrong"]++;
  saveKanaStats(stats);
  recordActivity();
}
function kanaWeight(key, stats) {
  const s = stats[key] || { correct: 0, wrong: 0 };
  return Math.max(0.3, 1 + s.wrong * 2 - s.correct * 0.3);
}

// Spaced repetition (Leitner boxes): a correct answer moves the card one box
// up and pushes its next review further out; a wrong answer resets it to box 0.
const SRS_KEY = "hiragana-srs";
const SRS_INTERVALS_MS = [
  10 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
];
const SRS_MAX_BOX = SRS_INTERVALS_MS.length - 1;
const SRS_MASTERED_BOX = 3;
const REVIEW_BATCH = 20;

function loadSrs() {
  try {
    return JSON.parse(localStorage.getItem(SRS_KEY)) || {};
  } catch {
    return {};
  }
}
function saveSrs(srs) {
  localStorage.setItem(SRS_KEY, JSON.stringify(srs));
}
function scheduleSrs(key, correct) {
  const srs = loadSrs();
  const current = srs[key] || { box: 0, due: 0 };
  const box = correct ? Math.min(current.box + 1, SRS_MAX_BOX) : 0;
  srs[key] = { box, due: Date.now() + SRS_INTERVALS_MS[box] };
  saveSrs(srs);
  return srs[key];
}
// A word is "introduced" once it has an SRS entry. Only introduced words can be
// due: a word the user has never started (no entry) is not a review.
// Pure (no DOM/localStorage) so it can be unit-tested.
function dueIndicesFrom(cards, srs, now) {
  const due = [];
  cards.forEach((card, i) => {
    const entry = srs[segmentsToPlainText(card.segments)];
    if (entry && entry.due <= now) due.push({ i, due: entry.due });
  });
  due.sort((a, b) => a.due - b.due);
  return due.map(d => d.i);
}
// Puts a new word into box 0 (first review after SRS_INTERVALS_MS[0]). Never
// overwrites an existing entry; returns whether an entry was added.
function introduceInSrs(srs, key, now) {
  if (srs[key]) return false;
  srs[key] = { box: 0, due: now + SRS_INTERVALS_MS[0] };
  return true;
}
function firstUnintroducedIndex(cards, srs) {
  return cards.findIndex(card => !srs[segmentsToPlainText(card.segments)]);
}
// Review queue: introduced words whose review is due, oldest first. New words
// enter through the word of the day (or a ✓/✗ in "Všechny karty").
function dueCardIndices() {
  return dueIndicesFrom(FLASHCARDS, loadSrs(), Date.now());
}
// Re-schedules a word only if it is already introduced; used by drills that
// must not introduce new words (typing). Returns the new entry or null.
function rescheduleIfIntroduced(key, correct) {
  if (!loadSrs()[key]) return null;
  return scheduleSrs(key, correct);
}
// "Naučeno" in the word of the day. Counts as activity only when the word was
// really added, so a double click or an already introduced word changes nothing.
function introduceCard(key) {
  const srs = loadSrs();
  const added = introduceInSrs(srs, key, Date.now());
  if (added) {
    saveSrs(srs);
    recordActivity();
  }
  return added;
}
function introducedCount() {
  const srs = loadSrs();
  return FLASHCARDS.filter(card => srs[segmentsToPlainText(card.segments)]).length;
}
function nextDueTime() {
  const srs = loadSrs();
  const times = FLASHCARDS
    .map(card => srs[segmentsToPlainText(card.segments)])
    .filter(Boolean)
    .map(entry => entry.due)
    .filter(due => due > Date.now());
  return times.length ? Math.min(...times) : null;
}
// "Dlouhodobě" in Kartičky counts only the review schedule: words whose
// interval reached 7+ days. It is deliberately not Pokrok's mastery (which also
// counts Kvíz and Psaní answers), so resetting stats leaves it untouched.
function longTermCardCount() {
  const srs = loadSrs();
  return FLASHCARDS
    .filter(card => (srs[segmentsToPlainText(card.segments)]?.box ?? -1) >= SRS_MASTERED_BOX)
    .length;
}
function formatInterval(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 den" : days < 5 ? `${days} dny` : `${days} dní`;
}

// Daily answer counts, used by the progress dashboard, keyed by the local
// calendar day. Older versions keyed them by the UTC day; those keys are kept
// as they are (no migration). Answers given between local and UTC midnight
// (00:00–02:00 in Prague in summer) were counted for the previous day, so
// around the switch a day's count can show one day off.
const ACTIVITY_KEY = "hiragana-activity";
// Calendar day in the device's local time zone (the day rolls over at local
// midnight, not UTC). Used by the word of the day and the activity log.
function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function loadActivity() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVITY_KEY)) || {};
  } catch {
    return {};
  }
}
// Counts one answer for the local day of `now`. Pure, so it can be tested.
function addActivity(activity, now) {
  const key = localDateKey(now);
  activity[key] = (activity[key] || 0) + 1;
  // Keep the store small: only the last 30 days matter for the dashboard.
  const cutoff = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
  Object.keys(activity).forEach(k => {
    if (k < cutoff) delete activity[k];
  });
  return activity;
}
function recordActivity() {
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(addActivity(loadActivity(), new Date())));
}
// The last n local calendar days up to `now`, oldest first. Steps by calendar
// day, not by 24 h, so a DST change can't repeat or skip a day.
function lastLocalDays(now, n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ key: localDateKey(date), weekday: date.getDay() });
  }
  return days;
}

// 0 = not started, 1 = learning, 2 = mastered.
function itemMastery(key, stats, srs) {
  const s = stats[key];
  const entry = srs[key];
  if (!s && !entry) return 0;
  const correct = s ? s.correct : 0;
  const wrong = s ? s.wrong : 0;
  if ((entry && entry.box >= SRS_MASTERED_BOX) || (correct >= 3 && correct >= wrong * 2)) return 2;
  return 1;
}

// --- Reading charts ---
function renderChart(containerId, rows, isYoon) {
  const container = document.getElementById(containerId);
  rows.forEach(row => {
    const rowEl = document.createElement("div");
    rowEl.className = "chart-row" + (isYoon ? " yoon-row" : "");
    row.items.forEach(item => {
      const cell = document.createElement("div");
      if (!item) {
        cell.className = "kana-cell empty";
      } else {
        const [char, romaji] = item;
        cell.className = "kana-cell";
        cell.innerHTML = `<span class="kana-char">${char}</span><span class="kana-romaji">${romaji}</span>`;
        cell.addEventListener("click", () => speak(char));
      }
      rowEl.appendChild(cell);
    });
    container.appendChild(rowEl);
  });
}
renderChart("basicChart", BASIC_ROWS, false);
renderChart("dakutenChart", DAKUTEN_ROWS, false);
renderChart("yoonChart", YOON_ROWS, true);
renderChart("katakanaBasicChart", KATAKANA_BASIC_ROWS, false);
renderChart("katakanaDakutenChart", KATAKANA_DAKUTEN_ROWS, false);
renderChart("katakanaYoonChart", KATAKANA_YOON_ROWS, true);

// --- Sentences ---
// A segment with `hl` (target word on a flashcard) is wrapped in <strong>.
// Existing SENTENCES/CONVERSATIONS data has no `hl`, so they render unchanged.
function segmentsToHtml(segments) {
  return segments.map(seg => {
    const inner = seg.f ? `<ruby>${seg.t}<rt>${seg.f}</rt></ruby>` : seg.t;
    return seg.hl ? `<strong>${inner}</strong>` : inner;
  }).join("");
}

function segmentsToPlainText(segments) {
  return segments.map(seg => seg.t).join("");
}

function renderSentences() {
  const container = document.getElementById("sentenceList");
  SENTENCES.forEach(({ segments, romaji, english }) => {
    const plainText = segmentsToPlainText(segments);
    const card = document.createElement("div");
    card.className = "sentence-card";
    card.innerHTML = `
      <div class="sentence-top">
        <span class="sentence-text">${segmentsToHtml(segments)}</span>
        <div class="sentence-actions">
          <button class="speak-btn" title="Přehrát">🔊</button>
          <button class="reveal-btn">Ukázat čtení a překlad</button>
        </div>
      </div>
      <div class="sentence-reveal">
        <div class="sentence-romaji">${romaji}</div>
        <div class="sentence-translation">${english}</div>
      </div>
    `;
    const revealBtn = card.querySelector(".reveal-btn");
    const revealBox = card.querySelector(".sentence-reveal");
    revealBtn.addEventListener("click", () => {
      const isVisible = revealBox.classList.toggle("visible");
      revealBtn.textContent = isVisible ? "Skrýt" : "Ukázat čtení a překlad";
    });
    card.querySelector(".speak-btn").addEventListener("click", () => speak(plainText));
    container.appendChild(card);
  });
}
renderSentences();

// --- Flashcards (spaced repetition) ---
let flashcardMode = "review";
let flashcardOrder = [];
let flashcardIndex = 0;
let flashcardFlipped = false;
// True while a flipped card turns back and its content hasn't been swapped yet.
// flashcardIndex (and in review mode the deck) already point at the next card,
// but the old one is still on screen, so flipping or rating now would act on
// — and speak — a card the user doesn't see.
let flashcardSwapPending = false;
// Bumped by every swap and by buildFlashcardDeck, so a swap still in flight
// when the deck is rebuilt doesn't move the new deck's index.
let flashcardSwapGen = 0;
// Whether the current card's back (the answer) has been shown. ✓/✗ stay
// disabled until then, so a card can't be rated unseen; reset on every new card.
let flashcardRevealed = false;
// Session-wide "show example sentence" choice: once the user reveals a sentence
// it stays revealed on every following card until they hide it again. In-memory
// only (no localStorage), so a page reload resets it.
let flashcardExampleRevealed = false;

// Reading + meaning shown when a word in the example sentence is clicked.
// Priority: target word (hl) → gloss from the card; particle → PARTICLE_GLOSS;
// otherwise the token's manual `g`; else not clickable.
function glossForToken(seg, card) {
  if (seg.hl) return { romaji: card.romaji, text: card.english };
  if (PARTICLE_GLOSS[seg.t]) return PARTICLE_GLOSS[seg.t];
  if (seg.g) return seg.g;
  return null;
}

// Dedicated renderer for the on-card example sentence: bolds the target word and
// wraps glossable tokens in a clickable span carrying only their segment index
// (gloss texts stay in JS, never injected into an attribute).
function exampleSegmentsToHtml(ex, card) {
  return ex.segments.map((seg, i) => {
    const inner = seg.f ? `<ruby>${seg.t}<rt>${seg.f}</rt></ruby>` : seg.t;
    const body = seg.hl ? `<strong>${inner}</strong>` : inner;
    return glossForToken(seg, card)
      ? `<span class="gloss-token" data-seg="${i}">${body}</span>`
      : body;
  }).join("");
}

function hideGloss(root) {
  const bar = root.querySelector(".flashcard-gloss-bar");
  if (bar) { bar.hidden = true; bar.dataset.seg = ""; }
  root.querySelectorAll(".gloss-token.active").forEach(t => t.classList.remove("active"));
}

function toggleGloss(root, i, gloss, tok) {
  if (!gloss) return;
  const bar = root.querySelector(".flashcard-gloss-bar");
  if (!bar.hidden && bar.dataset.seg === String(i)) { hideGloss(root); return; }
  root.querySelectorAll(".gloss-token.active").forEach(t => t.classList.remove("active"));
  tok.classList.add("active");
  bar.innerHTML = `<span class="gloss-romaji">${gloss.romaji}</span> ` +
                  `<span class="gloss-text">${gloss.text}</span>`;
  bar.hidden = false;
  bar.dataset.seg = String(i);
}

const flashcardEl = document.getElementById("flashcard");
const flashcardFrontEl = document.getElementById("flashcardFront");
const flashcardBackEl = document.getElementById("flashcardBack");
const flashcardCountEl = document.getElementById("flashcardCount");
const flashcardKnownEl = document.getElementById("flashcardKnown");
const flashcardEmptyEl = document.getElementById("flashcardEmpty");
const flashcardEmptyTitleEl = document.getElementById("flashcardEmptyTitle");
const flashcardEmptySubEl = document.getElementById("flashcardEmptySub");
const flashcardNextBatchEl = document.getElementById("flashcardNextBatch");
const flashcardGoWordEl = document.getElementById("flashcardGoWord");
const flashcardActionsEl = document.getElementById("flashcardActions");
const flashcardKnowActionsEl = document.getElementById("flashcardKnowActions");
const srsHintEl = document.getElementById("srsHint");
const dueCountEl = document.getElementById("dueCount");
const flashcardKnowBtn = document.getElementById("flashcardKnowBtn");
const flashcardDontKnowBtn = document.getElementById("flashcardDontKnow");

function setFlashcardRevealed(revealed) {
  flashcardRevealed = revealed;
  flashcardKnowBtn.disabled = !revealed;
  flashcardDontKnowBtn.disabled = !revealed;
}

function buildFlashcardDeck() {
  flashcardOrder = flashcardMode === "review"
    ? dueCardIndices().slice(0, REVIEW_BATCH)
    : shuffle(FLASHCARDS.map((_, i) => i));
  flashcardIndex = 0;
  flashcardFlipped = false;
  flashcardSwapGen++;
  flashcardSwapPending = false;
  setFlashcardRevealed(false);
  flashcardEl.classList.remove("flipped");
  srsHintEl.textContent = "";
  renderFlashcard();
}

function refreshDueCount() {
  dueCountEl.textContent = String(dueCardIndices().length);
}

function renderFlashcard() {
  refreshDueCount();
  flashcardKnownEl.textContent = `Dlouhodobě: ${longTermCardCount()} / ${FLASHCARDS.length}`;

  const empty = flashcardOrder.length === 0;
  flashcardEmptyEl.hidden = !empty;
  flashcardEl.parentElement.hidden = empty;
  flashcardActionsEl.hidden = empty;
  flashcardKnowActionsEl.hidden = empty;
  if (empty) {
    flashcardCountEl.textContent = "0 / 0";
    // The deck is one batch, so "empty" can still mean more cards are waiting.
    const remaining = dueCardIndices().length;
    flashcardGoWordEl.hidden = true;
    if (remaining > 0) {
      flashcardEmptyTitleEl.textContent = "Dávka hotová";
      flashcardEmptySubEl.textContent = `Zbývá ještě ${remaining} karet k opakování.`;
      flashcardNextBatchEl.hidden = false;
    } else if (introducedCount() === 0) {
      flashcardEmptyTitleEl.textContent = "Opakování je prázdné";
      flashcardEmptySubEl.textContent = "Slova do opakování přidáš ve Slově dne.";
      flashcardNextBatchEl.hidden = true;
      flashcardGoWordEl.hidden = false;
    } else {
      const next = nextDueTime();
      flashcardEmptyTitleEl.textContent = "Nic k opakování";
      flashcardEmptySubEl.textContent = next
        ? `Další karta bude připravená za ${formatInterval(next - Date.now())}.`
        : "Přepni na „Všechny karty“ a projdi si je znovu.";
      flashcardNextBatchEl.hidden = true;
      // Review is done, but new words can still be added from the word of the day.
      flashcardGoWordEl.hidden = firstUnintroducedIndex(FLASHCARDS, loadSrs()) === -1;
    }
    return;
  }

  const card = FLASHCARDS[flashcardOrder[flashcardIndex]];
  flashcardEl.classList.toggle("flipped", flashcardFlipped);
  // Abstract words (verbs, adjectives…) have no evocative emoji, so their
  // front shows the English meaning as the prompt instead of a picture.
  const frontMain = card.emoji
    ? `<div class="flashcard-emoji">${card.emoji}</div>`
    : `<div class="flashcard-front-text">${card.english}</div>`;
  flashcardFrontEl.innerHTML = `
    ${frontMain}
    <div class="flashcard-hint-text">Klikni pro otočení</div>
  `;
  // The example block is only rendered for cards that have one, so the app keeps
  // working while sentences are being filled in batch by batch.
  const ex = card.example;
  const exampleHtml = ex ? `
    <div class="flashcard-example">
      <div class="flashcard-example-actions">
        <button type="button" class="reveal-btn fc-example-reveal">${
          flashcardExampleRevealed ? "Skrýt větu" : "Ukázat větu"}</button>
      </div>
      <div class="sentence-reveal fc-example-reveal-box${flashcardExampleRevealed ? " visible" : ""}">
        <div class="flashcard-example-line">
          <span class="flashcard-example-jp">${exampleSegmentsToHtml(ex, card)}</span>
          <button type="button" class="speak-btn fc-example-speak" title="Přehrát větu">🔊</button>
        </div>
        <div class="sentence-romaji">${ex.romaji}</div>
        <div class="sentence-translation">${ex.english}</div>
        <div class="flashcard-example-note">tučně = hledané slovo (může být i v jiném tvaru)</div>
        <div class="flashcard-gloss-bar" hidden></div>
      </div>
    </div>` : "";
  flashcardBackEl.innerHTML = `
    <div class="flashcard-word">${segmentsToHtml(card.segments)}</div>
    <div class="flashcard-romaji">${card.romaji}</div>
    <div class="flashcard-english">${card.english}</div>
    ${exampleHtml}`;

  // innerHTML is rebuilt on every render, so listeners are (re)bound to the fresh
  // nodes here; the old nodes and their listeners are discarded with them.
  // stopPropagation keeps these clicks from reaching the flip handler on #flashcard.
  if (ex) {
    const revealBtn = flashcardBackEl.querySelector(".fc-example-reveal");
    const revealBox = flashcardBackEl.querySelector(".fc-example-reveal-box");
    revealBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      flashcardExampleRevealed = revealBox.classList.toggle("visible");
      revealBtn.textContent = flashcardExampleRevealed ? "Skrýt větu" : "Ukázat větu";
      if (!flashcardExampleRevealed) hideGloss(flashcardBackEl);
    });
    flashcardBackEl.querySelector(".fc-example-speak").addEventListener("click", (e) => {
      e.stopPropagation();
      speak(segmentsToPlainText(ex.segments));
    });
    // Any click inside the revealed sentence box stays on the card — it never
    // reaches the flip handler on #flashcard, so reading the sentence (tapping
    // plain text, romaji, translation or the note) can't accidentally flip the
    // card. A gloss word toggles its gloss; anything else closes an open gloss.
    // (The 🔊 and gloss-bar have their own stopPropagation handlers, so their
    // clicks never bubble here.)
    revealBox.addEventListener("click", (e) => {
      e.stopPropagation();
      const tok = e.target.closest(".gloss-token");
      if (tok) {
        const i = +tok.dataset.seg;
        toggleGloss(flashcardBackEl, i, glossForToken(ex.segments[i], card), tok);
      } else {
        hideGloss(flashcardBackEl);
      }
    });
    flashcardBackEl.querySelector(".flashcard-gloss-bar")
      .addEventListener("click", (e) => e.stopPropagation());
  }

  flashcardCountEl.textContent = `${flashcardIndex + 1} / ${flashcardOrder.length}`;
}

function goToFlashcard(newIndex) {
  const wasFlipped = flashcardFlipped;
  flashcardFlipped = false;
  // Disabled right away, not after the flip-back animation: a second tap on
  // ✓/✗ in the meantime would otherwise rate the old card again.
  setFlashcardRevealed(false);
  if (wasFlipped) {
    // Flip back to front first, and only swap the card's content once that
    // animation finishes — otherwise the next card's answer flashes on the
    // back face while it's still rotating away. A timeout fallback covers
    // cases where transitionend never fires (e.g. reduced-motion, hidden tab).
    flashcardEl.classList.remove("flipped");
    flashcardSwapPending = true;
    const gen = ++flashcardSwapGen;
    let swapped = false;
    const swap = () => {
      if (swapped) return;
      swapped = true;
      flashcardEl.removeEventListener("transitionend", onTransitionEnd);
      if (gen !== flashcardSwapGen) return; // the deck was rebuilt meanwhile
      flashcardSwapPending = false;
      flashcardIndex = (newIndex + flashcardOrder.length) % flashcardOrder.length;
      renderFlashcard();
    };
    const onTransitionEnd = (e) => {
      if (e.propertyName === "transform") swap();
    };
    flashcardEl.addEventListener("transitionend", onTransitionEnd);
    setTimeout(swap, 550);
  } else {
    flashcardIndex = (newIndex + flashcardOrder.length) % flashcardOrder.length;
    renderFlashcard();
  }
}

flashcardEl.addEventListener("click", () => {
  // A click into the empty space of the card while the gloss bar is open just
  // closes the gloss — it does not flip the card.
  const bar = flashcardBackEl.querySelector(".flashcard-gloss-bar");
  if (bar && !bar.hidden) { hideGloss(flashcardBackEl); return; }
  if (flashcardSwapPending) return;
  flashcardFlipped = !flashcardFlipped;
  flashcardEl.classList.toggle("flipped", flashcardFlipped);
  if (flashcardFlipped) {
    setFlashcardRevealed(true);
    const card = FLASHCARDS[flashcardOrder[flashcardIndex]];
    speak(segmentsToPlainText(card.segments));
  }
});

document.getElementById("flashcardPrev").addEventListener("click", () => goToFlashcard(flashcardIndex - 1));
document.getElementById("flashcardNext").addEventListener("click", () => goToFlashcard(flashcardIndex + 1));
document.getElementById("flashcardShuffle").addEventListener("click", () => {
  flashcardOrder = shuffle(flashcardOrder);
  goToFlashcard(0);
});

function answerFlashcard(correct) {
  if (flashcardOrder.length === 0 || !flashcardRevealed || flashcardSwapPending) return;
  const card = FLASHCARDS[flashcardOrder[flashcardIndex]];
  const key = segmentsToPlainText(card.segments);
  // Feed the shared adaptive stats so the quiz and typing drills prioritise
  // words the user doesn't know yet.
  updateKanaStat(key, correct);
  const entry = scheduleSrs(key, correct);
  srsHintEl.textContent = correct
    ? `✓ ${key} — příští opakování za ${formatInterval(SRS_INTERVALS_MS[entry.box])}`
    : `✗ ${key} — vrátí se za ${formatInterval(SRS_INTERVALS_MS[0])}`;

  if (flashcardMode === "review") {
    // The card is scheduled now, so it leaves this session's deck.
    flashcardOrder.splice(flashcardIndex, 1);
    if (flashcardOrder.length === 0) {
      flashcardFlipped = false;
      flashcardEl.classList.remove("flipped");
      renderFlashcard();
      return;
    }
    goToFlashcard(flashcardIndex);
  } else {
    goToFlashcard(flashcardIndex + 1);
  }
}

flashcardKnowBtn.addEventListener("click", () => answerFlashcard(true));
flashcardDontKnowBtn.addEventListener("click", () => answerFlashcard(false));
flashcardNextBatchEl.addEventListener("click", buildFlashcardDeck);

// Only sets the mode and the active chip; the caller rebuilds the deck (directly,
// or via showTab("flashcards")).
function setFlashcardMode(mode) {
  flashcardMode = mode;
  document.querySelectorAll("#flashcardModeChips .chip")
    .forEach(c => c.classList.toggle("active", c.dataset.mode === mode));
}
document.querySelectorAll("#flashcardModeChips .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    setFlashcardMode(chip.dataset.mode);
    buildFlashcardDeck();
  });
});
document.getElementById("flashcardGoWord").addEventListener("click", () => showTab("wordOfDay"));

buildFlashcardDeck();

// --- Word of the day ---
// One new word per local calendar day, in FLASHCARDS order, with its example
// sentences. "Naučeno" introduces the word into SRS; "Další slovo" moves on to
// the next word not introduced yet. Only { date, key } is stored — the word
// itself is always re-derived from FLASHCARDS and the SRS store.
const WOD_KEY = "hiragana-word-of-day";

// Validates the stored state. Anything unreadable, malformed or pointing at a
// word that no longer exists is discarded (null), so the word is picked again;
// the SRS store is never touched here.
function parseWordOfDayState(raw, cards) {
  if (typeof raw !== "string") return null;
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!state || typeof state !== "object") return null;
  if (typeof state.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(state.date)) return null;
  if (typeof state.key !== "string") return null;
  if (!cards.some(card => segmentsToPlainText(card.segments) === state.key)) return null;
  return { date: state.date, key: state.key };
}

// Today's stored word stays for the whole day, even once introduced. Any other
// date (a new day, missed days, or the clock moved back) picks the first word
// not introduced yet. null = every word is already introduced.
function resolveWordOfDay(state, today, cards, srs) {
  if (state && state.date === today) return state;
  const i = firstUnintroducedIndex(cards, srs);
  if (i === -1) return null;
  return { date: today, key: segmentsToPlainText(cards[i].segments) };
}

// The card's own example first, then the extra sentences (cards without
// `examples` yet simply have one sentence).
function sentencesForCard(card) {
  return [card.example, ...(card.examples || [])].filter(Boolean);
}

// One-off notice for users who already had flashcard progress (SRS entries)
// when review started to contain introduced words only. Quiz/typing stats alone
// don't count — review never changed for those users. Decided once, on the
// first run of this version: SRS data → "show" until dismissed, else "done".
function resolveReviewNotice(stored, srs) {
  if (stored === "show" || stored === "done") return stored;
  return Object.keys(srs).length > 0 ? "show" : "done";
}

function loadWordOfDayState() {
  return parseWordOfDayState(localStorage.getItem(WOD_KEY), FLASHCARDS);
}
function saveWordOfDayState(state) {
  localStorage.setItem(WOD_KEY, JSON.stringify(state));
}

const wodContentEl = document.getElementById("wodContent");
// FLASHCARDS index of the word on screen (-1 = empty state), read by the
// delegated click handler below.
let wodCardIndex = -1;

// Each sentence is its own gloss root (own .flashcard-gloss-bar), because
// toggleGloss tells tokens apart only by their segment index. The Japanese text
// is visible straight away, so the gloss bar sits outside the reveal box.
function wodSentenceHtml(ex, card, i) {
  return `
    <div class="sentence-card" data-sent="${i}">
      <div class="sentence-top">
        <span class="sentence-text">${exampleSegmentsToHtml(ex, card)}</span>
        <div class="sentence-actions">
          <button type="button" class="speak-btn" data-action="speak-sentence" title="Přehrát větu">🔊</button>
          <button type="button" class="reveal-btn" data-action="reveal">Ukázat čtení a překlad</button>
        </div>
      </div>
      <div class="flashcard-gloss-bar" hidden></div>
      <div class="sentence-reveal">
        <div class="sentence-romaji">${ex.romaji}</div>
        <div class="sentence-translation">${ex.english}</div>
      </div>
    </div>`;
}

// justLearned = rendered right after "Naučeno": says when the word comes back.
function renderWordOfDay(justLearned = false) {
  const srs = loadSrs();
  const state = resolveWordOfDay(loadWordOfDayState(), localDateKey(new Date()), FLASHCARDS, srs);
  if (state) saveWordOfDayState(state);

  const learnedHtml = justLearned
    ? `<p class="wod-learned-note">Zopakuješ za ${formatInterval(SRS_INTERVALS_MS[0])} v Kartičkách.</p>`
    : "";
  const cardIndex = state
    ? FLASHCARDS.findIndex(card => segmentsToPlainText(card.segments) === state.key)
    : -1;
  const introduced = cardIndex !== -1 && Boolean(srs[state.key]);

  // Nothing left to introduce: an empty state instead of "Další slovo" that
  // would lead nowhere (this wins over "same word all day" for the last word).
  if (cardIndex === -1 || (introduced && firstUnintroducedIndex(FLASHCARDS, srs) === -1)) {
    wodCardIndex = -1;
    wodContentEl.innerHTML = `
      <div class="flashcard-empty">
        <p class="flashcard-empty-title">Všechna slova jsou v opakování</p>
        ${learnedHtml}
        <button type="button" class="primary-btn" data-action="review">Kartičky</button>
      </div>`;
    return;
  }

  wodCardIndex = cardIndex;
  const card = FLASHCARDS[cardIndex];
  const due = dueCardIndices().length;
  const reviewHtml = due > 0
    ? `<button type="button" class="wod-review-link" data-action="review">K opakování: ${due} → Kartičky</button>`
    : "";
  // Stacked, not side by side: the status takes the spot where "Naučeno" was and
  // "Další slovo" sits below it, so a double tap on "Naučeno" can't land on it.
  const actionHtml = introduced
    ? `<p class="wod-status">V opakování</p>
       ${learnedHtml}
       <button type="button" class="secondary-btn" data-action="next">Další slovo</button>`
    : `<button type="button" class="primary-btn" data-action="learn">Naučeno</button>`;
  wodContentEl.innerHTML = `
    <p class="hint">Klepni na podtržené slovo a uvidíš jeho význam.</p>
    ${reviewHtml}
    <div class="wod-head">
      <div class="wod-word">${segmentsToHtml(card.segments)}</div>
      <div class="wod-romaji">${card.romaji}</div>
      <div class="wod-english">${card.english}</div>
      <button type="button" class="speak-btn" data-action="speak-word" title="Přehrát slovo">🔊</button>
    </div>
    <div class="sentence-list wod-sentences">
      ${sentencesForCard(card).map((ex, i) => wodSentenceHtml(ex, card, i)).join("")}
    </div>
    <div class="wod-actions">${actionHtml}</div>`;
}

// Extra guard against a fast double tap on "Naučeno" reaching "Další slovo"
// (and skipping a word): "next" is ignored briefly after the word is learned.
const WOD_NEXT_GUARD_MS = 700;
let wodNextBlockedUntil = 0;

// One delegated listener: the content is re-rendered, the container is not.
wodContentEl.addEventListener("click", (e) => {
  const actionEl = e.target.closest("[data-action]");
  const action = actionEl ? actionEl.dataset.action : "";
  if (action === "review") {
    setFlashcardMode("review");
    showTab("flashcards");
    return;
  }
  const card = FLASHCARDS[wodCardIndex];
  if (!card) return;
  const key = segmentsToPlainText(card.segments);
  if (action === "learn") {
    introduceCard(key);
    wodNextBlockedUntil = Date.now() + WOD_NEXT_GUARD_MS;
    renderWordOfDay(true);
    return;
  }
  if (action === "next") {
    if (Date.now() < wodNextBlockedUntil) return;
    const next = firstUnintroducedIndex(FLASHCARDS, loadSrs());
    if (next !== -1) {
      saveWordOfDayState({ date: localDateKey(new Date()), key: segmentsToPlainText(FLASHCARDS[next].segments) });
    }
    renderWordOfDay();
    window.scrollTo(0, 0);
    return;
  }
  if (action === "speak-word") {
    speak(key);
    return;
  }

  const sentEl = e.target.closest(".sentence-card");
  if (!sentEl) return;
  const ex = sentencesForCard(card)[Number(sentEl.dataset.sent)];
  if (action === "speak-sentence") {
    speak(segmentsToPlainText(ex.segments));
    return;
  }
  if (action === "reveal") {
    const visible = sentEl.querySelector(".sentence-reveal").classList.toggle("visible");
    actionEl.textContent = visible ? "Skrýt" : "Ukázat čtení a překlad";
    return;
  }
  // A gloss word toggles its gloss; any other click in the sentence closes it.
  const tok = e.target.closest(".gloss-token");
  if (tok) {
    const i = Number(tok.dataset.seg);
    toggleGloss(sentEl, i, glossForToken(ex.segments[i], card), tok);
  } else {
    hideGloss(sentEl);
  }
});

renderWordOfDay();

// Decided before this session writes any progress, so only people who already
// had data when review switched to introduced words see the notice.
const REVIEW_NOTICE_KEY = "hiragana-review-notice";
const reviewNoticeEl = document.getElementById("reviewNotice");
const reviewNoticeState = resolveReviewNotice(localStorage.getItem(REVIEW_NOTICE_KEY), loadSrs());
localStorage.setItem(REVIEW_NOTICE_KEY, reviewNoticeState);
reviewNoticeEl.hidden = reviewNoticeState !== "show";
document.getElementById("reviewNoticeClose").addEventListener("click", () => {
  localStorage.setItem(REVIEW_NOTICE_KEY, "done");
  reviewNoticeEl.hidden = true;
});

// --- Conversations ---
function renderConversations() {
  const container = document.getElementById("conversationList");
  CONVERSATIONS.forEach(conv => {
    const block = document.createElement("div");
    block.className = "conversation-block";

    const title = document.createElement("h3");
    title.className = "conversation-title";
    title.textContent = conv.title;
    block.appendChild(title);

    const thread = document.createElement("div");
    thread.className = "conversation-thread";

    conv.lines.forEach(line => {
      const plainText = segmentsToPlainText(line.segments);
      const isB = line.speaker === "B";
      const row = document.createElement("div");
      row.className = "chat-row" + (isB ? " speaker-b" : "");
      row.innerHTML = `
        <div class="speaker-badge">${line.speaker}</div>
        <div class="chat-bubble">
          <div class="chat-text">${segmentsToHtml(line.segments)}</div>
          <div class="chat-reveal">
            <div class="chat-romaji">${line.romaji}</div>
            <div class="chat-translation">${line.english}</div>
          </div>
        </div>
      `;
      const bubble = row.querySelector(".chat-bubble");
      const reveal = row.querySelector(".chat-reveal");
      bubble.addEventListener("click", () => {
        reveal.classList.toggle("visible");
        speak(plainText);
      });
      thread.appendChild(row);
    });

    block.appendChild(thread);
    container.appendChild(block);
  });
}
renderConversations();

// --- Grammar ---
function renderParticles() {
  const container = document.getElementById("particleList");
  PARTICLES.forEach(p => {
    const card = document.createElement("div");
    card.className = "particle-card";
    card.innerHTML = `
      <div class="particle-glyph">${p.particle}</div>
      <div class="particle-body">
        <div class="particle-reading">${p.reading}</div>
        <div class="particle-role">${p.role}</div>
        <div class="particle-example">${p.example[0]} — <b>${p.example[1]}</b><br>${p.example[2]}</div>
      </div>
    `;
    card.addEventListener("click", () => speak(p.example[0]));
    container.appendChild(card);
  });
}
renderParticles();

// --- Sentence builder ---
const builderPromptEl = document.getElementById("builderPrompt");
const builderAnswerEl = document.getElementById("builderAnswer");
const builderBankEl = document.getElementById("builderBank");
const builderFeedbackEl = document.getElementById("builderFeedback");
const builderCountEl = document.getElementById("builderCount");
const builderScoreEl = document.getElementById("builderScore");
const builderCheckBtn = document.getElementById("builderCheck");
const builderResetBtn = document.getElementById("builderReset");
const builderNextBtn = document.getElementById("builderNext");

let builderOrder = [];
let builderIndex = 0;
let builderScore = 0;
let builderAnswer = []; // array of token indices in the order placed
let builderSolved = false;

function setupBuilderExercise() {
  const exercise = BUILDER_SENTENCES[builderOrder[builderIndex]];
  builderAnswer = [];
  builderSolved = false;
  builderFeedbackEl.textContent = "";
  builderFeedbackEl.className = "builder-feedback";
  builderCheckBtn.hidden = false;
  builderNextBtn.hidden = true;
  builderPromptEl.textContent = exercise.english;
  builderCountEl.textContent = `${builderIndex + 1} / ${BUILDER_SENTENCES.length}`;
  builderScoreEl.textContent = `Správně: ${builderScore}`;
  renderBuilderChips(exercise);
}

function renderBuilderChips(exercise) {
  builderAnswerEl.innerHTML = "";
  const shuffledIdx = shuffle(exercise.tokens.map((_, i) => i));
  builderBankEl.innerHTML = "";
  shuffledIdx.forEach(i => {
    const chip = document.createElement("button");
    chip.className = "word-chip";
    chip.innerHTML = segmentsToHtml(exercise.tokens[i]);
    chip.dataset.idx = i;
    chip.addEventListener("click", () => {
      if (builderSolved) return;
      builderAnswer.push(i);
      renderBuilderState(exercise);
    });
    builderBankEl.appendChild(chip);
  });
}

function renderBuilderState(exercise) {
  builderAnswerEl.innerHTML = "";
  builderAnswer.forEach((tokenIdx, pos) => {
    const chip = document.createElement("button");
    chip.className = "word-chip";
    chip.innerHTML = segmentsToHtml(exercise.tokens[tokenIdx]);
    chip.addEventListener("click", () => {
      if (builderSolved) return;
      builderAnswer.splice(pos, 1);
      renderBuilderState(exercise);
    });
    builderAnswerEl.appendChild(chip);
  });

  const used = new Set(builderAnswer);
  [...builderBankEl.children].forEach(chip => {
    chip.style.visibility = used.has(Number(chip.dataset.idx)) ? "hidden" : "visible";
  });
}

function checkBuilderAnswer() {
  const exercise = BUILDER_SENTENCES[builderOrder[builderIndex]];
  const correct = builderAnswer.length === exercise.tokens.length &&
    builderAnswer.every((idx, pos) => idx === pos);
  builderSolved = true;
  builderCheckBtn.hidden = true;
  builderNextBtn.hidden = false;
  if (correct) {
    builderScore++;
    builderScoreEl.textContent = `Správně: ${builderScore}`;
    builderFeedbackEl.textContent = "Správně";
    builderFeedbackEl.className = "builder-feedback correct";
    speak(segmentsToPlainText(exercise.tokens.flat()));
  } else {
    builderFeedbackEl.innerHTML = `Zkus to příště znovu. Správně: ${segmentsToHtml(exercise.tokens.flat())} <span style="color:var(--text-muted)">(${exercise.romaji})</span>`;
    builderFeedbackEl.className = "builder-feedback wrong";
  }
}

builderCheckBtn.addEventListener("click", checkBuilderAnswer);
builderResetBtn.addEventListener("click", () => {
  const exercise = BUILDER_SENTENCES[builderOrder[builderIndex]];
  builderAnswer = [];
  builderSolved = false;
  builderFeedbackEl.textContent = "";
  builderFeedbackEl.className = "builder-feedback";
  builderCheckBtn.hidden = false;
  builderNextBtn.hidden = true;
  renderBuilderChips(exercise);
});
builderNextBtn.addEventListener("click", () => {
  builderIndex = (builderIndex + 1) % builderOrder.length;
  if (builderIndex === 0) builderOrder = shuffle(builderOrder);
  setupBuilderExercise();
});

function initBuilder() {
  builderOrder = shuffle(BUILDER_SENTENCES.map((_, i) => i));
  builderIndex = 0;
  builderScore = 0;
  setupBuilderExercise();
}
initBuilder();

// --- Kana rows (shared by Kvíz and Psaní) ---
// The row picker narrows the kana pool to chosen gojūon rows plus, optionally,
// all dakuten or all yōon kana of the script. Rows are index ranges into the
// BASIC arrays, which have the same order for hiragana and katakana; "わ" also
// covers を and ん. One stored choice serves both tabs.
const KANA_ROWS = [
  { id: "a", from: 0, to: 5 },
  { id: "ka", from: 5, to: 10 },
  { id: "sa", from: 10, to: 15 },
  { id: "ta", from: 15, to: 20 },
  { id: "na", from: 20, to: 25 },
  { id: "ha", from: 25, to: 30 },
  { id: "ma", from: 30, to: 35 },
  { id: "ya", from: 35, to: 38 },
  { id: "ra", from: 38, to: 43 },
  { id: "wa", from: 43, to: 46 },
];
const KANA_ROW_IDS = KANA_ROWS.map(r => r.id).concat("dakuten", "yoon");
const DEFAULT_KANA_ROWS = KANA_ROWS.map(r => r.id);
const KANA_ROWS_KEY = "hiragana-kana-rows";
const KANA_SETS = {
  hiragana: { basic: HIRAGANA_BASIC, dakuten: HIRAGANA_DAKUTEN, yoon: HIRAGANA_YOON },
  katakana: { basic: KATAKANA_BASIC, dakuten: KATAKANA_DAKUTEN, yoon: KATAKANA_YOON },
};

// Kana of one script (a KANA_SETS entry) in the chosen rows, in chart order.
function kanaPoolFor(sets, rows) {
  const pool = [];
  KANA_ROWS.forEach(r => {
    if (rows.includes(r.id)) pool.push(...sets.basic.slice(r.from, r.to));
  });
  if (rows.includes("dakuten")) pool.push(...sets.dakuten);
  if (rows.includes("yoon")) pool.push(...sets.yoon);
  return pool;
}

// Stored choice -> known row ids in canonical order. Anything unreadable,
// unknown or empty falls back to the default (all basic rows).
function parseKanaRows(raw) {
  let rows;
  try {
    rows = JSON.parse(raw);
  } catch {
    return [...DEFAULT_KANA_ROWS];
  }
  if (!Array.isArray(rows)) return [...DEFAULT_KANA_ROWS];
  const valid = KANA_ROW_IDS.filter(id => rows.includes(id));
  return valid.length ? valid : [...DEFAULT_KANA_ROWS];
}

// Turns one row on or off; the last row that is on stays on (same array back).
function toggleKanaRow(rows, id) {
  if (!KANA_ROW_IDS.includes(id)) return rows;
  if (rows.includes(id)) return rows.length > 1 ? rows.filter(r => r !== id) : rows;
  return KANA_ROW_IDS.filter(r => r === id || rows.includes(r));
}

function kanaRowLabel(id, sets) {
  if (id === "dakuten") return "Dakuten";
  if (id === "yoon") return "Yōon";
  return sets.basic[KANA_ROWS.find(r => r.id === id).from][0];
}

let kanaRows = parseKanaRows(localStorage.getItem(KANA_ROWS_KEY));

// Draws the row chips into a container, labelled in the given script.
function renderKanaRowChips(container, script) {
  const sets = KANA_SETS[script];
  container.innerHTML = KANA_ROW_IDS.map(id => {
    const on = kanaRows.includes(id);
    return `<button type="button" class="chip row-chip${on ? " active" : ""}" data-row="${id}" aria-pressed="${on}">${kanaRowLabel(id, sets)}</button>`;
  }).join("");
}

// One delegated listener per picker; onChange redraws the pickers and lets
// the tab react (Psaní starts a new round).
function bindKanaRowChips(container, onChange) {
  container.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-row]");
    if (!chip) return;
    const next = toggleKanaRow(kanaRows, chip.dataset.row);
    if (next === kanaRows) return;
    kanaRows = next;
    localStorage.setItem(KANA_ROWS_KEY, JSON.stringify(kanaRows));
    onChange();
  });
}

// --- Quiz ---
// Vocab pairs mirror the kana [prompt, answer] shape, with two extra fields:
// [plainWord, english, rubyHtml, romaji]. isVocabPair() branches on length.
const VOCAB_PAIRS = FLASHCARDS.map(c => [
  segmentsToPlainText(c.segments),
  c.english,
  segmentsToHtml(c.segments),
  c.romaji,
]);
const ALL_KANA = HIRAGANA_BASIC.concat(HIRAGANA_DAKUTEN, HIRAGANA_YOON, KATAKANA_ALL);
const HIRAGANA_KEYS = new Set(HIRAGANA_BASIC.concat(HIRAGANA_DAKUTEN, HIRAGANA_YOON).map(p => p[0]));
// "hiragana" / "katakana" (both allowed, filtered by rows) or "vocab" alone.
let selectedCategories = ["hiragana"];
let selectedDirection = "char2romaji";

function isVocabPair(pair) {
  return pair.length > 2;
}

// Adaptive weighting: characters answered wrong more often show up more.
// The stats store itself lives in the shared learning-state block above.
function weightedSample(pool, n) {
  const stats = loadKanaStats();
  const remaining = [...pool];
  const result = [];
  for (let k = 0; k < n && remaining.length; k++) {
    const weights = remaining.map(p => kanaWeight(p[0], stats));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < weights.length; idx++) {
      r -= weights[idx];
      if (r <= 0) break;
    }
    if (idx >= remaining.length) idx = remaining.length - 1;
    result.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return result;
}

function renderWeakSpots() {
  const container = document.getElementById("weakSpots");
  if (!container) return;
  const stats = loadKanaStats();
  const entries = Object.entries(stats)
    .filter(([, s]) => s.wrong > 0)
    .sort((a, b) => kanaWeight(b[0], stats) - kanaWeight(a[0], stats))
    .slice(0, 8);
  if (entries.length === 0) {
    container.innerHTML = "";
    return;
  }
  // The reset sits on its own line below, away from "Procvičit", and asks first:
  // it wipes the whole answer history at once.
  container.innerHTML = `
    <span class="weak-spots-label">Nejvíc ti dělá potíže:</span>
    ${entries.map(([char]) => `<span class="weak-chip">${char}</span>`).join("")}
    <button id="practiceWeak" class="practice-weak-btn">🎯 Procvičit</button>
    <div class="weak-spots-footer">
      <button id="resetStats" class="reset-stats-btn">Vynulovat statistiky</button>
    </div>
  `;
  document.getElementById("practiceWeak").addEventListener("click", () => startWeakQuiz());
  document.getElementById("resetStats").addEventListener("click", () => {
    if (!confirm(RESET_STATS_CONFIRM)) return;
    localStorage.removeItem(KANA_STATS_KEY);
    renderWeakSpots();
  });
}
const RESET_STATS_CONFIRM =
  "Vynulovat statistiky?\n\n" +
  "Smaže se počet správných a chybných odpovědí u všech znaků a slov " +
  "(slabá místa, výběr otázek, zvládnutí v Pokroku). Opakování v Kartičkách a historie aktivity zůstanou.";
renderWeakSpots();

document.querySelectorAll("#categoryChips .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    // "Slovíčka" is exclusive: mixing word questions with single-kana questions
    // would produce nonsense answer options, so selecting one side clears the other.
    if (chip.dataset.cat === "vocab" && !chip.classList.contains("active")) {
      document.querySelectorAll("#categoryChips .chip").forEach(c => c.classList.remove("active"));
    } else if (chip.dataset.cat !== "vocab") {
      const vocabChip = document.querySelector('#categoryChips .chip[data-cat="vocab"]');
      if (vocabChip) vocabChip.classList.remove("active");
    }
    chip.classList.toggle("active");
    const active = [...document.querySelectorAll("#categoryChips .chip.active")];
    if (active.length === 0) {
      chip.classList.add("active");
      return;
    }
    selectedCategories = active.map(c => c.dataset.cat);
    updateDirectionLabels();
    updateQuizRows();
  });
});

// Rows apply to kana only; labels follow the script when only Katakana is on.
const quizRowsGroup = document.getElementById("quizRowsGroup");
const quizRowChips = document.getElementById("quizRowChips");
function updateQuizRows() {
  quizRowsGroup.hidden = selectedCategories.includes("vocab");
  const onlyKatakana = selectedCategories.length === 1 && selectedCategories[0] === "katakana";
  renderKanaRowChips(quizRowChips, onlyKatakana ? "katakana" : "hiragana");
}

// With Slovíčka the "reading" side is the word's meaning, so the direction
// chips name what is really asked. Setup never mixes words with kana.
const DIRECTION_LABELS = {
  kana: { char2romaji: "Znak → výslovnost", romaji2char: "Výslovnost → znak", audio2char: "Poslech → znak" },
  vocab: { char2romaji: "Slovo → význam", romaji2char: "Význam → slovo", audio2char: "Poslech → slovo" },
};
function updateDirectionLabels() {
  const labels = DIRECTION_LABELS[selectedCategories.includes("vocab") ? "vocab" : "kana"];
  document.querySelectorAll("#directionChips .chip").forEach(c => { c.textContent = labels[c.dataset.dir]; });
}
updateDirectionLabels();

document.querySelectorAll("#directionChips .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#directionChips .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    selectedDirection = chip.dataset.dir;
  });
});

const quizSetup = document.getElementById("quizSetup");
const quizPlay = document.getElementById("quizPlay");
const quizResult = document.getElementById("quizResult");
const quizPrompt = document.getElementById("quizPrompt");
const quizOptions = document.getElementById("quizOptions");
const quizScoreEl = document.getElementById("quizScore");
const quizCountEl = document.getElementById("quizCount");
const quizNextBtn = document.getElementById("quizNext");
const quizMistakesEl = document.getElementById("quizMistakes");
const quizMistakeListEl = document.getElementById("quizMistakeList");

let quizPool = [];
let quizQueue = [];
let currentQuestion = null;
let score = 0;
let quizMode = "normal"; // "normal" | "weak" — also decides the wrong-option pool
let roundLength = 10;
const QUESTIONS_PER_ROUND = 10;
// Questions missed in the current round, in the order they were missed.
let quizMistakes = [];
// Starts another round like the last one ("Zkusit znovu"); returns false when
// it can't (no weak spots left), so the caller falls back to the setup.
let quizRetry = null;
// Pending auto-advance after a correct answer; cleared when the round ends early.
let quizAdvanceTimer = null;

function buildPool() {
  if (selectedCategories.includes("vocab")) return VOCAB_PAIRS;
  return selectedCategories.flatMap(script => kanaPoolFor(KANA_SETS[script], kanaRows));
}

// The answer field is the kana char for "romaji2char" and "audio2char", romaji for "char2romaji".
function answerField(pair) {
  return selectedDirection === "char2romaji" ? pair[1] : pair[0];
}

// Three wrong options with answers distinct from each other and the correct
// one, from `pool` first; when it can't give three (a small row choice, e.g.
// just や), the rest come from `fallback`, so there are always four options.
function pickOptions(correct, pool, fallback = []) {
  const wrong = [];
  const seen = new Set([answerField(correct)]);
  for (const source of [pool, fallback]) {
    for (const o of shuffle(source.filter(p => p[0] !== correct[0]))) {
      if (wrong.length === 3) break;
      const val = answerField(o);
      if (seen.has(val)) continue;
      seen.add(val);
      wrong.push(o);
    }
  }
  return shuffle([correct, ...wrong]);
}

// The whole set of the question's kind: all words, or all kana of its script.
function scriptPoolOf(question) {
  if (isVocabPair(question)) return VOCAB_PAIRS;
  return HIRAGANA_KEYS.has(question[0])
    ? HIRAGANA_BASIC.concat(HIRAGANA_DAKUTEN, HIRAGANA_YOON)
    : KATAKANA_ALL;
}

// In weak-spot mode the round's own pool can be tiny (even 1 item), so wrong
// options are drawn from the full set of the same kind instead.
function optionPoolFor(question) {
  if (quizMode === "weak") return isVocabPair(question) ? VOCAB_PAIRS : ALL_KANA;
  return quizPool;
}

// Adds a missed question to the round's list once (keyed like the stats).
function addQuizMistake(mistakes, pair) {
  if (mistakes.some(p => p[0] === pair[0])) return false;
  mistakes.push(pair);
  return true;
}

// One line of the result list for a missed question: what was asked → the
// right answer, with the reading on the kana/word side unless that side is
// already the reading. Returns HTML (ruby for words), from trusted data only.
function mistakeSummary(pair, direction) {
  const vocab = isVocabPair(pair);
  const reading = (r) => `<span class="mistake-reading">${r}</span>`;
  const charSide = vocab ? `${pair[2]} ${reading(pair[3])}` : `${pair[0]} ${reading(pair[1])}`;
  if (direction === "char2romaji") {
    return vocab
      ? { question: charSide, answer: pair[1] }
      : { question: pair[0], answer: pair[1] };
  }
  if (direction === "romaji2char") {
    return { question: pair[1], answer: vocab ? charSide : pair[0] };
  }
  return { question: "🔊", answer: charSide }; // audio2char
}

function nextQuestion() {
  clearTimeout(quizAdvanceTimer);
  quizNextBtn.hidden = true;
  if (quizQueue.length === 0) {
    finishQuiz();
    return;
  }
  currentQuestion = quizQueue.pop();
  const [char] = currentQuestion;
  if (selectedDirection === "audio2char") {
    quizPrompt.innerHTML = `<button class="play-prompt-btn" id="playPromptBtn" title="Přehrát">🔊</button>`;
    document.getElementById("playPromptBtn").addEventListener("click", () => speak(char));
    speak(char);
  } else if (selectedDirection === "char2romaji" && isVocabPair(currentQuestion)) {
    // Vocab prompt shows the word with furigana; the answer is the meaning.
    quizPrompt.innerHTML = currentQuestion[2];
  } else {
    quizPrompt.textContent = selectedDirection === "char2romaji" ? currentQuestion[0] : currentQuestion[1];
  }
  quizOptions.innerHTML = "";
  const options = pickOptions(currentQuestion, optionPoolFor(currentQuestion), scriptPoolOf(currentQuestion));
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.dataset.key = opt[0];
    // Word options show furigana, so the kanji can be read.
    if (isVocabPair(opt) && selectedDirection !== "char2romaji") btn.innerHTML = opt[2];
    else btn.textContent = answerField(opt);
    btn.addEventListener("click", () => handleAnswer(btn, opt));
    quizOptions.appendChild(btn);
  });
  quizCountEl.textContent = `${roundLength - quizQueue.length} / ${roundLength}`;
}

function handleAnswer(btn, opt) {
  const isCorrect = opt[0] === currentQuestion[0];
  document.querySelectorAll(".option-btn").forEach(b => b.disabled = true);
  if (isCorrect) {
    btn.classList.add("correct");
    score++;
    quizScoreEl.textContent = `Skóre: ${score}`;
  } else {
    btn.classList.add("wrong");
    document.querySelectorAll(".option-btn").forEach(b => {
      if (b.dataset.key === currentQuestion[0]) b.classList.add("correct");
    });
    addQuizMistake(quizMistakes, currentQuestion);
  }
  updateKanaStat(currentQuestion[0], isCorrect);
  if (selectedDirection === "char2romaji") speak(currentQuestion[0]);
  if (isCorrect) {
    quizAdvanceTimer = setTimeout(nextQuestion, 900);
  } else {
    // A miss waits for "Dál", so there is time to look at the right answer.
    quizNextBtn.hidden = false;
    quizNextBtn.focus();
  }
}

function finishQuiz() {
  quizPlay.hidden = true;
  quizResult.hidden = false;
  document.getElementById("resultText").textContent =
    `Skóre ${score} / ${roundLength}`;
  // With mistakes, practising them is the main next step; otherwise a new round.
  const hasMistakes = quizMistakes.length > 0;
  quizMistakesEl.hidden = !hasMistakes;
  document.getElementById("retryQuiz").className = hasMistakes ? "secondary-btn" : "primary-btn";
  quizMistakeListEl.innerHTML = quizMistakes.map(pair => {
    const { question, answer } = mistakeSummary(pair, selectedDirection);
    return `<li><span class="mistake-q">${question}</span> → <span class="mistake-a">${answer}</span></li>`;
  }).join("");
}

function beginRound(queue) {
  clearTimeout(quizAdvanceTimer);
  quizQueue = queue;
  roundLength = queue.length;
  score = 0;
  quizMistakes = [];
  quizScoreEl.textContent = "Skóre: 0";
  quizSetup.hidden = true;
  quizResult.hidden = true;
  quizPlay.hidden = false;
  nextQuestion();
  return true;
}

function startQuiz() {
  quizMode = "normal";
  quizRetry = startQuiz;
  quizPool = buildPool();
  const count = Math.min(QUESTIONS_PER_ROUND, quizPool.length);
  return beginRound(shuffle(weightedSample(quizPool, count)).reverse());
}

// A round of just the questions missed in the last one. Direction, quizMode
// and quizPool stay as they were, so the wrong options come from the same set
// as in that round; "Zkusit znovu" afterwards repeats these same items.
function startMistakesQuiz() {
  const items = [...quizMistakes];
  if (items.length === 0) return false;
  quizRetry = () => beginRound(shuffle(items));
  return quizRetry();
}

function showQuizSetup() {
  clearTimeout(quizAdvanceTimer);
  quizPlay.hidden = true;
  quizResult.hidden = true;
  quizSetup.hidden = false;
  renderWeakSpots();
}

// Targeted practice: a round built only from the user's current weak spots.
function startWeakQuiz() {
  const stats = loadKanaStats();
  const lookup = new Map(ALL_KANA.concat(VOCAB_PAIRS).map(p => [p[0], p]));
  const weak = Object.entries(stats)
    .filter(([key, s]) => s.wrong > 0 && lookup.has(key))
    .sort((a, b) => kanaWeight(b[0], stats) - kanaWeight(a[0], stats))
    .slice(0, QUESTIONS_PER_ROUND)
    .map(([key]) => lookup.get(key));
  if (weak.length === 0) return false;
  quizMode = "weak";
  quizRetry = startWeakQuiz;
  quizPool = weak;
  return beginRound(shuffle(weak).reverse());
}

document.getElementById("startQuiz").addEventListener("click", startQuiz);
quizNextBtn.addEventListener("click", nextQuestion);
document.getElementById("practiceMistakes").addEventListener("click", startMistakesQuiz);
// A new round with the same settings; the setup only if that's not possible.
document.getElementById("retryQuiz").addEventListener("click", () => {
  if (!quizRetry || !quizRetry()) showQuizSetup();
});
document.getElementById("quizSettings").addEventListener("click", showQuizSetup);
document.getElementById("quitQuiz").addEventListener("click", showQuizSetup);

// --- Typing drills ---
// Free-text recall instead of multiple choice. Input is compared after
// normalising both sides to one romanisation, so Hepburn and kunrei spellings
// (shi/si, tsu/tu, ja/zya, kōhī/koohii/kouhii…) are all accepted.
function normalizeRomaji(input) {
  let s = String(input).toLowerCase().trim();
  s = s.replace(/[\s'’`\-_.]/g, "");
  s = s.replace(/ā/g, "aa").replace(/ī/g, "ii").replace(/ū/g, "uu")
       .replace(/ē/g, "ee").replace(/ō/g, "oo");
  s = s.replace(/ou/g, "oo");
  s = s.replace(/sha/g, "sya").replace(/shu/g, "syu").replace(/sho/g, "syo").replace(/shi/g, "si");
  s = s.replace(/cha/g, "tya").replace(/chu/g, "tyu").replace(/cho/g, "tyo").replace(/chi/g, "ti");
  s = s.replace(/jya/g, "zya").replace(/jyu/g, "zyu").replace(/jyo/g, "zyo");
  s = s.replace(/ja/g, "zya").replace(/ju/g, "zyu").replace(/jo/g, "zyo").replace(/ji/g, "zi");
  s = s.replace(/tsu/g, "tu").replace(/fu/g, "hu");
  s = s.replace(/nn/g, "n");
  s = s.replace(/wo/g, "o");
  return s;
}

const HIRAGANA_ALL = HIRAGANA_BASIC.concat(HIRAGANA_DAKUTEN, HIRAGANA_YOON);

function typingItemFromKana(pair) {
  return { key: pair[0], promptHtml: pair[0], sub: "", answer: pair[1], isVocab: false };
}
function typingItemFromCard(card) {
  return {
    key: segmentsToPlainText(card.segments),
    promptHtml: segmentsToHtml(card.segments),
    sub: card.english,
    answer: card.romaji,
    isVocab: true,
  };
}

let typingCategory = "hiragana";
let typingScore = 0;
let typingStreak = 0;
let typingItem = null;
// "answer" = waiting for input, "wrong" = miss shown with "Zkusit znovu"/"Dál",
// "done" = correct answer shown, next question about to come.
let typingPhase = "answer";
let typingMissed = false;   // the current question was answered wrong at least once
let typingRecorded = false; // the current question already went to stats/SRS
let typingAdvanceTimer = null;

const typingPromptEl = document.getElementById("typingPrompt");
const typingSubEl = document.getElementById("typingSub");
const typingInputEl = document.getElementById("typingInput");
const typingFeedbackEl = document.getElementById("typingFeedback");
const typingScoreEl = document.getElementById("typingScore");
const typingStreakEl = document.getElementById("typingStreak");
const typingCheckBtn = document.getElementById("typingCheck");
const typingSkipBtn = document.getElementById("typingSkip");
const typingRetryBtn = document.getElementById("typingRetry");
const typingNextBtn = document.getElementById("typingNext");

function typingPool() {
  if (typingCategory === "hiragana" || typingCategory === "katakana") {
    return kanaPoolFor(KANA_SETS[typingCategory], kanaRows).map(typingItemFromKana);
  }
  if (typingCategory === "vocab") return FLASHCARDS.map(typingItemFromCard);
  // Weak spots: whatever the user has actually got wrong, kana and words alike.
  const stats = loadKanaStats();
  const all = HIRAGANA_ALL.concat(KATAKANA_ALL).map(typingItemFromKana)
    .concat(FLASHCARDS.map(typingItemFromCard));
  return all
    .filter(item => stats[item.key] && stats[item.key].wrong > 0)
    .sort((a, b) => kanaWeight(b.key, stats) - kanaWeight(a.key, stats))
    .slice(0, 30);
}

function pickTypingItem() {
  const pool = typingPool();
  if (pool.length === 0) return null;
  const candidates = pool.length > 1 && typingItem
    ? pool.filter(item => item.key !== typingItem.key)
    : pool;
  const stats = loadKanaStats();
  const weights = candidates.map(item => kanaWeight(item.key, stats));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// What an answer event records for the current question, at most once:
// { stat, srs } — stat = correct/wrong in the adaptive stats, srs = correct/
// wrong for the SRS schedule or null to leave it alone; null = nothing yet.
// Pure, so the rules can be tested without the DOM:
// - a first-try correct answer counts at once (stats + SRS);
// - a miss waits: retrying it right ("Zkusit znovu") is still a miss in the
//   stats, but leaves SRS as it was;
// - leaving a missed question any other way ("Dál", "Přeskočit", another
//   category or tab) records the miss in stats and SRS.
function typingRecordFor(event, missed, recorded) {
  if (recorded) return null;
  if (event === "correct") return missed ? { stat: false, srs: null } : { stat: true, srs: true };
  if (event === "leave") return missed ? { stat: false, srs: false } : null;
  return null; // "wrong": decided when the question is retried or left
}

// Typing an introduced word is a real review, so it also moves the card's SRS
// schedule. A word not introduced yet stays out of SRS (only the word of the
// day or a flashcard ✓/✗ introduces it).
function recordTypingAnswer(key, isVocab, record) {
  updateKanaStat(key, record.stat);
  if (isVocab && record.srs !== null) rescheduleIfIntroduced(key, record.srs);
}

function applyTypingRecord(record) {
  if (record === null) return;
  typingRecorded = true;
  recordTypingAnswer(typingItem.key, typingItem.isVocab, record);
}

// Check/Skip while answering; Retry/Next after a miss.
function setTypingPhase(phase) {
  typingPhase = phase;
  const wrong = phase === "wrong";
  typingCheckBtn.hidden = wrong;
  typingSkipBtn.hidden = wrong;
  typingRetryBtn.hidden = !wrong;
  typingNextBtn.hidden = !wrong;
  typingInputEl.disabled = phase !== "answer";
}

// A missed question that is left before it was recorded counts as a miss,
// however it is left (Dál, Přeskočit, another category, back to the tab).
function settleTypingMiss() {
  if (!typingItem) return;
  applyTypingRecord(typingRecordFor("leave", typingMissed, typingRecorded));
}

function renderTypingQuestion() {
  clearTimeout(typingAdvanceTimer);
  settleTypingMiss();
  typingItem = pickTypingItem();
  typingMissed = false;
  typingRecorded = false;
  setTypingPhase("answer");
  typingFeedbackEl.textContent = "";
  typingFeedbackEl.className = "typing-feedback";
  typingInputEl.value = "";

  if (!typingItem) {
    typingPromptEl.textContent = "—";
    typingSubEl.textContent = "Žádná slabá místa. Vyber jinou kategorii.";
    typingInputEl.disabled = true;
    return;
  }
  typingPromptEl.innerHTML = typingItem.promptHtml;
  typingSubEl.textContent = typingItem.sub;
  typingInputEl.focus();
}

function checkTypingAnswer() {
  if (!typingItem || typingPhase !== "answer") return;
  const given = typingInputEl.value;
  if (!given.trim()) return;
  const correct = normalizeRomaji(given) === normalizeRomaji(typingItem.answer);
  applyTypingRecord(typingRecordFor(correct ? "correct" : "wrong", typingMissed, typingRecorded));

  if (correct) {
    // A retry after a miss is not a first-try answer: no score, no streak.
    if (!typingMissed) {
      typingScore++;
      typingStreak++;
    }
    typingFeedbackEl.textContent = `✓ Správně — ${typingItem.answer}`;
    typingFeedbackEl.className = "typing-feedback correct";
    speak(typingItem.key);
    setTypingPhase("done");
    typingAdvanceTimer = setTimeout(renderTypingQuestion, 800);
  } else {
    typingMissed = true;
    typingStreak = 0;
    typingFeedbackEl.textContent = `✗ Správně je: ${typingItem.answer}`;
    typingFeedbackEl.className = "typing-feedback wrong";
    setTypingPhase("wrong");
    typingNextBtn.focus();
  }
  typingScoreEl.textContent = `Správně: ${typingScore}`;
  typingStreakEl.textContent = typingStreak >= 3 ? `${typingStreak} v řadě` : "";
}

// Same question again with an empty field; nothing is recorded yet.
function retryTypingQuestion() {
  if (typingPhase !== "wrong") return;
  setTypingPhase("answer");
  typingFeedbackEl.textContent = "";
  typingFeedbackEl.className = "typing-feedback";
  typingInputEl.value = "";
  typingInputEl.focus();
}

// "Dál" after a miss: the miss is recorded on the way out (settleTypingMiss).
function nextTypingQuestion() {
  if (typingPhase !== "wrong") return;
  renderTypingQuestion();
}

function startTypingRound() {
  typingScore = 0;
  typingStreak = 0;
  typingScoreEl.textContent = "Správně: 0";
  typingStreakEl.textContent = "";
  settleTypingMiss();
  typingItem = null;
  renderTypingQuestion();
}

typingCheckBtn.addEventListener("click", checkTypingAnswer);
typingSkipBtn.addEventListener("click", renderTypingQuestion);
typingRetryBtn.addEventListener("click", retryTypingQuestion);
typingNextBtn.addEventListener("click", nextTypingQuestion);
typingInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    checkTypingAnswer();
  }
});

// "Dál" gets focus right after a miss, so a key still held from answering
// (Enter in the typing field, Enter/Space on a quiz option) would auto-repeat
// straight onto it and skip the right answer. Repeats are swallowed here, in
// the capture phase, before the button's default activation; a fresh press
// works as usual.
function ignoreHeldKey(btn) {
  btn.addEventListener("keydown", (e) => {
    if (e.repeat && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}
ignoreHeldKey(quizNextBtn);
ignoreHeldKey(typingNextBtn);

// After a miss "Dál" gets focus, so Enter/Space press it natively. This covers
// the case where focus moved elsewhere (a tap on the page): Enter/Space then
// still mean "Dál". Keys aimed at another control keep their own meaning.
document.addEventListener("keydown", (e) => {
  if ((e.key !== "Enter" && e.key !== " ") || e.repeat) return;
  if (e.target instanceof Element && e.target.closest("button, input, select, textarea, a")) return;
  const btn = [quizNextBtn, typingNextBtn].find(b => !b.hidden && b.offsetParent !== null);
  if (!btn) return;
  e.preventDefault();
  btn.click();
});
// Rows apply to Hiragana/Katakana only, labelled in that script.
const typingRowsGroup = document.getElementById("typingRowsGroup");
const typingRowChips = document.getElementById("typingRowChips");
function updateTypingRows() {
  const kana = typingCategory === "hiragana" || typingCategory === "katakana";
  typingRowsGroup.hidden = !kana;
  if (kana) renderKanaRowChips(typingRowChips, typingCategory);
}

document.querySelectorAll("#typingCategoryChips .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#typingCategoryChips .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    typingCategory = chip.dataset.cat;
    updateTypingRows();
    startTypingRound();
  });
});

// The row choice is shared: a change in either tab redraws both pickers.
bindKanaRowChips(quizRowChips, () => {
  updateQuizRows();
  updateTypingRows();
});
bindKanaRowChips(typingRowChips, () => {
  updateQuizRows();
  updateTypingRows();
  startTypingRound();
});
updateQuizRows();
updateTypingRows();

// --- Progress dashboard ---
function renderProgress() {
  const stats = loadKanaStats();
  const srs = loadSrs();

  const groups = [
    { label: "Hiragana", keys: HIRAGANA_ALL.map(p => p[0]) },
    { label: "Katakana", keys: KATAKANA_ALL.map(p => p[0]) },
    { label: "Slovíčka", keys: FLASHCARDS.map(c => segmentsToPlainText(c.segments)) },
  ];

  document.getElementById("progressBars").innerHTML = groups.map(group => {
    const total = group.keys.length;
    let mastered = 0;
    let learning = 0;
    group.keys.forEach(key => {
      const level = itemMastery(key, stats, srs);
      if (level === 2) mastered++;
      else if (level === 1) learning++;
    });
    const masteredPct = (mastered / total) * 100;
    const learningPct = (learning / total) * 100;
    return `
      <div class="progress-row">
        <div class="progress-row-head">
          <span class="progress-label">${group.label}</span>
          <span class="progress-value">${mastered} / ${total}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill mastered" style="width:${masteredPct}%"></div>
          <div class="progress-fill learning" style="width:${learningPct}%"></div>
        </div>
        <div class="progress-legend">${mastered} zvládnuto · ${learning} rozpracováno · ${total - mastered - learning} nezačato</div>
      </div>
    `;
  }).join("");

  const due = dueCardIndices().length;
  const next = nextDueTime();
  const introduced = introducedCount();
  const scheduled = introduced - due;
  document.getElementById("progressSrs").innerHTML = `
    <div class="srs-stat">
      <span class="srs-stat-value">${due}</span>
      <span class="srs-stat-label">karet k opakování</span>
    </div>
    <div class="srs-stat">
      <span class="srs-stat-value">${scheduled}</span>
      <span class="srs-stat-label">naplánováno na později</span>
    </div>
    <div class="srs-stat">
      <span class="srs-stat-value">${next ? formatInterval(next - Date.now()) : "—"}</span>
      <span class="srs-stat-label">další opakování</span>
    </div>
    <div class="srs-stat">
      <span class="srs-stat-value">${introduced} / ${FLASHCARDS.length}</span>
      <span class="srs-stat-label">v opakování</span>
    </div>
  `;

  const activity = loadActivity();
  const days = lastLocalDays(new Date(), 7).map(({ key, weekday }) => ({
    key,
    count: activity[key] || 0,
    label: ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"][weekday],
  }));
  const max = Math.max(1, ...days.map(d => d.count));
  const weekTotal = days.reduce((sum, d) => sum + d.count, 0);
  document.getElementById("progressActivity").innerHTML = `
    <div class="activity-chart">
      ${days.map(d => `
        <div class="activity-day">
          <div class="activity-bar-wrap">
            <div class="activity-bar" style="height:${(d.count / max) * 100}%" title="${d.count} odpovědí"></div>
          </div>
          <span class="activity-label">${d.label}</span>
        </div>
      `).join("")}
    </div>
    <p class="activity-summary">Dnes: <strong>${days[days.length - 1].count}</strong> odpovědí · za posledních 7 dní: <strong>${weekTotal}</strong></p>
  `;

  const weak = Object.entries(stats)
    .filter(([, s]) => s.wrong > 0)
    .sort((a, b) => kanaWeight(b[0], stats) - kanaWeight(a[0], stats))
    .slice(0, 12);
  document.getElementById("progressWeak").innerHTML = weak.length === 0
    ? `<p class="hint">Zatím žádné chyby.</p>`
    : `<div class="weak-spots">${weak.map(([key, s]) =>
        `<span class="weak-chip" title="${s.correct} správně / ${s.wrong} chybně">${key}</span>`
      ).join("")}</div>`;
}
renderProgress();
startTypingRound();
