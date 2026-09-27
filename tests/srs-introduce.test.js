"use strict";
// Review testy (Slovo dne): I/O obaly nad SRS s podvrženým in-memory localStorage
// a konzistence verzí assetů mezi index.html a service-worker.js.
// Spustit z adresáře hiragana-app:  node --test
//
// Funkce se tahají z REÁLNÉHO app.js (top-level `function … }` od kraje řádku),
// localStorage je jednoduchá mapa v paměti – na reálná data se nesahá.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const appSrc = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
const swSrc = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

const grab = (re, what) => {
  const m = appSrc.match(re);
  if (!m) throw new Error("Nenalezeno v app.js: " + what);
  return m[0];
};
const fnSrc = (name) => grab(new RegExp("^function " + name + "\\([\\s\\S]*?^}", "m"), name);

// Sestaví izolované prostředí: vlastní localStorage, počítadlo aktivity, pevný čas.
function makeEnv(initial = {}) {
  const store = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const env = { store, activity: 0 };
  // recordActivity se podvrhne počítadlem (jeho vlastní logika je UTC a mimo rozsah).
  const recordActivity = () => { env.activity++; };
  const box = {};
  eval(
    grab(/^const SRS_KEY = .*$/m, "SRS_KEY") + "\n" +
    grab(/^const SRS_INTERVALS_MS = \[[\s\S]*?^\];/m, "SRS_INTERVALS_MS") + "\n" +
    grab(/^const SRS_MAX_BOX = .*$/m, "SRS_MAX_BOX") + "\n" +
    ["loadSrs", "saveSrs", "scheduleSrs", "introduceInSrs", "rescheduleIfIntroduced", "introduceCard"]
      .map(fnSrc).join("\n") +
    "\n; box.loadSrs = loadSrs; box.scheduleSrs = scheduleSrs;" +
    " box.rescheduleIfIntroduced = rescheduleIfIntroduced; box.introduceCard = introduceCard;" +
    " box.SRS_INTERVALS_MS = SRS_INTERVALS_MS;"
  );
  return Object.assign(env, box);
}

test("Psaní: nezavedené slovo se odpovědí (✓ ani ✗) NEZAVEDE", () => {
  const env = makeEnv();
  assert.strictEqual(env.rescheduleIfIntroduced("犬", true), null);
  assert.strictEqual(env.rescheduleIfIntroduced("犬", false), null);
  assert.deepStrictEqual(env.loadSrs(), {});
  assert.strictEqual(env.store.has("hiragana-srs"), false, "SRS klíč se nemá ani vytvořit");
});

test("Psaní: zavedené slovo se dál přeplánuje (✓ → box+1, ✗ → box 0)", () => {
  const env = makeEnv({ "hiragana-srs": JSON.stringify({ "犬": { box: 1, due: 0 } }) });
  assert.strictEqual(env.rescheduleIfIntroduced("犬", true).box, 2);
  assert.strictEqual(env.rescheduleIfIntroduced("犬", false).box, 0);
  // jiná slova zůstanou netknutá
  assert.deepStrictEqual(Object.keys(env.loadSrs()), ["犬"]);
});

test("Naučeno: zavede do box 0, aktivita +1; dvojklik nic nepřepíše ani nepřičte", () => {
  const env = makeEnv();
  assert.strictEqual(env.introduceCard("猫"), true);
  const first = env.loadSrs()["猫"];
  assert.strictEqual(first.box, 0);
  assert.strictEqual(env.activity, 1);
  assert.strictEqual(env.introduceCard("猫"), false);
  assert.deepStrictEqual(env.loadSrs()["猫"], first);
  assert.strictEqual(env.activity, 1, "aktivita se nesmí započítat podruhé");
});

test("Naučeno u slova, které už je v SRS: existující přihrádka/termín zůstanou", () => {
  const existing = { "猫": { box: 4, due: 123 }, "犬": { box: 2, due: 456 } };
  const env = makeEnv({ "hiragana-srs": JSON.stringify(existing) });
  assert.strictEqual(env.introduceCard("猫"), false);
  assert.deepStrictEqual(env.loadSrs(), existing);
  assert.strictEqual(env.activity, 0);
});

test("Naučeno s poškozeným SRS v úložišti nespadne (loadSrs → {})", () => {
  const env = makeEnv({ "hiragana-srs": "{rozbité" });
  assert.strictEqual(env.introduceCard("犬"), true);
  assert.strictEqual(env.loadSrs()["犬"].box, 0);
});

test("verze assetů: index.html ?v= == APP_SHELL ?v= pro style/data/app", () => {
  for (const f of ["style.css", "data.js", "app.js"]) {
    const re = new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)");
    const inIndex = indexSrc.match(re);
    const inSw = swSrc.match(re);
    assert.ok(inIndex && inSw, `${f}: verze chybí v index.html nebo service-worker.js`);
    assert.strictEqual(inIndex[1], inSw[1], `${f}: index.html v=${inIndex[1]} vs SW v=${inSw[1]}`);
  }
  assert.match(swSrc, /const CACHE_NAME = "hiragana-cache-v\d+"/);
});

test("UI neslibuje pevný počet vět (dávky 2–8 mají jen 1 větu)", () => {
  const re = /\b3 vět|\btři vět/i;
  assert.doesNotMatch(indexSrc, re);
  assert.doesNotMatch(appSrc, re);
});
