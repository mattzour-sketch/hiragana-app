"use strict";
// Výběr řad znaků (Kvíz i Psaní): sestavení poolu z písma + řad, výchozí stav,
// načtení neplatného uloženého výběru, poslední řada nejde vypnout a malý pool
// pořád dá 4 možnosti v Kvízu.
// Spustit z adresáře hiragana-app:  node --test
//
// Testy načítají REÁLNÁ data z ../data.js a REÁLNÉ funkce z ../app.js.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const dataSrc = fs.readFileSync(path.join(root, "data.js"), "utf8");
const appSrc = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");

const grab = (re, what) => {
  const m = appSrc.match(re);
  if (!m) throw new Error("Nenalezeno v app.js: " + what);
  return m[0];
};
const fnSrc = (name) => grab(new RegExp("^function " + name + "\\([\\s\\S]*?^}", "m"), name);
const constSrc = (name) => grab(new RegExp("^const " + name + " = [\\s\\S]*?;$", "m"), name);

function load(direction = "char2romaji") {
  const box = {};
  const selectedDirection = direction; // čte ho answerField
  eval(
    dataSrc + "\n" +
    ["KANA_ROWS", "KANA_ROW_IDS", "DEFAULT_KANA_ROWS", "KANA_SETS"].map(constSrc).join("\n") + "\n" +
    ["shuffle", "isVocabPair", "answerField", "kanaPoolFor", "parseKanaRows", "toggleKanaRow",
     "kanaRowLabel", "pickOptions"].map(fnSrc).join("\n") +
    "\n; Object.assign(box, { HIRAGANA_BASIC, HIRAGANA_DAKUTEN, HIRAGANA_YOON, KATAKANA_ALL, KANA_SETS," +
    " DEFAULT_KANA_ROWS, KANA_ROW_IDS, kanaPoolFor, parseKanaRows, toggleKanaRow, kanaRowLabel, pickOptions });"
  );
  return box;
}
const K = load();
const keys = (pool) => pool.map((p) => p[0]).join("");

test("řady: 10 základních řad pokryje přesně HIRAGANA_BASIC (46 znaků, わ = わをん)", () => {
  const pool = K.kanaPoolFor(K.KANA_SETS.hiragana, K.DEFAULT_KANA_ROWS);
  assert.deepStrictEqual(pool, K.HIRAGANA_BASIC);
  assert.strictEqual(keys(K.kanaPoolFor(K.KANA_SETS.hiragana, ["wa"])), "わをん");
  assert.strictEqual(keys(K.kanaPoolFor(K.KANA_SETS.hiragana, ["ya"])), "やゆよ");
  assert.strictEqual(keys(K.kanaPoolFor(K.KANA_SETS.hiragana, ["a"])), "あいうえお");
});

test("řady: všechny řady + Dakuten + Yōon = 104 znaků písma (dosavadní celý pool)", () => {
  const all = K.KANA_ROW_IDS;
  assert.deepStrictEqual(K.kanaPoolFor(K.KANA_SETS.hiragana, all),
    K.HIRAGANA_BASIC.concat(K.HIRAGANA_DAKUTEN, K.HIRAGANA_YOON));
  assert.deepStrictEqual(K.kanaPoolFor(K.KANA_SETS.katakana, all), K.KATAKANA_ALL);
  assert.strictEqual(K.kanaPoolFor(K.KANA_SETS.katakana, all).length, 104);
});

test("řady: Dakuten / Yōon = celá sada zvoleného písma, řady se drží písma", () => {
  assert.strictEqual(K.kanaPoolFor(K.KANA_SETS.hiragana, ["dakuten"]).length, 25);
  assert.strictEqual(K.kanaPoolFor(K.KANA_SETS.katakana, ["yoon"]).length, 33);
  assert.strictEqual(keys(K.kanaPoolFor(K.KANA_SETS.katakana, ["ka", "yoon"])).slice(0, 5), "カキクケコ");
  assert.ok(K.kanaPoolFor(K.KANA_SETS.katakana, ["ka", "yoon"]).some((p) => p[0] === "キャ"));
});

test("výchozí stav: všechny základní řady, Dakuten a Yōon vypnuté", () => {
  assert.deepStrictEqual(K.DEFAULT_KANA_ROWS, ["a", "ka", "sa", "ta", "na", "ha", "ma", "ya", "ra", "wa"]);
  assert.deepStrictEqual(K.parseKanaRows(null), K.DEFAULT_KANA_ROWS);
});

test("uložený výběr: platný se načte v kanonickém pořadí, neplatný → výchozí", () => {
  assert.deepStrictEqual(K.parseKanaRows(JSON.stringify(["yoon", "ka", "a", "ka"])), ["a", "ka", "yoon"]);
  assert.deepStrictEqual(K.parseKanaRows(JSON.stringify(["ka", "xx", 5])), ["ka"]);
  for (const bad of ["{rozbité", "\"ka\"", "{}", "[]", "[\"xx\"]", "null", "42", ""]) {
    assert.deepStrictEqual(K.parseKanaRows(bad), K.DEFAULT_KANA_ROWS, bad);
  }
  // výchozí hodnota je kopie – úprava výsledku nesmí změnit konstantu
  K.parseKanaRows(null).push("yoon");
  assert.ok(!K.DEFAULT_KANA_ROWS.includes("yoon"));
});

test("přepínání řad: zapnutí drží kanonické pořadí, poslední řada nejde vypnout", () => {
  assert.deepStrictEqual(K.toggleKanaRow(["ka"], "a"), ["a", "ka"]);
  assert.deepStrictEqual(K.toggleKanaRow(["a", "ka"], "a"), ["ka"]);
  const last = ["ya"];
  assert.strictEqual(K.toggleKanaRow(last, "ya"), last, "poslední řada zůstane (stejné pole)");
  const rows = ["a"];
  assert.strictEqual(K.toggleKanaRow(rows, "nesmysl"), rows);
});

test("popisky čipů: kana podle písma, Dakuten/Yōon textem", () => {
  const h = K.DEFAULT_KANA_ROWS.map((id) => K.kanaRowLabel(id, K.KANA_SETS.hiragana)).join(" ");
  const k = K.DEFAULT_KANA_ROWS.map((id) => K.kanaRowLabel(id, K.KANA_SETS.katakana)).join(" ");
  assert.strictEqual(h, "あ か さ た な は ま や ら わ");
  assert.strictEqual(k, "ア カ サ タ ナ ハ マ ヤ ラ ワ");
  assert.strictEqual(K.kanaRowLabel("dakuten", K.KANA_SETS.hiragana), "Dakuten");
  assert.strictEqual(K.kanaRowLabel("yoon", K.KANA_SETS.katakana), "Yōon");
});

test("malý pool (jen řada や): vždy 4 různé možnosti, doplněné ze stejného písma", () => {
  for (const dir of ["char2romaji", "romaji2char", "audio2char"]) {
    const L = load(dir);
    const pool = L.kanaPoolFor(L.KANA_SETS.hiragana, ["ya"]);
    const fallback = L.HIRAGANA_BASIC.concat(L.HIRAGANA_DAKUTEN, L.HIRAGANA_YOON);
    for (let i = 0; i < 50; i++) {
      const correct = pool[i % 3];
      const opts = L.pickOptions(correct, pool, fallback);
      assert.strictEqual(opts.length, 4, dir);
      assert.ok(opts.includes(correct));
      const field = dir === "char2romaji" ? 1 : 0;
      assert.strictEqual(new Set(opts.map((o) => o[field])).size, 4, `${dir}: odpovědi se nesmí opakovat`);
      assert.ok(opts.every((o) => fallback.includes(o)), "jen hiragana");
      // obě zbývající znaky z řady jsou vždy mezi možnostmi
      pool.forEach((p) => assert.ok(opts.includes(p)));
    }
  }
});

test("Hiragana + Katakana jen s řadou や: duplicitní romaji se doplní, 4 možnosti", () => {
  const pool = K.kanaPoolFor(K.KANA_SETS.hiragana, ["ya"]).concat(K.kanaPoolFor(K.KANA_SETS.katakana, ["ya"]));
  const correct = pool[3]; // ヤ
  for (let i = 0; i < 50; i++) {
    const opts = K.pickOptions(correct, pool, K.KATAKANA_ALL);
    assert.strictEqual(new Set(opts.map((o) => o[1])).size, 4);
  }
});

test("velký pool: doplnění se nepoužije, možnosti jen z poolu", () => {
  const pool = K.kanaPoolFor(K.KANA_SETS.hiragana, ["a", "ka"]);
  for (let i = 0; i < 30; i++) {
    const opts = K.pickOptions(pool[0], pool, K.KATAKANA_ALL);
    assert.strictEqual(opts.length, 4);
    assert.ok(opts.every((o) => pool.includes(o)));
  }
});

test("index.html: kategorie Kvízu Hiragana / Katakana / Slovíčka, řádek Řady v Kvízu i Psaní", () => {
  const cats = [...indexSrc.match(/id="categoryChips">([\s\S]*?)<\/div>/)[1].matchAll(/data-cat="(\w+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(cats, ["hiragana", "katakana", "vocab"]);
  assert.match(indexSrc, /id="quizRowChips"/);
  assert.match(indexSrc, /id="typingRowChips"/);
});
