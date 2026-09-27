"use strict";
// Znaková sada vět (FLASHCARDS: slovo, example, examples).
// Chytá překlepy typu „赤ちaん“ (latinka v japonském textu), latinku ve furiganě
// a japonské znaky v romaji/english, které vizuálně nejsou vidět.
// Spustit z adresáře hiragana-app:  node --test

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const dataSrc = fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8");
const box = {};
eval(dataSrc + "\n; box.FLASHCARDS = FLASHCARDS;");
const { FLASHCARDS } = box;

// Japonský text: hiragana, katakana (vč. ー), kanji, 々, japonská interpunkce 、。？！
const JP_TEXT = /^[぀-ゟ゠-ヿ一-鿿々、。？！]+$/u;
// Furigana: jen hiragana (a ー pro jistotu).
const FURIGANA = /^[぀-ゟー]+$/u;
// Romaji a překlad: tisknutelné ASCII.
const ASCII = /^[\x20-\x7E]+$/;

function sentencesOf(c) {
  return [
    ["slovo", { segments: c.segments, romaji: c.romaji, english: c.english }],
    ["example", c.example],
    ...(c.examples || []).map((e, k) => [`examples[${k}]`, e]),
  ].filter(([, e]) => e);
}

function charsetErrors(c, i) {
  const bad = [];
  for (const [where, e] of sentencesOf(c)) {
    for (const s of e.segments) {
      if (!JP_TEXT.test(s.t)) bad.push(`#${i} ${where}: t=${JSON.stringify(s.t)}`);
      if (s.f !== undefined && !FURIGANA.test(s.f)) bad.push(`#${i} ${where}: f=${JSON.stringify(s.f)}`);
    }
    if (!ASCII.test(e.romaji)) bad.push(`#${i} ${where}: romaji=${JSON.stringify(e.romaji)}`);
    if (!ASCII.test(e.english)) bad.push(`#${i} ${where}: english=${JSON.stringify(e.english)}`);
  }
  return bad;
}

test("japonské segmenty neobsahují latinku ani cizí znaky; furigana je hiragana; romaji/english ASCII", () => {
  const bad = FLASHCARDS.flatMap((c, i) => charsetErrors(c, i));
  assert.deepStrictEqual(bad, [], "vadné znaky:\n" + bad.join("\n"));
});

test("kontrola znakové sady NENÍ vakuová – zachytí 赤ちaん, latinku ve furiganě i JP v romaji", () => {
  const ok = { segments: [{ t: "赤", f: "あか", hl: true }, { t: "ちゃん", hl: true }], romaji: "akachan", english: "baby" };
  assert.deepStrictEqual(charsetErrors({ ...ok, example: ok }, 0), []);
  const latin = { ...ok, segments: [{ t: "赤", f: "あか" }, { t: "ちaん" }] };
  assert.strictEqual(charsetErrors({ ...ok, example: ok, examples: [latin, ok] }, 0).length, 1);
  const badF = { ...ok, segments: [{ t: "赤", f: "aka" }] };
  assert.strictEqual(charsetErrors({ ...ok, example: badF }, 0).length, 1);
  const jpRomaji = { ...ok, romaji: "akaちゃん" };
  assert.strictEqual(charsetErrors({ ...ok, example: jpRomaji }, 0).length, 1);
  const fullwidthA = { ...ok, segments: [{ t: "ちａん" }] }; // ａ (fullwidth)
  assert.strictEqual(charsetErrors({ ...ok, example: fullwidthA }, 0).length, 1);
});
