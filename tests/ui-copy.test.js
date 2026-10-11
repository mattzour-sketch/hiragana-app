// Run: node --test
// UI texts stay factual: no celebratory emoji or praise. Functional symbols
// (✓ ✗ 🔊 and the flashcard picture emoji in data.js) are not checked here.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const files = ["app.js", "index.html"].map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]);

test("UI texty bez oslavných emoji a pochval", () => {
  const re = /🎉|👏|🔥|💪|✨|perfektní|hezká práce|trénuj dál|jen tak dál/;
  for (const [name, src] of files) {
    const hit = src.split(/\r?\n/).findIndex((line) => re.test(line));
    assert.strictEqual(hit, -1, `${name}:${hit + 1}`);
  }
});
