"use strict";
// Testy pro chyby v Kvízu ("Procvičit chyby", souhrn chyb) a pro rozhodnutí,
// co se v Psaní zapíše do statistik a SRS (chyba až po "Dál", oprava přes
// "Zkusit znovu" nic nezapíše).
// Spustit z adresáře hiragana-app:  node --test
//
// Funkce se tahají z REÁLNÉHO app.js (top-level `function … }` od kraje řádku),
// localStorage je mapa v paměti – na reálná data se nesahá.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const appSrc = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");

const grab = (re, what) => {
  const m = appSrc.match(re);
  if (!m) throw new Error("Nenalezeno v app.js: " + what);
  return m[0];
};
const fnSrc = (name) => grab(new RegExp("^function " + name + "\\([\\s\\S]*?^}", "m"), name);

function loadPure() {
  const box = {};
  const names = ["isVocabPair", "addQuizMistake", "mistakeSummary", "typingRecordFor"];
  eval(names.map(fnSrc).join("\n") + "\n;" + names.map((n) => ` box.${n} = ${n};`).join(""));
  return box;
}
const { addQuizMistake, mistakeSummary, typingRecordFor } = loadPure();

// Izolované prostředí pro zápis odpovědí z Psaní: vlastní localStorage, pevné SRS.
function makeEnv(initial = {}) {
  const store = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const env = { store, activity: 0 };
  const recordActivity = () => { env.activity++; };
  const box = {};
  eval(
    grab(/^const KANA_STATS_KEY = .*$/m, "KANA_STATS_KEY") + "\n" +
    grab(/^const SRS_KEY = .*$/m, "SRS_KEY") + "\n" +
    grab(/^const SRS_INTERVALS_MS = \[[\s\S]*?^\];/m, "SRS_INTERVALS_MS") + "\n" +
    grab(/^const SRS_MAX_BOX = .*$/m, "SRS_MAX_BOX") + "\n" +
    ["loadKanaStats", "saveKanaStats", "updateKanaStat", "loadSrs", "saveSrs", "scheduleSrs",
     "rescheduleIfIntroduced", "typingRecordFor", "recordTypingAnswer"].map(fnSrc).join("\n") +
    "\n; box.loadKanaStats = loadKanaStats; box.loadSrs = loadSrs;" +
    " box.typingRecordFor = typingRecordFor; box.recordTypingAnswer = recordTypingAnswer;"
  );
  return Object.assign(env, box);
}

// Stejné řízení jako v app.js (checkTypingAnswer / retryTypingQuestion /
// nextTypingQuestion): events = "correct" | "wrong" | "retry" | "next".
function playTyping(env, item, events) {
  let missed = false;
  let recorded = false;
  const apply = (record) => {
    if (record === null) return;
    recorded = true;
    env.recordTypingAnswer(item.key, item.isVocab, record);
  };
  for (const ev of events) {
    if (ev === "retry") continue; // jen smaže pole, nic nezapisuje
    apply(env.typingRecordFor(ev, missed, recorded));
    if (ev === "wrong") missed = true;
  }
}

// --- Kvíz: chyby ---

const KANA = ["あ", "a"];
const KANA_KI = ["き", "ki"];
const WORD = ["犬", "dog", "<ruby>犬<rt>いぬ</rt></ruby>", "inu"];

test("Procvičit chyby: každá chybná otázka jednou, v pořadí chyb", () => {
  const mistakes = [];
  assert.strictEqual(addQuizMistake(mistakes, KANA_KI), true);
  assert.strictEqual(addQuizMistake(mistakes, KANA), true);
  assert.strictEqual(addQuizMistake(mistakes, ["き", "ki"]), false, "duplicita podle klíče");
  assert.deepStrictEqual(mistakes.map((p) => p[0]), ["き", "あ"]);
});

test("Procvičit chyby: kolo obsahuje jen chybně zodpovězené položky", () => {
  const answers = [[KANA, true], [KANA_KI, false], [WORD, true], [["う", "u"], false]];
  const mistakes = [];
  answers.forEach(([pair, ok]) => { if (!ok) addQuizMistake(mistakes, pair); });
  assert.deepStrictEqual(mistakes, [KANA_KI, ["う", "u"]]);
});

test("Souhrn chyb – znaky: otázka → odpověď, čtení u znaku jen tam, kde chybí", () => {
  assert.deepStrictEqual(mistakeSummary(KANA, "char2romaji"), { question: "あ", answer: "a" });
  assert.deepStrictEqual(mistakeSummary(KANA, "romaji2char"), { question: "a", answer: "あ" });
  const audio = mistakeSummary(KANA, "audio2char");
  assert.strictEqual(audio.question, "🔊");
  assert.match(audio.answer, /^あ <span class="mistake-reading">a<\/span>$/);
});

test("Souhrn chyb – slova: slovo s furiganou a romaji, význam", () => {
  const c2r = mistakeSummary(WORD, "char2romaji");
  assert.match(c2r.question, /<ruby>犬<rt>いぬ<\/rt><\/ruby>/);
  assert.match(c2r.question, /mistake-reading">inu</);
  assert.strictEqual(c2r.answer, "dog");

  const r2c = mistakeSummary(WORD, "romaji2char");
  assert.strictEqual(r2c.question, "dog");
  assert.match(r2c.answer, /<ruby>犬<rt>いぬ<\/rt><\/ruby> .*inu/);

  const audio = mistakeSummary(WORD, "audio2char");
  assert.strictEqual(audio.question, "🔊");
  assert.match(audio.answer, /<ruby>犬.*inu/);
});

// --- Psaní: co se zapíše ---

test("typingRecordFor: pravidla zápisu", () => {
  // první pokus
  assert.strictEqual(typingRecordFor("correct", false, false), true);
  assert.strictEqual(typingRecordFor("wrong", false, false), null, "chyba se nezapíše hned");
  // po chybě
  assert.strictEqual(typingRecordFor("wrong", true, false), null);
  assert.strictEqual(typingRecordFor("correct", true, false), null, "oprava po chybě nic nezapíše");
  assert.strictEqual(typingRecordFor("next", true, false), false, "Dál po chybě = chyba");
  // bez chyby "Dál" nic neznamená, a nic se nezapíše dvakrát
  assert.strictEqual(typingRecordFor("next", false, false), null);
  assert.strictEqual(typingRecordFor("next", true, true), null);
  assert.strictEqual(typingRecordFor("correct", false, true), null);
});

const introduced = () => ({ "hiragana-srs": JSON.stringify({ "犬": { box: 2, due: 0 } }) });
const DOG = { key: "犬", isVocab: true };

test("Psaní: chyba → Zkusit znovu → správně: statistiky ani SRS se nezmění", () => {
  const env = makeEnv(introduced());
  playTyping(env, DOG, ["wrong", "retry", "correct"]);
  assert.deepStrictEqual(env.loadKanaStats(), {});
  assert.deepStrictEqual(env.loadSrs()["犬"], { box: 2, due: 0 });
  assert.strictEqual(env.activity, 0);
});

test("Psaní: chyba → Dál: jedna chyba ve statistikách, zavedené slovo do box 0", () => {
  const env = makeEnv(introduced());
  playTyping(env, DOG, ["wrong", "next"]);
  assert.deepStrictEqual(env.loadKanaStats()["犬"], { correct: 0, wrong: 1 });
  assert.strictEqual(env.loadSrs()["犬"].box, 0);
});

test("Psaní: víc chyb přes Zkusit znovu, pak Dál: chyba se zapíše jen jednou", () => {
  const env = makeEnv(introduced());
  playTyping(env, DOG, ["wrong", "retry", "wrong", "retry", "wrong", "next"]);
  assert.deepStrictEqual(env.loadKanaStats()["犬"], { correct: 0, wrong: 1 });
  assert.strictEqual(env.activity, 1);
});

test("Psaní: chyba → Dál u nezavedeného slova: jen statistika, do SRS se nezavede", () => {
  const env = makeEnv();
  playTyping(env, { key: "猫", isVocab: true }, ["wrong", "next"]);
  assert.deepStrictEqual(env.loadKanaStats()["猫"], { correct: 0, wrong: 1 });
  assert.strictEqual(env.store.has("hiragana-srs"), false);
});

test("Psaní: správně napoprvé – beze změny (statistika + SRS box+1)", () => {
  const env = makeEnv(introduced());
  playTyping(env, DOG, ["correct"]);
  assert.deepStrictEqual(env.loadKanaStats()["犬"], { correct: 1, wrong: 0 });
  assert.strictEqual(env.loadSrs()["犬"].box, 3);
});

test("Psaní: znak (ne slovo) do SRS nikdy nejde", () => {
  const env = makeEnv({ "hiragana-srs": JSON.stringify({ "あ": { box: 1, due: 0 } }) });
  playTyping(env, { key: "あ", isVocab: false }, ["wrong", "next"]);
  assert.deepStrictEqual(env.loadSrs()["あ"], { box: 1, due: 0 });
});

// --- Vazba app.js ↔ index.html ---

test("každé getElementById z app.js má prvek v index.html (kromě dynamických)", () => {
  const dynamic = new Set(["practiceWeak", "resetStats", "playPromptBtn"]);
  const ids = [...appSrc.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  const missing = [...new Set(ids)].filter((id) => !dynamic.has(id) && !indexSrc.includes(`id="${id}"`));
  assert.deepStrictEqual(missing, []);
});
