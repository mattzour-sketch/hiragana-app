"use strict";
// Aktivita podle místního kalendářního dne (ne UTC), sjednocené "zvládnuto"
// v Kartičkách a Pokroku a názvosloví "v opakování" v UI.
// Spustit z adresáře hiragana-app:  node --test
//
// Časové pásmo je pevně Europe/Prague (node --test pouští každý soubor ve vlastním
// procesu, takže to ostatní testy neovlivní). Funkce se tahají z REÁLNÉHO app.js.
process.env.TZ = "Europe/Prague";

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

function loadFns(names, prelude = "") {
  const box = {};
  eval(prelude + "\n" + names.map(fnSrc).join("\n") + "\n;" + names.map((n) => ` box.${n} = ${n};`).join(""));
  return box;
}
const { localDateKey, addActivity, lastLocalDays } = loadFns(["localDateKey", "addActivity", "lastLocalDays"]);

test("prostředí: TZ Europe/Prague je aktivní (letní čas UTC+2)", () => {
  assert.strictEqual(new Date(2026, 6, 15, 12, 0).getTimezoneOffset(), -120);
});

test("půlnoc: 23:30 a 00:30 místního času jsou dva různé dny (UTC by je spojilo)", () => {
  const before = new Date(2026, 6, 15, 23, 30);
  const after = new Date(2026, 6, 16, 0, 30);
  assert.strictEqual(localDateKey(before), "2026-07-15");
  assert.strictEqual(localDateKey(after), "2026-07-16");
  // Původní todayKey() (toISOString) by obě odpovědi zapsal ke 15. 7.
  assert.strictEqual(after.toISOString().slice(0, 10), "2026-07-15");
});

test("addActivity: odpovědi ve 23:30 a 00:30 se započítají každá ke svému dni", () => {
  const activity = {};
  addActivity(activity, new Date(2026, 6, 15, 23, 30));
  addActivity(activity, new Date(2026, 6, 16, 0, 30));
  addActivity(activity, new Date(2026, 6, 16, 0, 45));
  assert.deepStrictEqual(activity, { "2026-07-15": 1, "2026-07-16": 2 });
});

test("addActivity: drží posledních 30 dní, starší UTC i místní klíče maže", () => {
  const activity = { "2026-06-15": 4, "2026-06-16": 2, "2026-07-01": 1 };
  addActivity(activity, new Date(2026, 6, 16, 0, 30));
  assert.deepStrictEqual(activity, { "2026-06-16": 2, "2026-07-01": 1, "2026-07-16": 1 });
});

test("lastLocalDays: 7 dní končí dneškem v místním čase, popisky dnů sedí", () => {
  const days = lastLocalDays(new Date(2026, 6, 16, 0, 30), 7);
  assert.deepStrictEqual(days.map((d) => d.key), [
    "2026-07-10", "2026-07-11", "2026-07-12", "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16",
  ]);
  // 16. 7. 2026 je čtvrtek (4), 10. 7. pátek (5)
  assert.strictEqual(days[6].weekday, 4);
  assert.strictEqual(days[0].weekday, 5);
  const late = lastLocalDays(new Date(2026, 6, 15, 23, 30), 7);
  assert.strictEqual(late[6].key, "2026-07-15");
});

test("lastLocalDays: přechod na letní/zimní čas nezdvojí ani nevynechá den", () => {
  for (const now of [new Date(2026, 2, 30, 0, 30), new Date(2026, 9, 26, 0, 30), new Date(2026, 9, 25, 23, 30)]) {
    const keys = lastLocalDays(now, 7).map((d) => d.key);
    assert.strictEqual(new Set(keys).size, 7, keys.join(","));
    assert.strictEqual(keys[6], localDateKey(now));
    for (let i = 1; i < 7; i++) {
      const a = new Date(keys[i - 1] + "T12:00:00");
      const b = new Date(keys[i] + "T12:00:00");
      assert.strictEqual(Math.round((b - a) / 86400000), 1, keys.join(","));
    }
  }
});

test("aktivita nepoužívá UTC den (todayKey / toISOString)", () => {
  assert.doesNotMatch(appSrc, /todayKey/);
  // Jen kód aktivity: toISOString smí appka použít jinde (např. export).
  for (const name of ["addActivity", "recordActivity", "lastLocalDays", "renderProgress"]) {
    assert.doesNotMatch(fnSrc(name), /toISOString/, name);
  }
});

test("Kartičky 'Dlouhodobě' počítá jen opakování s intervalem 7+ dní, ne statistiky", () => {
  const stats = { "犬": { correct: 3, wrong: 0 }, "猫": { correct: 1, wrong: 0 } };
  const srs = { "猫": { box: 3, due: 0 }, "鳥": { box: 1, due: 0 }, "魚": { box: 5, due: 0 } };
  const FLASHCARDS = ["犬", "猫", "鳥", "魚"].map((t) => ({ segments: [{ t }] }));
  const box = {};
  eval(
    grab(/^const SRS_MASTERED_BOX = .*$/m, "SRS_MASTERED_BOX") + "\n" +
    "const loadKanaStats = () => stats; const loadSrs = () => srs;\n" +
    ["segmentsToPlainText", "longTermCardCount"].map(fnSrc).join("\n") +
    "\n; box.longTermCardCount = longTermCardCount;"
  );
  // 猫 a 魚 (box ≥ 3); 犬 je zvládnutý jen ze statistik Kvízu a nepočítá se.
  assert.strictEqual(box.longTermCardCount(), 2);
});

test("UI texty: stav slova se SRS záznamem je 'v opakování' (ne zavedeno / v učení)", () => {
  const re = /zaveden|v učení/i;
  assert.doesNotMatch(indexSrc, re);
  // jen řetězce v app.js, komentáře jsou anglicky
  const strings = appSrc.match(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g) || [];
  assert.deepStrictEqual(strings.filter((s) => re.test(s)), []);
  assert.match(appSrc, /srs-stat-label">v opakování</);
});
