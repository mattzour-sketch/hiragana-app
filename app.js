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
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
    // These panels depend on stored progress that other tabs change, and on
    // wall-clock time (SRS due dates), so they refresh on every visit.
    if (btn.dataset.tab === "progress") renderProgress();
    if (btn.dataset.tab === "flashcards") buildFlashcardDeck();
    if (btn.dataset.tab === "typing") startTypingRound();
  });
});

// --- Speech ---
let ttsVolume = parseFloat(localStorage.getItem("hiragana-volume") ?? "1");
let selectedVoiceURI = localStorage.getItem("hiragana-voice") || "";

function speak(char) {
  if (!("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(char);
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
// Cards never reviewed count as due, so a fresh deck starts fully available.
function dueCardIndices() {
  const srs = loadSrs();
  const now = Date.now();
  const due = [];
  FLASHCARDS.forEach((card, i) => {
    const entry = srs[segmentsToPlainText(card.segments)];
    if (!entry || entry.due <= now) due.push({ i, due: entry ? entry.due : 0 });
  });
  due.sort((a, b) => a.due - b.due);
  return due.map(d => d.i);
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
function masteredCardCount() {
  const srs = loadSrs();
  return FLASHCARDS.filter(card => {
    const entry = srs[segmentsToPlainText(card.segments)];
    return entry && entry.box >= SRS_MASTERED_BOX;
  }).length;
}
function formatInterval(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 den" : days < 5 ? `${days} dny` : `${days} dní`;
}

// Daily answer counts, used by the progress dashboard.
const ACTIVITY_KEY = "hiragana-activity";
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function loadActivity() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVITY_KEY)) || {};
  } catch {
    return {};
  }
}
function recordActivity() {
  const activity = loadActivity();
  const key = todayKey();
  activity[key] = (activity[key] || 0) + 1;
  // Keep the store small: only the last 30 days matter for the dashboard.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  Object.keys(activity).forEach(k => {
    if (k < cutoff) delete activity[k];
  });
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
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
function segmentsToHtml(segments) {
  return segments.map(seg =>
    seg.f ? `<ruby>${seg.t}<rt>${seg.f}</rt></ruby>` : seg.t
  ).join("");
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

const flashcardEl = document.getElementById("flashcard");
const flashcardFrontEl = document.getElementById("flashcardFront");
const flashcardBackEl = document.getElementById("flashcardBack");
const flashcardCountEl = document.getElementById("flashcardCount");
const flashcardKnownEl = document.getElementById("flashcardKnown");
const flashcardEmptyEl = document.getElementById("flashcardEmpty");
const flashcardEmptyTitleEl = document.getElementById("flashcardEmptyTitle");
const flashcardEmptySubEl = document.getElementById("flashcardEmptySub");
const flashcardNextBatchEl = document.getElementById("flashcardNextBatch");
const flashcardActionsEl = document.getElementById("flashcardActions");
const flashcardKnowActionsEl = document.getElementById("flashcardKnowActions");
const srsHintEl = document.getElementById("srsHint");
const dueCountEl = document.getElementById("dueCount");

function buildFlashcardDeck() {
  flashcardOrder = flashcardMode === "review"
    ? dueCardIndices().slice(0, REVIEW_BATCH)
    : shuffle(FLASHCARDS.map((_, i) => i));
  flashcardIndex = 0;
  flashcardFlipped = false;
  flashcardEl.classList.remove("flipped");
  srsHintEl.textContent = "";
  renderFlashcard();
}

function refreshDueCount() {
  dueCountEl.textContent = String(dueCardIndices().length);
}

function renderFlashcard() {
  refreshDueCount();
  flashcardKnownEl.textContent = `Zvládnuto: ${masteredCardCount()} / ${FLASHCARDS.length}`;

  const empty = flashcardOrder.length === 0;
  flashcardEmptyEl.hidden = !empty;
  flashcardEl.parentElement.hidden = empty;
  flashcardActionsEl.hidden = empty;
  flashcardKnowActionsEl.hidden = empty;
  if (empty) {
    flashcardCountEl.textContent = "0 / 0";
    // The deck is one batch, so "empty" can still mean more cards are waiting.
    const remaining = dueCardIndices().length;
    if (remaining > 0) {
      flashcardEmptyTitleEl.textContent = "Dávka hotová 👏";
      flashcardEmptySubEl.textContent = `Zbývá ještě ${remaining} karet k opakování.`;
      flashcardNextBatchEl.hidden = false;
    } else {
      const next = nextDueTime();
      flashcardEmptyTitleEl.textContent = "Nic k opakování 🎉";
      flashcardEmptySubEl.textContent = next
        ? `Další karta bude připravená za ${formatInterval(next - Date.now())}.`
        : "Přepni na „Všechny karty“ a projdi si je znovu.";
      flashcardNextBatchEl.hidden = true;
    }
    return;
  }

  const card = FLASHCARDS[flashcardOrder[flashcardIndex]];
  flashcardEl.classList.toggle("flipped", flashcardFlipped);
  flashcardFrontEl.innerHTML = `
    <div class="flashcard-emoji">${card.emoji}</div>
    <div class="flashcard-hint-text">Klikni pro otočení</div>
  `;
  flashcardBackEl.innerHTML = `
    <div class="flashcard-word">${segmentsToHtml(card.segments)}</div>
    <div class="flashcard-romaji">${card.romaji}</div>
    <div class="flashcard-english">${card.english}</div>
  `;
  flashcardCountEl.textContent = `${flashcardIndex + 1} / ${flashcardOrder.length}`;
}

function goToFlashcard(newIndex) {
  const wasFlipped = flashcardFlipped;
  flashcardFlipped = false;
  if (wasFlipped) {
    // Flip back to front first, and only swap the card's content once that
    // animation finishes — otherwise the next card's answer flashes on the
    // back face while it's still rotating away. A timeout fallback covers
    // cases where transitionend never fires (e.g. reduced-motion, hidden tab).
    flashcardEl.classList.remove("flipped");
    let swapped = false;
    const swap = () => {
      if (swapped) return;
      swapped = true;
      flashcardEl.removeEventListener("transitionend", onTransitionEnd);
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
  flashcardFlipped = !flashcardFlipped;
  flashcardEl.classList.toggle("flipped", flashcardFlipped);
  if (flashcardFlipped) {
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
  if (flashcardOrder.length === 0) return;
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

document.getElementById("flashcardKnowBtn").addEventListener("click", () => answerFlashcard(true));
document.getElementById("flashcardDontKnow").addEventListener("click", () => answerFlashcard(false));
flashcardNextBatchEl.addEventListener("click", buildFlashcardDeck);

document.querySelectorAll("#flashcardModeChips .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#flashcardModeChips .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    flashcardMode = chip.dataset.mode;
    buildFlashcardDeck();
  });
});

buildFlashcardDeck();

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
    builderFeedbackEl.textContent = "Správně! 🎉";
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
const CATEGORY_MAP = {
  basic: HIRAGANA_BASIC,
  dakuten: HIRAGANA_DAKUTEN,
  yoon: HIRAGANA_YOON,
  katakana: KATAKANA_ALL,
  vocab: VOCAB_PAIRS,
};
let selectedCategories = ["basic"];
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
  container.innerHTML = `
    <span class="weak-spots-label">Nejvíc ti dělá potíže:</span>
    ${entries.map(([char]) => `<span class="weak-chip">${char}</span>`).join("")}
    <button id="practiceWeak" class="practice-weak-btn">🎯 Procvičit</button>
    <button id="resetStats" class="reset-stats-btn">Vynulovat statistiky</button>
  `;
  document.getElementById("practiceWeak").addEventListener("click", () => startWeakQuiz());
  document.getElementById("resetStats").addEventListener("click", () => {
    localStorage.removeItem(KANA_STATS_KEY);
    renderWeakSpots();
  });
}
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
  });
});

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

let quizPool = [];
let quizQueue = [];
let currentQuestion = null;
let score = 0;
let quizMode = "normal"; // "normal" | "weak"
let roundLength = 10;
const QUESTIONS_PER_ROUND = 10;

function buildPool() {
  let pool = [];
  selectedCategories.forEach(cat => pool = pool.concat(CATEGORY_MAP[cat]));
  return pool;
}

// The answer field is the kana char for "romaji2char" and "audio2char", romaji for "char2romaji".
function answerField(pair) {
  return selectedDirection === "char2romaji" ? pair[1] : pair[0];
}

function pickOptions(correct, pool) {
  const others = shuffle(pool.filter(p => p[0] !== correct[0]));
  const wrong = [];
  const seen = new Set([answerField(correct)]);
  for (const o of others) {
    const val = answerField(o);
    if (seen.has(val)) continue;
    seen.add(val);
    wrong.push(o);
    if (wrong.length === 3) break;
  }
  return shuffle([correct, ...wrong]);
}

// In weak-spot mode the round's own pool can be tiny (even 1 item), so wrong
// options are drawn from the full set of the same kind instead.
function optionPoolFor(question) {
  if (quizMode === "weak") return isVocabPair(question) ? VOCAB_PAIRS : ALL_KANA;
  return quizPool;
}

function nextQuestion() {
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
  const options = pickOptions(currentQuestion, optionPoolFor(currentQuestion));
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = answerField(opt);
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
    const correctVal = answerField(currentQuestion);
    document.querySelectorAll(".option-btn").forEach(b => {
      if (b.textContent === correctVal) b.classList.add("correct");
    });
  }
  updateKanaStat(currentQuestion[0], isCorrect);
  if (selectedDirection === "char2romaji") speak(currentQuestion[0]);
  setTimeout(nextQuestion, 900);
}

function finishQuiz() {
  quizPlay.hidden = true;
  quizResult.hidden = false;
  document.getElementById("resultText").textContent =
    `Skóre ${score} / ${roundLength} — ${score === roundLength ? "perfektní! 🎉" : score >= roundLength * 0.7 ? "hezká práce!" : "trénuj dál!"}`;
}

function beginRound(queue) {
  quizQueue = queue;
  roundLength = queue.length;
  score = 0;
  quizScoreEl.textContent = "Skóre: 0";
  quizSetup.hidden = true;
  quizResult.hidden = true;
  quizPlay.hidden = false;
  nextQuestion();
}

function startQuiz() {
  quizMode = "normal";
  quizPool = buildPool();
  const count = Math.min(QUESTIONS_PER_ROUND, quizPool.length);
  beginRound(shuffle(weightedSample(quizPool, count)).reverse());
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
  if (weak.length === 0) return;
  quizMode = "weak";
  quizPool = weak;
  beginRound(shuffle(weak).reverse());
}

document.getElementById("startQuiz").addEventListener("click", startQuiz);
document.getElementById("retryQuiz").addEventListener("click", () => {
  quizResult.hidden = true;
  quizSetup.hidden = false;
  renderWeakSpots();
});
document.getElementById("quitQuiz").addEventListener("click", () => {
  quizPlay.hidden = true;
  quizSetup.hidden = false;
  renderWeakSpots();
});

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
let typingAwaitingNext = false;

const typingPromptEl = document.getElementById("typingPrompt");
const typingSubEl = document.getElementById("typingSub");
const typingInputEl = document.getElementById("typingInput");
const typingFeedbackEl = document.getElementById("typingFeedback");
const typingScoreEl = document.getElementById("typingScore");
const typingStreakEl = document.getElementById("typingStreak");
const typingCheckBtn = document.getElementById("typingCheck");

function typingPool() {
  if (typingCategory === "hiragana") return HIRAGANA_ALL.map(typingItemFromKana);
  if (typingCategory === "katakana") return KATAKANA_ALL.map(typingItemFromKana);
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

function renderTypingQuestion() {
  typingItem = pickTypingItem();
  typingAwaitingNext = false;
  typingFeedbackEl.textContent = "";
  typingFeedbackEl.className = "typing-feedback";
  typingInputEl.value = "";
  typingInputEl.disabled = false;
  typingCheckBtn.textContent = "Zkontrolovat";

  if (!typingItem) {
    typingPromptEl.textContent = "🎉";
    typingSubEl.textContent = "Zatím nemáš žádná slabá místa — zkus jinou kategorii.";
    typingInputEl.disabled = true;
    return;
  }
  typingPromptEl.innerHTML = typingItem.promptHtml;
  typingSubEl.textContent = typingItem.sub;
  typingInputEl.focus();
}

function checkTypingAnswer() {
  if (!typingItem) return;
  if (typingAwaitingNext) {
    renderTypingQuestion();
    return;
  }
  const given = typingInputEl.value;
  if (!given.trim()) return;
  const correct = normalizeRomaji(given) === normalizeRomaji(typingItem.answer);

  updateKanaStat(typingItem.key, correct);
  // Typing a word is a real review, so it also moves the card's SRS schedule.
  if (typingItem.isVocab) scheduleSrs(typingItem.key, correct);

  if (correct) {
    typingScore++;
    typingStreak++;
    typingFeedbackEl.textContent = `✓ Správně — ${typingItem.answer}`;
    typingFeedbackEl.className = "typing-feedback correct";
    speak(typingItem.key);
    typingInputEl.disabled = true;
    setTimeout(renderTypingQuestion, 800);
  } else {
    typingStreak = 0;
    typingFeedbackEl.textContent = `✗ Správně je: ${typingItem.answer}`;
    typingFeedbackEl.className = "typing-feedback wrong";
    typingAwaitingNext = true;
    typingCheckBtn.textContent = "Další";
  }
  typingScoreEl.textContent = `Správně: ${typingScore}`;
  typingStreakEl.textContent = typingStreak >= 3 ? `🔥 ${typingStreak} v řadě` : "";
}

function startTypingRound() {
  typingScore = 0;
  typingStreak = 0;
  typingScoreEl.textContent = "Správně: 0";
  typingStreakEl.textContent = "";
  typingItem = null;
  renderTypingQuestion();
}

typingCheckBtn.addEventListener("click", checkTypingAnswer);
document.getElementById("typingSkip").addEventListener("click", renderTypingQuestion);
typingInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    checkTypingAnswer();
  }
});
document.querySelectorAll("#typingCategoryChips .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#typingCategoryChips .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    typingCategory = chip.dataset.cat;
    startTypingRound();
  });
});

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
  const scheduled = FLASHCARDS.length - due;
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
  `;

  const activity = loadActivity();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    days.push({ key, count: activity[key] || 0, label: ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"][date.getDay()] });
  }
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
    ? `<p class="hint">Zatím žádné chyby — jen tak dál!</p>`
    : `<div class="weak-spots">${weak.map(([key, s]) =>
        `<span class="weak-chip" title="${s.correct} správně / ${s.wrong} chybně">${key}</span>`
      ).join("")}</div>`;
}
renderProgress();
startTypingRound();
