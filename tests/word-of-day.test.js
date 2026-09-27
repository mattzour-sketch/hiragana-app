"use strict";
// Unit testy pro "Slovo dne" a SRS jen se zavedenými slovy.
// Spustit z adresáře hiragana-app:  node --test
// Bez závislostí – vestavěný node:test + node:assert (Node >= 18).
//
// Stejně jako flashcard-examples.test.js načítá REÁLNÁ data z ../data.js a
// REÁLNÉ pure funkce z ../app.js (top-level `function … }` od kraje řádku).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const dataSrc = fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8");
const appSrc = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function loadData() {
  const box = {};
  eval(dataSrc + "\n; box.FLASHCARDS = FLASHCARDS;");
  return box;
}

const FN_NAMES = [
  "segmentsToPlainText",
  "localDateKey",
  "dueIndicesFrom",
  "introduceInSrs",
  "firstUnintroducedIndex",
  "parseWordOfDayState",
  "resolveWordOfDay",
  "sentencesForCard",
  "resolveReviewNotice",
];

function loadAppFns() {
  const grab = (re, what) => {
    const m = appSrc.match(re);
    if (!m) throw new Error("Nenalezeno v app.js: " + what);
    return m[0];
  };
  const fnSrc = (name) => grab(new RegExp("^function " + name + "\\([\\s\\S]*?^}", "m"), name);
  const intervals = grab(/^const SRS_INTERVALS_MS = \[[\s\S]*?^\];/m, "SRS_INTERVALS_MS");
  const box = {};
  eval(intervals + "\n" + FN_NAMES.map(fnSrc).join("\n") +
       "\n; box.SRS_INTERVALS_MS = SRS_INTERVALS_MS;" +
       FN_NAMES.map((n) => ` box.${n} = ${n};`).join(""));
  return box;
}

const { FLASHCARDS } = loadData();
const {
  SRS_INTERVALS_MS, localDateKey, dueIndicesFrom, introduceInSrs, firstUnintroducedIndex,
  parseWordOfDayState, resolveWordOfDay, sentencesForCard, resolveReviewNotice,
} = loadAppFns();

const keyOf = (i) => FLASHCARDS[i].segments.map((s) => s.t).join("");
const NOW = Date.UTC(2026, 8, 27, 12, 0);

test("klíče karet (plain text) jsou unikátní – sdílí je SRS i Slovo dne", () => {
  const keys = FLASHCARDS.map((_, i) => keyOf(i));
  assert.strictEqual(new Set(keys).size, keys.length);
});

test("localDateKey: místní datum, hranice o místní půlnoci", () => {
  assert.strictEqual(localDateKey(new Date(2026, 8, 27, 23, 30)), "2026-09-27");
  assert.strictEqual(localDateKey(new Date(2026, 8, 28, 0, 30)), "2026-09-28");
  assert.strictEqual(localDateKey(new Date(2026, 0, 5, 0, 0)), "2026-01-05");
});

test("firstUnintroducedIndex: první karta bez SRS záznamu, jinak -1", () => {
  assert.strictEqual(firstUnintroducedIndex(FLASHCARDS, {}), 0);
  assert.strictEqual(firstUnintroducedIndex(FLASHCARDS, { [keyOf(0)]: { box: 0, due: 0 } }), 1);
  const all = {};
  FLASHCARDS.forEach((_, i) => { all[keyOf(i)] = { box: 1, due: 0 }; });
  assert.strictEqual(firstUnintroducedIndex(FLASHCARDS, all), -1);
});

test("resolveWordOfDay: prázdný stav → první nezavedené slovo", () => {
  assert.deepStrictEqual(resolveWordOfDay(null, "2026-09-27", FLASHCARDS, {}),
    { date: "2026-09-27", key: keyOf(0) });
});

test("resolveWordOfDay: stejný den → stejné slovo, i když ho mezitím zavedu", () => {
  const state = { date: "2026-09-27", key: keyOf(0) };
  const srs = { [keyOf(0)]: { box: 0, due: NOW } };
  assert.deepStrictEqual(resolveWordOfDay(state, "2026-09-27", FLASHCARDS, srs), state);
});

test("resolveWordOfDay: stejný den a otevřené 'další slovo' → zůstává", () => {
  const state = { date: "2026-09-27", key: keyOf(5) };
  assert.deepStrictEqual(resolveWordOfDay(state, "2026-09-27", FLASHCARDS, {}), state);
});

test("resolveWordOfDay: nový den a včerejší slovo nezavedené → totéž slovo", () => {
  const state = { date: "2026-09-26", key: keyOf(0) };
  assert.deepStrictEqual(resolveWordOfDay(state, "2026-09-27", FLASHCARDS, {}),
    { date: "2026-09-27", key: keyOf(0) });
});

test("resolveWordOfDay: nový den a včerejší slovo zavedené → další v pořadí", () => {
  const state = { date: "2026-09-26", key: keyOf(0) };
  const srs = { [keyOf(0)]: { box: 1, due: NOW } };
  assert.deepStrictEqual(resolveWordOfDay(state, "2026-09-27", FLASHCARDS, srs),
    { date: "2026-09-27", key: keyOf(1) });
});

test("resolveWordOfDay: N dní pauza → jedno slovo (první nezavedené), nic se nehromadí", () => {
  const state = { date: "2026-09-01", key: keyOf(2) };
  const srs = { [keyOf(0)]: { box: 2, due: NOW }, [keyOf(1)]: { box: 1, due: NOW } };
  assert.deepStrictEqual(resolveWordOfDay(state, "2026-09-27", FLASHCARDS, srs),
    { date: "2026-09-27", key: keyOf(2) });
});

test("resolveWordOfDay: uložené datum v budoucnu (posun hodin zpět) → první nezavedené", () => {
  const state = { date: "2026-09-30", key: keyOf(9) };
  assert.deepStrictEqual(resolveWordOfDay(state, "2026-09-27", FLASHCARDS, {}),
    { date: "2026-09-27", key: keyOf(0) });
});

test("resolveWordOfDay: vše zavedeno a žádný dnešní stav → null", () => {
  const all = {};
  FLASHCARDS.forEach((_, i) => { all[keyOf(i)] = { box: 1, due: NOW }; });
  assert.strictEqual(resolveWordOfDay(null, "2026-09-27", FLASHCARDS, all), null);
  assert.strictEqual(resolveWordOfDay({ date: "2026-09-26", key: keyOf(0) }, "2026-09-27", FLASHCARDS, all), null);
});

test("parseWordOfDayState: validní stav projde", () => {
  const raw = JSON.stringify({ date: "2026-09-27", key: keyOf(3) });
  assert.deepStrictEqual(parseWordOfDayState(raw, FLASHCARDS), { date: "2026-09-27", key: keyOf(3) });
});

test("parseWordOfDayState: nečitelný nebo neplatný stav → null", () => {
  const bad = [
    null,
    "",
    "{nejde",
    "null",
    "42",
    '"text"',
    JSON.stringify({ key: keyOf(0) }),
    JSON.stringify({ date: "2026-09-27" }),
    JSON.stringify({ date: "27.9.2026", key: keyOf(0) }),
    JSON.stringify({ date: "2026-09-27", key: 5 }),
    JSON.stringify({ date: "2026-09-27", key: "neexistuje" }),
  ];
  bad.forEach((raw) => assert.strictEqual(parseWordOfDayState(raw, FLASHCARDS), null, String(raw)));
});

test("introduceInSrs: nový záznam box 0, první opakování za SRS_INTERVALS_MS[0] (10 min)", () => {
  const srs = {};
  assert.strictEqual(introduceInSrs(srs, "犬", NOW), true);
  assert.deepStrictEqual(srs["犬"], { box: 0, due: NOW + 10 * 60 * 1000 });
  assert.strictEqual(SRS_INTERVALS_MS[0], 10 * 60 * 1000);
});

test("introduceInSrs: existující záznam nepřepíše (dvojklik / slovo už v SRS)", () => {
  const srs = { "犬": { box: 3, due: NOW + 999 } };
  assert.strictEqual(introduceInSrs(srs, "犬", NOW), false);
  assert.deepStrictEqual(srs["犬"], { box: 3, due: NOW + 999 });
  const fresh = {};
  introduceInSrs(fresh, "猫", NOW);
  assert.strictEqual(introduceInSrs(fresh, "猫", NOW + 5000), false);
  assert.deepStrictEqual(fresh["猫"], { box: 0, due: NOW + SRS_INTERVALS_MS[0] });
});

test("dueIndicesFrom: karta bez záznamu NENÍ k opakování", () => {
  assert.deepStrictEqual(dueIndicesFrom(FLASHCARDS, {}, NOW), []);
});

test("dueIndicesFrom: jen zavedená slova s termínem ≤ teď, seřazená podle termínu", () => {
  const srs = {
    [keyOf(4)]: { box: 1, due: NOW - 10 },
    [keyOf(2)]: { box: 0, due: NOW - 500 },
    [keyOf(7)]: { box: 2, due: NOW },        // přesně teď = due
    [keyOf(1)]: { box: 0, due: NOW + 1 },    // budoucnost = není due
  };
  assert.deepStrictEqual(dueIndicesFrom(FLASHCARDS, srs, NOW), [2, 4, 7]);
});

test("sentencesForCard: bez examples → 1 věta, s examples → 3", () => {
  const ex = { segments: [{ t: "a", hl: true }], romaji: "a", english: "a" };
  assert.strictEqual(sentencesForCard({ example: ex }).length, 1);
  assert.deepStrictEqual(sentencesForCard({ example: ex, examples: [ex, ex] }), [ex, ex, ex]);
  assert.deepStrictEqual(sentencesForCard({}), []);
});

test("sentencesForCard na reálných datech: první karta má 3 věty", () => {
  assert.strictEqual(sentencesForCard(FLASHCARDS[0]).length, 3);
});

test("resolveReviewNotice: jen uživatel s daty v SRS (Kartičky) → show, jinak done; rozhodnutí se drží", () => {
  assert.strictEqual(resolveReviewNotice(null, { "犬": { box: 0, due: 0 } }), "show");
  assert.strictEqual(resolveReviewNotice(null, {}), "done");
  // jen kvízové/psací statistiky (kanaStats) hlášku nespustí – funkce je ani nebere
  assert.strictEqual(resolveReviewNotice.length, 2);
  // jednou rozhodnuto → nemění se, ani když data přibudou / ubudou
  assert.strictEqual(resolveReviewNotice("done", { "犬": { box: 0, due: 0 } }), "done");
  assert.strictEqual(resolveReviewNotice("show", {}), "show");
  // neznámá hodnota = jako nerozhodnuto
  assert.strictEqual(resolveReviewNotice("xyz", {}), "done");
  assert.strictEqual(resolveReviewNotice("xyz", { "犬": { box: 1, due: 0 } }), "show");
});
