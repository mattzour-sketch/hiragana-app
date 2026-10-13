"use strict";
// Kvíz: mezi možnostmi nesmí být dvě, které jsou správnou odpovědí na tutéž
// otázku. Ve směru Výslovnost → znak / Poslech → znak je otázkou čtení, takže
// špatná možnost se stejným čtením (あ/ア pro "a", じ/ぢ pro "ji", ず/づ pro "zu")
// je také správná – a kliknutí na ni se počítá jako chyba.
// Spustit z adresáře hiragana-app:  node --test
//
// REÁLNÁ data z ../data.js a REÁLNÉ funkce z ../app.js, náhoda přes Math.random.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const dataSrc = fs.readFileSync(path.join(root, "data.js"), "utf8");
const appSrc = fs.readFileSync(path.join(root, "app.js"), "utf8");
const grab = (re, what) => {
  const m = appSrc.match(re);
  if (!m) throw new Error("Nenalezeno v app.js: " + what);
  return m[0];
};
const fnSrc = (name) => grab(new RegExp("^function " + name + "\\([\\s\\S]*?^}", "m"), name);
const constSrc = (name) => grab(new RegExp("^const " + name + " = [\\s\\S]*?;$", "m"), name);

function load(direction) {
  const box = {};
  const selectedDirection = direction; // čte ho answerField
  eval(
    dataSrc + "\n" +
    ["KANA_ROWS", "KANA_SETS"].map(constSrc).join("\n") + "\n" +
    ["shuffle", "isVocabPair", "answerField", "kanaPoolFor", "pickOptions"].map(fnSrc).join("\n") +
    "\n; Object.assign(box, { HIRAGANA_BASIC, HIRAGANA_DAKUTEN, HIRAGANA_YOON, KATAKANA_ALL, KANA_SETS, kanaPoolFor, pickOptions });"
  );
  return box;
}
const ALL_ROWS = ["a", "ka", "sa", "ta", "na", "ha", "ma", "ya", "ra", "wa", "dakuten", "yoon"];

// Kolikrát (z `runs` otázek) se mezi možnostmi objeví jiná položka se stejným čtením.
function ambiguous(L, pool, fallbackOf, runs = 1500) {
  const hits = [];
  for (let i = 0; i < runs; i++) {
    const q = pool[i % pool.length];
    const opts = L.pickOptions(q, pool, fallbackOf(q));
    const twin = opts.find((o) => o !== q && o[1] === q[1]);
    if (twin && hits.length < 5) hits.push(`${q[1]}: ${q[0]} i ${twin[0]}`);
    if (twin) hits.count = (hits.count || 0) + 1;
  }
  return hits;
}

test("Znak → výslovnost (Hiragana + Katakana): žádné dvě možnosti se stejným romaji", () => {
  const L = load("char2romaji");
  const pool = L.kanaPoolFor(L.KANA_SETS.hiragana, ALL_ROWS).concat(L.kanaPoolFor(L.KANA_SETS.katakana, ALL_ROWS));
  for (let i = 0; i < 1500; i++) {
    const q = pool[i % pool.length];
    const opts = L.pickOptions(q, pool, L.KATAKANA_ALL);
    assert.strictEqual(new Set(opts.map((o) => o[1])).size, 4);
  }
});

for (const dir of ["romaji2char", "audio2char"]) {
  test(`${dir}, Hiragana + Katakana: žádná špatná možnost se stejným čtením (あ/ア)`, () => {
      const L = load(dir);
      const pool = L.kanaPoolFor(L.KANA_SETS.hiragana, ALL_ROWS).concat(L.kanaPoolFor(L.KANA_SETS.katakana, ALL_ROWS));
      const hits = ambiguous(L, pool, () => L.KATAKANA_ALL);
      assert.deepStrictEqual(hits, [], `${hits.count} nejednoznačných otázek z 1500`);
    });

  test(`${dir}, jen Hiragana s Dakuten: じ/ぢ a ず/づ nejsou spolu mezi možnostmi`, () => {
      const L = load(dir);
      const pool = L.kanaPoolFor(L.KANA_SETS.hiragana, ["dakuten"]);
      const fallback = L.HIRAGANA_BASIC.concat(L.HIRAGANA_DAKUTEN, L.HIRAGANA_YOON);
      const hits = ambiguous(L, pool, () => fallback);
      assert.deepStrictEqual(hits, [], `${hits.count} nejednoznačných otázek z 1500`);
    });
}
