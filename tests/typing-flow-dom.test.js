"use strict";
// Psaní: testy nad SKUTEČNÝMI funkcemi z app.js (checkTypingAnswer,
// retryTypingQuestion, nextTypingQuestion, renderTypingQuestion, setTypingPhase…)
// s falešnými DOM prvky. Doplňuje quiz-typing-flow.test.js, který řízení jen
// napodobuje – tady se testuje, že app.js řízení opravdu takhle dělá.
// Spustit z adresáře hiragana-app:  node --test
//
// localStorage je mapa v paměti, časovače jsou ruční – na reálná data se nesahá.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const appSrc = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const grab = (re, what) => {
  const m = appSrc.match(re);
  if (!m) throw new Error("Nenalezeno v app.js: " + what);
  return m[0];
};
const fnSrc = (name) => grab(new RegExp("^function " + name + "\\([\\s\\S]*?^}", "m"), name);

function el(id) {
  return {
    id, hidden: false, disabled: false, value: "", textContent: "", className: "", innerHTML: "",
    focus() { doc.activeElement = this; },
  };
}
const doc = { activeElement: null };

// items = fronta otázek, které vrátí pickTypingItem (stub).
function makeTyping(items, initialStore = {}) {
  const store = new Map(Object.entries(initialStore));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const timers = [];
  const setTimeout = (fn) => { timers.push(fn); return timers.length; };
  const clearTimeout = (h) => { if (h) timers[h - 1] = null; };
  const env = { store, timers, activity: 0, spoken: [] };
  const recordActivity = () => { env.activity++; };
  const speak = (t) => env.spoken.push(t);
  const queue = [...items];
  const pickTypingItem = () => queue.shift() || null;

  const typingPromptEl = el("typingPrompt");
  const typingSubEl = el("typingSub");
  const typingInputEl = el("typingInput");
  const typingFeedbackEl = el("typingFeedback");
  const typingScoreEl = el("typingScore");
  const typingStreakEl = el("typingStreak");
  const typingCheckBtn = el("typingCheck");
  const typingSkipBtn = el("typingSkip");
  const typingRetryBtn = el("typingRetry");
  const typingNextBtn = el("typingNext");

  let typingScore = 0, typingStreak = 0, typingItem = null;
  let typingPhase = "answer", typingMissed = false, typingRecorded = false, typingAdvanceTimer = null;

  const names = [
    "loadKanaStats", "saveKanaStats", "updateKanaStat", "loadSrs", "saveSrs", "scheduleSrs",
    "rescheduleIfIntroduced", "normalizeRomaji", "typingRecordFor", "recordTypingAnswer",
    "applyTypingRecord", "setTypingPhase", "settleTypingMiss", "renderTypingQuestion",
    "checkTypingAnswer", "retryTypingQuestion", "nextTypingQuestion", "startTypingRound",
  ];
  eval(
    grab(/^const KANA_STATS_KEY = .*$/m, "KANA_STATS_KEY") + "\n" +
    grab(/^const SRS_KEY = .*$/m, "SRS_KEY") + "\n" +
    grab(/^const SRS_INTERVALS_MS = \[[\s\S]*?^\];/m, "SRS_INTERVALS_MS") + "\n" +
    grab(/^const SRS_MAX_BOX = .*$/m, "SRS_MAX_BOX") + "\n" +
    names.map(fnSrc).join("\n") +
    "\n; env.fns = { renderTypingQuestion, checkTypingAnswer, retryTypingQuestion, nextTypingQuestion, startTypingRound, loadKanaStats, loadSrs };"
  );
  env.ui = { typingInputEl, typingFeedbackEl, typingCheckBtn, typingSkipBtn, typingRetryBtn, typingNextBtn, typingScoreEl };
  env.state = () => ({ typingPhase, typingMissed, typingRecorded, typingScore, typingStreak, key: typingItem && typingItem.key });
  env.type = (text) => { typingInputEl.value = text; env.fns.checkTypingAnswer(); };
  env.runTimers = () => { const t = timers.splice(0); t.forEach((fn) => fn && fn()); };
  env.fns.renderTypingQuestion();
  return env;
}

const DOG = { key: "犬", promptHtml: "犬", sub: "dog", answer: "inu", isVocab: true };
const CAT = { key: "猫", promptHtml: "猫", sub: "cat", answer: "neko", isVocab: true };
const KA = { key: "か", promptHtml: "か", sub: "", answer: "ka", isVocab: false };
const introducedDog = () => ({ "hiragana-srs": JSON.stringify({ "犬": { box: 2, due: 0 } }) });

test("Psaní (app.js): chyba → nic se nezapíše hned, ukáže Zkusit znovu/Dál, Přeskočit skryté", () => {
  const env = makeTyping([DOG, CAT], introducedDog());
  env.type("wanwan");
  assert.strictEqual(env.state().typingPhase, "wrong");
  assert.deepStrictEqual(env.fns.loadKanaStats(), {});
  assert.deepStrictEqual(env.fns.loadSrs()["犬"], { box: 2, due: 0 });
  const ui = env.ui;
  assert.deepStrictEqual(
    [ui.typingCheckBtn.hidden, ui.typingSkipBtn.hidden, ui.typingRetryBtn.hidden, ui.typingNextBtn.hidden, ui.typingInputEl.disabled],
    [true, true, false, false, true]
  );
  assert.match(ui.typingFeedbackEl.textContent, /inu/);
});

test("Psaní (app.js): chyba → Dál zapíše jednu chybu a zavedené slovo vrátí do box 0", () => {
  const env = makeTyping([DOG, CAT], introducedDog());
  env.type("wanwan");
  env.fns.nextTypingQuestion();
  env.fns.nextTypingQuestion(); // druhý klik / Enter navíc: už jiná otázka ve fázi answer
  assert.deepStrictEqual(env.fns.loadKanaStats(), { "犬": { correct: 0, wrong: 1 } });
  assert.strictEqual(env.fns.loadSrs()["犬"].box, 0);
  assert.strictEqual(env.state().key, "猫");
  assert.strictEqual(env.activity, 1);
});

test("Psaní (app.js): víc chyb přes Zkusit znovu, pak Dál = jedna chyba", () => {
  const env = makeTyping([DOG, CAT], introducedDog());
  env.type("a"); env.fns.retryTypingQuestion();
  env.type("b"); env.fns.retryTypingQuestion();
  env.type("c"); env.fns.nextTypingQuestion();
  assert.deepStrictEqual(env.fns.loadKanaStats()["犬"], { correct: 0, wrong: 1 });
});

test("Psaní (app.js): Zkusit znovu = stejná otázka, prázdné pole, bez správné odpovědi", () => {
  const env = makeTyping([DOG, CAT], introducedDog());
  env.type("wanwan");
  env.fns.retryTypingQuestion();
  assert.strictEqual(env.state().key, "犬");
  assert.strictEqual(env.state().typingPhase, "answer");
  assert.strictEqual(env.ui.typingInputEl.value, "");
  assert.strictEqual(env.ui.typingInputEl.disabled, false);
  assert.strictEqual(env.ui.typingFeedbackEl.textContent, "");
});

test("Psaní (app.js): oprava po chybě nemění SRS, skóre ani sérii", () => {
  const env = makeTyping([DOG, CAT], introducedDog());
  env.type("wanwan");
  env.fns.retryTypingQuestion();
  env.type("inu");
  assert.deepStrictEqual(env.fns.loadSrs()["犬"], { box: 2, due: 0 });
  assert.deepStrictEqual(env.fns.loadKanaStats()["犬"], { correct: 0, wrong: 1 });
  assert.strictEqual(env.state().typingScore, 0);
  assert.strictEqual(env.state().typingStreak, 0);
  env.runTimers();
  assert.strictEqual(env.state().key, "猫", "po opravě se po 800 ms jde dál");
});

test("Psaní (app.js): správně napoprvé = statistika + SRS box+1, skóre +1, auto-posun", () => {
  const env = makeTyping([DOG, CAT], introducedDog());
  env.type("inu");
  env.type("inu"); // Enter navíc ve fázi done nesmí zapsat podruhé
  assert.deepStrictEqual(env.fns.loadKanaStats()["犬"], { correct: 1, wrong: 0 });
  assert.strictEqual(env.fns.loadSrs()["犬"].box, 3);
  assert.strictEqual(env.state().typingScore, 1);
  assert.strictEqual(env.state().typingStreak, 1);
  env.runTimers();
  assert.strictEqual(env.state().key, "猫");
});

test("Psaní (app.js): chyba u nezavedeného slova a u znaku do SRS nikdy nejde", () => {
  const env = makeTyping([CAT, KA, DOG]);
  env.type("x"); env.fns.nextTypingQuestion();
  env.type("x"); env.fns.nextTypingQuestion();
  assert.strictEqual(env.store.has("hiragana-srs"), false);
  assert.deepStrictEqual(env.fns.loadKanaStats(), { "猫": { correct: 0, wrong: 1 }, "か": { correct: 0, wrong: 1 } });
});

// Nález z review ad44564: chyba se zahodila, když uživatel otázku opustil jinak
// než přes "Dál". Pravidlo: chyba se zapíše vždy, jednou na otázku – oprava přes
// "Zkusit znovu" jen do statistik (SRS beze změny), jakýkoli jiný odchod
// (Přeskočit, jiná kategorie, návrat na záložku) jako "Dál" i do SRS.
test("Psaní (app.js): oprava po chybě + auto-posun = jedna chyba ve statistikách, SRS beze změny", () => {
  const env = makeTyping([DOG, CAT], introducedDog());
  env.type("wanwan");
  env.fns.retryTypingQuestion();
  env.type("inu");
  env.runTimers();
  assert.strictEqual(env.state().key, "猫");
  assert.deepStrictEqual(env.fns.loadKanaStats()["犬"], { correct: 0, wrong: 1 });
  assert.deepStrictEqual(env.fns.loadSrs()["犬"], { box: 2, due: 0 });
  assert.strictEqual(env.activity, 1);
});

test("Psaní (app.js): oprava a hned Přeskočit (před auto-posunem) nezapíše podruhé", () => {
  const env = makeTyping([DOG, CAT], introducedDog());
  env.type("wanwan");
  env.fns.retryTypingQuestion();
  env.type("inu");
  env.fns.renderTypingQuestion(); // Přeskočit ve fázi done
  env.runTimers();
  assert.deepStrictEqual(env.fns.loadKanaStats()["犬"], { correct: 0, wrong: 1 });
  assert.deepStrictEqual(env.fns.loadSrs()["犬"], { box: 2, due: 0 });
});

test("Psaní (app.js): chyba se zapíše i po Zkusit znovu → Přeskočit", () => {
  const env = makeTyping([DOG, CAT], introducedDog());
  env.type("wanwan");
  env.fns.retryTypingQuestion();
  env.fns.renderTypingQuestion(); // Přeskočit
  assert.deepStrictEqual(env.fns.loadKanaStats()["犬"], { correct: 0, wrong: 1 });
  assert.strictEqual(env.fns.loadSrs()["犬"].box, 0);
  assert.strictEqual(env.state().key, "猫");
});

test("Psaní (app.js): chyba se zapíše i při změně kategorie / návratu na záložku", () => {
  const env = makeTyping([DOG, CAT], introducedDog());
  env.type("wanwan");
  env.fns.startTypingRound();
  assert.deepStrictEqual(env.fns.loadKanaStats()["犬"], { correct: 0, wrong: 1 });
  assert.strictEqual(env.fns.loadSrs()["犬"].box, 0);
  env.fns.startTypingRound(); // další přepnutí už nic nepřidá
  assert.deepStrictEqual(env.fns.loadKanaStats()["犬"], { correct: 0, wrong: 1 });
  assert.strictEqual(env.activity, 1);
});

test("Psaní (app.js): Přeskočit bez chyby nic nezapíše", () => {
  const env = makeTyping([DOG, CAT], introducedDog());
  env.fns.renderTypingQuestion();
  assert.deepStrictEqual(env.fns.loadKanaStats(), {});
  assert.deepStrictEqual(env.fns.loadSrs()["犬"], { box: 2, due: 0 });
});
