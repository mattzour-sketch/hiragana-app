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
  });
});

// --- Speech ---
let ttsVolume = parseFloat(localStorage.getItem("hiragana-volume") ?? "1");

function speak(char) {
  if (!("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(char);
  utter.lang = "ja-JP";
  utter.volume = ttsVolume;
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

const volumeSlider = document.getElementById("volumeSlider");
const volumeValue = document.getElementById("volumeValue");
volumeSlider.value = Math.round(ttsVolume * 100);
volumeValue.textContent = `${volumeSlider.value}%`;
volumeSlider.addEventListener("input", () => {
  ttsVolume = volumeSlider.value / 100;
  volumeValue.textContent = `${volumeSlider.value}%`;
  localStorage.setItem("hiragana-volume", ttsVolume);
});

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

// --- Flashcards ---
const FLASHCARD_KNOWN_KEY = "hiragana-flashcards-known";
let flashcardOrder = FLASHCARDS.map((_, i) => i);
let flashcardIndex = 0;
let flashcardFlipped = false;
let flashcardKnown = new Set(JSON.parse(localStorage.getItem(FLASHCARD_KNOWN_KEY) || "[]"));

const flashcardEl = document.getElementById("flashcard");
const flashcardFrontEl = document.getElementById("flashcardFront");
const flashcardBackEl = document.getElementById("flashcardBack");
const flashcardCountEl = document.getElementById("flashcardCount");
const flashcardKnownEl = document.getElementById("flashcardKnown");

function saveFlashcardKnown() {
  localStorage.setItem(FLASHCARD_KNOWN_KEY, JSON.stringify([...flashcardKnown]));
}

function renderFlashcard() {
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
  flashcardKnownEl.textContent = `Umím: ${flashcardKnown.size}`;
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
document.getElementById("flashcardKnowBtn").addEventListener("click", () => {
  flashcardKnown.add(flashcardOrder[flashcardIndex]);
  saveFlashcardKnown();
  goToFlashcard(flashcardIndex + 1);
});
document.getElementById("flashcardDontKnow").addEventListener("click", () => {
  flashcardKnown.delete(flashcardOrder[flashcardIndex]);
  saveFlashcardKnown();
  goToFlashcard(flashcardIndex + 1);
});

renderFlashcard();

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
const CATEGORY_MAP = { basic: HIRAGANA_BASIC, dakuten: HIRAGANA_DAKUTEN, yoon: HIRAGANA_YOON };
let selectedCategories = ["basic"];
let selectedDirection = "char2romaji";

// Adaptive weighting: characters answered wrong more often show up more.
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
function updateKanaStat(char, correct) {
  const stats = loadKanaStats();
  if (!stats[char]) stats[char] = { correct: 0, wrong: 0 };
  stats[char][correct ? "correct" : "wrong"]++;
  saveKanaStats(stats);
}
function kanaWeight(char, stats) {
  const s = stats[char] || { correct: 0, wrong: 0 };
  return Math.max(0.3, 1 + s.wrong * 2 - s.correct * 0.3);
}
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
    <button id="resetStats" class="reset-stats-btn">Vynulovat statistiky</button>
  `;
  document.getElementById("resetStats").addEventListener("click", () => {
    localStorage.removeItem(KANA_STATS_KEY);
    renderWeakSpots();
  });
}
renderWeakSpots();

document.querySelectorAll("#categoryChips .chip").forEach(chip => {
  chip.addEventListener("click", () => {
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
const QUESTIONS_PER_ROUND = 10;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
  } else {
    quizPrompt.textContent = selectedDirection === "char2romaji" ? currentQuestion[0] : currentQuestion[1];
  }
  quizOptions.innerHTML = "";
  const options = pickOptions(currentQuestion, quizPool);
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = answerField(opt);
    btn.addEventListener("click", () => handleAnswer(btn, opt));
    quizOptions.appendChild(btn);
  });
  quizCountEl.textContent = `${QUESTIONS_PER_ROUND - quizQueue.length} / ${QUESTIONS_PER_ROUND}`;
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
    `Skóre ${score} / ${QUESTIONS_PER_ROUND} — ${score === QUESTIONS_PER_ROUND ? "perfektní! 🎉" : score >= QUESTIONS_PER_ROUND * 0.7 ? "hezká práce!" : "trénuj dál!"}`;
}

function startQuiz() {
  quizPool = buildPool();
  const count = Math.min(QUESTIONS_PER_ROUND, quizPool.length);
  quizQueue = shuffle(weightedSample(quizPool, count)).reverse();
  score = 0;
  quizScoreEl.textContent = "Skóre: 0";
  quizSetup.hidden = true;
  quizResult.hidden = true;
  quizPlay.hidden = false;
  nextQuestion();
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
