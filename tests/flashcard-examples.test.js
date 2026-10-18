"use strict";
// Regresní testy pro funkci "příkladová věta na kartičce" a pro další věty
// `examples` (Slovo dne, docs/specs/slovo-dne.md).
// Spustit z adresáře hiragana-app:  node --test   (nebo node --test tests/*.test.js)
// Bez závislostí – používá vestavěný node:test + node:assert (Node >= 18).
//
// Testy načítají REÁLNÁ data z ../data.js a REÁLNÉ funkce z ../app.js
// (glossForToken, exampleSegmentsToHtml) přes izolovaný eval, takže hlídají
// skutečně nasazený kód, ne jeho kopii.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const dataSrc = fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8");
const appSrc = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

// --- Načti data (FLASHCARDS, PARTICLE_GLOSS) z data.js ---
function loadData() {
  const box = {};
  // const v evalu neuniká do vnějšího scope, proto ho uvnitř stejného evalu
  // přiřadíme do předaného objektu.
  eval(dataSrc + "\n; box.FLASHCARDS = FLASHCARDS; box.PARTICLE_GLOSS = PARTICLE_GLOSS;");
  return box;
}

// --- Vytáhni pure funkce z app.js a vyrob je s PARTICLE_GLOSS v scope ---
function loadAppFns(PARTICLE_GLOSS) {
  const grab = (name) => {
    const m = appSrc.match(new RegExp("^function " + name + "\\([\\s\\S]*?^}", "m"));
    if (!m) throw new Error("Nenalezena funkce " + name + " v app.js");
    return m[0];
  };
  const box = {};
  eval(grab("glossForToken") + "\n" + grab("exampleSegmentsToHtml") +
       "\n; box.glossForToken = glossForToken; box.exampleSegmentsToHtml = exampleSegmentsToHtml;");
  return box;
}

const { FLASHCARDS, PARTICLE_GLOSS } = loadData();
const { glossForToken, exampleSegmentsToHtml } = loadAppFns(PARTICLE_GLOSS);

const wordOf = (segs) => segs.map((s) => s.t).join("");
const hasBadChars = (s) => typeof s === "string" && /[<>&]/.test(s);
const lcp = (a, b) => { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return a.slice(0, n); };

// Dávky vět `examples` (spec: docs/specs/slovo-dne.md). Karty s indexem menším
// než tato hranice už `examples` mít MUSÍ. Po každé dávce se posune; po dávce 8
// (= FLASHCARDS.length) platí „každá z 352 karet má 2 věty“.
const EXAMPLES_DONE_UNTIL = 273;

// Validátor jedné věty (example i každá položka examples) – vrací pole chyb.
function validateSentence(e, c) {
  const errs = [];
  if (!e || typeof e !== "object") return ["věta chybí"];
  if (!Array.isArray(e.segments) || e.segments.length === 0) errs.push("segments prázdné");
  if (typeof e.romaji !== "string" || !e.romaji.trim()) errs.push("romaji chybí");
  if (typeof e.english !== "string" || !e.english.trim()) errs.push("english chybí");
  const hl = (e.segments || []).filter((s) => s.hl);
  if (hl.length === 0) errs.push("žádný hl segment");
  const exText = (e.segments || []).map((s) => s.t).join("");
  const hlText = hl.map((s) => s.t).join("");
  if (hlText && !exText.includes(hlText)) errs.push("hl text není ve větě");
  // cílové slovo: doslova, nebo časovaný tvar se stejným kmenem (する→します výjimka)
  const word = wordOf(c.segments || []);
  if (hlText && word && !exText.includes(word) && lcp(word, hlText).length < 1 &&
      !(word === "する" && hlText.startsWith("し"))) {
    errs.push("cílové slovo není ve větě");
  }
  return errs;
}

// Sdílený validátor jedné karty – vrací pole chyb (prázdné = OK).
function validateCard(c) {
  if (!c.example) return ["chybí example"];
  const errs = validateSentence(c.example, c);
  if (c.examples !== undefined) {
    if (!Array.isArray(c.examples) || c.examples.length !== 2) {
      errs.push("examples musí mít právě 2 věty");
    } else {
      c.examples.forEach((e, k) => validateSentence(e, c).forEach((err) => errs.push(`examples[${k}]: ${err}`)));
    }
  }
  return errs;
}

// Všechny věty karty: example + examples (pokud jsou).
const sentencesOf = (c) => [c.example, ...(c.examples || [])].filter(Boolean);
const hasKanji = (s) => /[一-鿿々]/.test(s);

test("FLASHCARDS má právě 352 karet", () => {
  assert.strictEqual(FLASHCARDS.length, 352);
});

test("každá karta má strukturálně validní example (segments+romaji+english+≥1 hl)", () => {
  const bad = [];
  FLASHCARDS.forEach((c, i) => {
    const errs = validateCard(c);
    if (errs.length) bad.push(`#${i} [${wordOf(c.segments)}]: ${errs.join(", ")}`);
  });
  assert.deepStrictEqual(bad, [], "vadné karty:\n" + bad.join("\n"));
});

test("validátor NENÍ vakuový – zachytí rozbitou kartu", () => {
  // meta-test: uměle rozbitá data musí spadnout
  assert.deepStrictEqual(validateCard({ segments: [{ t: "x" }] }), ["chybí example"]);
  assert.ok(validateCard({ example: { segments: [{ t: "犬" }], romaji: "inu", english: "dog" } })
    .includes("žádný hl segment"));
  assert.ok(validateCard({ example: { segments: [{ t: "犬", hl: true }], romaji: "", english: "dog" } })
    .includes("romaji chybí"));
  const ok = { segments: [{ t: "犬", hl: true }], romaji: "inu", english: "dog" };
  assert.deepStrictEqual(validateCard({ segments: [{ t: "犬" }], example: ok, examples: [ok, ok] }), []);
  assert.ok(validateCard({ segments: [{ t: "犬" }], example: ok, examples: [ok] })
    .includes("examples musí mít právě 2 věty"));
  assert.ok(validateCard({ segments: [{ t: "犬" }], example: ok,
    examples: [ok, { segments: [{ t: "猫" }], romaji: "neko", english: "cat" }] })
    .includes("examples[1]: žádný hl segment"));
  assert.ok(validateCard({ segments: [{ t: "犬" }], example: ok,
    examples: [ok, { segments: [{ t: "猫", hl: true }], romaji: "neko", english: "cat" }] })
    .includes("examples[1]: cílové slovo není ve větě"));
});

test(`karty 0–${EXAMPLES_DONE_UNTIL - 1} mají examples (hotové dávky), ostatní je mít smí`, () => {
  const missing = FLASHCARDS.slice(0, EXAMPLES_DONE_UNTIL)
    .map((c, i) => (c.examples ? null : `#${i} [${wordOf(c.segments)}]`))
    .filter(Boolean);
  assert.deepStrictEqual(missing, [], "chybí examples:\n" + missing.join("\n"));
});

test("examples: kanji v segmentu má furiganu", () => {
  const bad = [];
  FLASHCARDS.forEach((c, i) => {
    (c.examples || []).forEach((e, k) => e.segments.forEach((s) => {
      if (hasKanji(s.t) && !s.f) bad.push(`#${i} examples[${k}]: ${s.t}`);
    }));
  });
  assert.deepStrictEqual(bad, []);
});

test("3 věty karty mají navzájem různý japonský text", () => {
  const bad = [];
  FLASHCARDS.forEach((c, i) => {
    const texts = sentencesOf(c).map((e) => wordOf(e.segments));
    if (new Set(texts).size !== texts.length) bad.push(`#${i} [${wordOf(c.segments)}]: ${texts.join(" | ")}`);
  });
  assert.deepStrictEqual(bad, [], "duplicitní věty:\n" + bad.join("\n"));
});

test("věty examples se neopakují s žádnou jinou větou (ani na jiné kartě)", () => {
  // původní `example` se mezi kartami sdílet smí (本を読みます u 本 i 読む),
  // nové věty `examples` musí být všude unikátní
  const seen = new Map();
  FLASHCARDS.forEach((c, i) => sentencesOf(c).forEach((e, k) => {
    const t = wordOf(e.segments);
    if (!seen.has(t)) seen.set(t, []);
    seen.get(t).push({ at: `#${i}:${k}`, isNew: k > 0 });
  }));
  const bad = [...seen].filter(([, v]) => v.length > 1 && v.some((x) => x.isNew))
    .map(([t, v]) => `${t}: ${v.map((x) => x.at).join(" ")}`);
  assert.deepStrictEqual(bad, [], "opakované věty:\n" + bad.join("\n"));
});

// Věty, které heuristika „záměna jednoho slova“ chybně označí, i když jsou
// obsahově různé. Formát: "index karty:i-j" (indexy vět v example+examples).
// Každá položka potřebuje komentář, proč je to v pořádku.
const TEMPLATE_ALLOWLIST = new Set([]);

// Stejný počet segmentů a liší se nejvýš v jednom → jen záměna slova v šabloně.
function isOneSwap(sa, sb) {
  if (sa.length !== sb.length) return false;
  return sa.filter((s, k) => s.t !== sb[k].t).length <= 1;
}

test("věty karty nejsou jen záměnou jednoho segmentu ve stejné šabloně", () => {
  const bad = [];
  FLASHCARDS.forEach((c, i) => {
    const sents = sentencesOf(c);
    for (let a = 0; a < sents.length; a++) {
      for (let b = a + 1; b < sents.length; b++) {
        const sa = sents[a].segments, sb = sents[b].segments;
        if (isOneSwap(sa, sb) && !TEMPLATE_ALLOWLIST.has(`${i}:${a}-${b}`)) {
          bad.push(`#${i} [${wordOf(c.segments)}] ${a}-${b}: ${wordOf(sa)} | ${wordOf(sb)}`);
        }
      }
    }
  });
  assert.deepStrictEqual(bad, [], "šablonovité věty:\n" + bad.join("\n"));
});

test("heuristika šablon NENÍ vakuová – zachytí záměnu jednoho slova", () => {
  const sa = [{ t: "犬" }, { t: "が" }, { t: "好きです" }];
  assert.strictEqual(isOneSwap(sa, [{ t: "犬" }, { t: "が" }, { t: "嫌いです" }]), true);
  assert.strictEqual(isOneSwap(sa, [{ t: "猫" }, { t: "は" }, { t: "好きです" }]), false);
  assert.strictEqual(isOneSwap(sa, [{ t: "犬" }, { t: "が" }, { t: "好きです" }, { t: "か" }]), false);
});

test("cílové slovo je ve větě (doslova, nebo sdílí slovníkový kmen u časovaných tvarů)", () => {
  const bad = [];
  FLASHCARDS.forEach((c, i) => {
    const word = wordOf(c.segments);
    const exText = wordOf(c.example.segments);
    const hlText = c.example.segments.filter((s) => s.hl).map((s) => s.t).join("");
    // buď věta obsahuje slovo doslovně, nebo hl (časovaný tvar) sdílí s kmenem
    // aspoň první znak (u sloves/adj: 食べる→食べます sdílí 食べ; する→します je
    // nepravidelné a řeší se výjimkou níže)
    const literal = exText.includes(word);
    const stem = lcp(word, hlText).length >= 1;
    const irregular = word === "する" && hlText.startsWith("し"); // する→します
    if (!literal && !stem && !irregular) {
      bad.push(`#${i} [${word}] hl=[${hlText}] veta=${exText}`);
    }
  });
  assert.deepStrictEqual(bad, [], "cílové slovo chybí ve větě:\n" + bad.join("\n"));
});

test("žádná glosa/romaji/english neobsahuje < > & (bezpečné pro innerHTML)", () => {
  const bad = [];
  FLASHCARDS.forEach((c, i) => {
    sentencesOf(c).forEach((e) => {
      if (hasBadChars(e.romaji) || hasBadChars(e.english)) bad.push(`#${i} romaji/english`);
      e.segments.forEach((s) => {
        if (hasBadChars(s.t) || hasBadChars(s.f)) bad.push(`#${i} t/f:${s.t}`);
        if (s.g && (hasBadChars(s.g.text) || hasBadChars(s.g.romaji))) bad.push(`#${i} g:${s.t}`);
      });
    });
  });
  Object.entries(PARTICLE_GLOSS).forEach(([k, g]) => {
    if (hasBadChars(g.text) || hasBadChars(g.romaji)) bad.push(`PARTICLE_GLOSS:${k}`);
  });
  assert.deepStrictEqual(bad, []);
});

test("homonyma sedí na význam karty (věta obsahuje cíl + správný překlad)", () => {
  // najdi kartu podle přesného zápisu slova a ověř anglický význam + že věta cíl obsahuje
  const find = (word, english) =>
    FLASHCARDS.find((c) => wordOf(c.segments) === word && c.english === english);

  // [zápis slova, english karty, regex který MUSÍ být v překladu věty]
  const cases = [
    ["花", "flower", "flower"],
    ["鼻", "nose", "nose"],
    ["かえる", "frog", "frog"],
    ["帰る", "to return home", "home"],
    ["歯", "tooth", "tooth"],
    ["はち", "bee", "bee"],
    ["八", "eight", "clock"], // 八時 = osm hodin
  ];
  for (const [word, english, mustBeInEnglish] of cases) {
    const c = find(word, english);
    assert.ok(c, `chybí karta ${word} (${english})`);
    const exText = wordOf(c.example.segments);
    const hlText = c.example.segments.filter((s) => s.hl).map((s) => s.t).join("");
    // cíl je zvýrazněný a je ve větě (doslova, nebo sdílí kmen u časovaného slovesa 帰る→帰ります)
    assert.ok(exText.includes(hlText), `${word}: věta neobsahuje hl "${hlText}"`);
    assert.ok(lcp(word, hlText).length >= 1, `${word}: hl "${hlText}" nesdílí kmen se slovem`);
    // a hlavně: překlad věty odpovídá VÝZNAMU karty, ne jen shodě řetězce/romaji
    assert.match(c.example.english.toLowerCase(), new RegExp(mustBeInEnglish),
      `${word}: překlad "${c.example.english}" nesedí na význam karty`);
  }
});

test("homonyma v examples: obě nové věty nesou význam karty v překladu", () => {
  // [zápis slova, english karty, regex který MUSÍ být v překladu každé nové věty]
  // Rozšiřovat s každou dávkou.
  const cases = [
    // dávka 1
    ["花", "flower", /flower/],                     // ne 鼻 (nos)
    ["かえる", "frog", /frog/],                     // ne 帰る (vrátit se domů)
    ["はち", "bee", /\bbees?\b/],                   // ne 八 (osm)
    ["くも", "spider", /spider/],                   // ne 雲 (mrak)
    // dávka 2
    ["米", "rice (uncooked)", /\brice\b/],          // ne 米 = Amerika (米国)
    ["ご飯", "rice / meal", /\b(meal|rice)\b/],
    ["赤ちゃん", "baby", /\bbab(y|ies)\b/],          // ne 赤 (červená)
    ["目", "eye", /\beyes?\b/],
    ["耳", "ear", /\bears?\b/],
    ["鼻", "nose", /\bnose\b/],                     // ne 花 (květina)
    ["口", "mouth", /\bmouths?\b/],
    ["手", "hand", /\bhands?\b/],                   // ne částice て
    ["足", "foot / leg", /\b(foot|feet|legs?)\b/],  // ne 足りる (stačit)
    ["指", "finger", /\bfingers?\b/],
    ["頭", "head", /\bhead\b/],
    ["心", "heart (feeling)", /\bheart\b/],
    ["歯", "tooth", /\b(tooth|teeth)\b/],           // ne částice は
    // dávka 3
    ["オレンジ", "orange (color)", /\borange\b/],
    ["八", "eight", /\beight\b/],                   // ne はち (včela)
    ["曇り", "cloudy", /\bcloud(y|s)?\b/],          // ne くも (pavouk / mrak)
    ["風", "wind", /\bwind\b/],                     // ne 風邪 (nachlazení)
    ["空", "sky", /\bsky\b/],                       // ne 空 (から, prázdný)
    ["月", "moon", /\bmoon\b/],                     // ne 月 がつ (měsíc v datu)
    ["木", "tree", /\btrees?\b/],                   // ne 木曜日 (čtvrtek)
    // dávka 4
    ["船", "boat / ship", /\b(boat|ship)s?\b/],
    ["時計", "clock / watch", /\b(clock|watch)\b/],
    ["傘", "umbrella", /\bumbrella\b/],
    ["写真", "photo", /\b(photo|picture)s?\b/],
    ["靴", "shoes", /\bshoes?\b/],                  // ne 靴下 (ponožky)
    ["靴下", "socks", /\bsocks?\b/],
    ["帽子", "hat", /\bhats?\b/],
    // dávka 5 – slovesa jsou ve větě časovaná, 4. položka je kmen, který věta musí obsahovat
    ["帰る", "to return home", /\b(home|back)\b/, "帰"],   // ne かえる (žába)
    ["聞く", "to listen / ask", /\b(listen|hear|ask)/, "聞"],
    ["寝る", "to sleep", /\b(sleep|sleeping|bed)\b/, "寝"],
    ["開ける", "to open", /\bopen/, "開け"],
    ["分かる", "to understand", /\b(understand|understood)\b/, "分か"], // ne 分ける (dělit)
    ["着る", "to wear", /\b(wear|wearing|put on)\b/, "着"],          // ne 切る (řezat)
    // dávka 6 – přídavná jména jsou ve větě časovaná, 4. položka je kmen
    ["暑い", "hot (weather)", /\bhot\b/, "暑"],                     // ne 熱い (horký na dotek)
    ["冷たい", "cold (to touch)", /\bcold\b/, "冷た"],              // ne 寒い (zima venku)
    ["高い", "high / expensive", /\b(high|highest|expensive)\b/, "高"],
    ["速い", "fast", /\bfast\b/, "速"],                             // ne 早い (brzký)
    ["遅い", "slow / late", /\b(slow|late)\b/, "遅"],
    ["明るい", "bright", /\b(bright|light)\b/, "明る"],
    ["軽い", "light (weight)", /\blight\b/, "軽"],
    ["優しい", "kind / gentle", /\b(kind|gentle)\b/, "優し"],       // ne 易しい (snadný)
  ];
  for (const [word, english, re, stem = word] of cases) {
    const c = FLASHCARDS.find((x) => wordOf(x.segments) === word && x.english === english);
    assert.ok(c, `chybí karta ${word} (${english})`);
    assert.ok(Array.isArray(c.examples), `${word}: chybí examples`);
    c.examples.forEach((e, k) => {
      assert.ok(wordOf(e.segments).includes(stem), `${word}: examples[${k}] neobsahuje slovo`);
      assert.match(e.english.toLowerCase(), re, `${word}: examples[${k}] "${e.english}" nesedí na význam`);
    });
  }
});

test("glossForToken: priorita hl > částice > g > null", () => {
  const card = { romaji: "inu", english: "dog" };
  // 1) hl → glosa z karty; tvar {romaji, text}, kde text = anglický význam karty
  assert.deepStrictEqual(glossForToken({ t: "犬", hl: true }, card), { romaji: "inu", text: "dog" });
  // 2) hl má přednost i před částicí (は=zub scénář)
  assert.deepStrictEqual(glossForToken({ t: "は", hl: true }, card), { romaji: "inu", text: "dog" });
  // 3) částice → PARTICLE_GLOSS (česky)
  assert.deepStrictEqual(glossForToken({ t: "を" }, card), PARTICLE_GLOSS["を"]);
  // 4) ruční g
  const g = { romaji: "ringo", text: "jablko" };
  assert.deepStrictEqual(glossForToken({ t: "りんご", g }, card), g);
  // 5) jinak neklikací
  assert.strictEqual(glossForToken({ t: "です" }, card), null);
});

test("exampleSegmentsToHtml: hl → <strong>, klikací token → span[data-seg], furigana → ruby", () => {
  const card = { romaji: "taberu", english: "to eat" };
  const ex = { segments: [
    { t: "りんご", g: { romaji: "ringo", text: "jablko" } },
    { t: "を" },
    { t: "食", f: "た", hl: true },
    { t: "べます", hl: true },
    { t: "。" }, // neklikací interpunkce (žádná glosa)
  ] };
  const html = exampleSegmentsToHtml(ex, card);
  assert.ok(html.includes('<strong><ruby>食<rt>た</rt></ruby></strong>'), "hl s furiganou → strong+ruby");
  assert.ok(html.includes('data-seg="2"') && html.includes('data-seg="3"'), "hl segmenty jsou klikací");
  assert.ok(html.includes('data-seg="0"'), "g slovo je klikací");
  assert.ok(html.includes('data-seg="1"'), "částice を je klikací");
  // neklikací segment nemá gloss-token span:
  assert.ok(!/data-seg="4"/.test(html), "interpunkce není klikací");
  // do atributu jde jen index, ne text glosy (žádné vkládání cizích textů):
  assert.ok(!html.includes("jablko"), "text glosy se nevkládá do HTML věty");
});

test("částice bez hl jsou samostatné klikací segmenty (namátkově dle PARTICLE_GLOSS)", () => {
  // ověř, že běžné strukturní částice stojí samostatně tam, kde se objeví
  // (jinak by nešly glosovat)
  let sampleChecked = 0;
  FLASHCARDS.forEach((c) => {
    sentencesOf(c).forEach((e) => (e.segments || []).forEach((s) => {
      if (!s.hl && !s.g && s.t.length === 1 && PARTICLE_GLOSS[s.t]) {
        assert.ok(glossForToken(s, c), `částice ${s.t} má být glosovatelná`);
        sampleChecked++;
      }
    }));
  });
  assert.ok(sampleChecked > 100, "očekáváno mnoho samostatných částic, nalezeno " + sampleChecked);
});

test("examples: tázací か není přilepená k predikátu (ですか → です + か)", () => {
  const bad = [];
  FLASHCARDS.forEach((c, i) => {
    (c.examples || []).forEach((e, k) => e.segments.forEach((s) => {
      if (!s.hl && !s.g && s.t.length > 1 && s.t.endsWith("か")) bad.push(`#${i} examples[${k}]: ${s.t}`);
    }));
  });
  assert.deepStrictEqual(bad, []);
});
