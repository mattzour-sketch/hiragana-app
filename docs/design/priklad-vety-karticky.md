# Návrh: Příkladová věta na kartičce se slovíčkem

## Co řešíme

Spec: `docs/specs/priklad-vety-karticky.md`. Ke každé z 352 kartiček přidat jednu krátkou
příkladovou větu (furigana + romaji + anglicky), na zadní straně skrytou za tlačítkem „Ukázat
větu“, s vlastním tlačítkem 🔊 a tučně zvýrazněným cílovým slovem — bez frameworku, offline.

**Po schválení přidána 4 rozšíření** (viz sekce „Rozšíření po schválení“): (1) paměť volby
odhalení do konce sezení, (2) 🔊 až s odhalenou větou, (3) stálá poznámka pod větou,
(4) slovní glosa (pop-up jako pevná lišta) po klepnutí na slovo ve větě.

## Ověřený stav kódu (na čem plán stojí)

- `data.js` **597–1002**: `const FLASHCARDS = [...]`, **352** objektů tvaru
  `{ emoji?, segments:[{t, f?}], romaji, english }`. **134** karet nemá `emoji` (slovesa,
  přídavná jména, abstraktní slova) — právě u nich je věta nejcennější.
- `data.js` **152–190**: `SENTENCES` — vzor formátu věty `{ segments:[{t, f?}], romaji, english }`.
- `data.js` **1006–1055**: `PARTICLES` — 8 částic (は, が, を, に, で, の, か, へ) s českými popisky
  v poli `role`. Zdroj textů pro `PARTICLE_GLOSS` (rozšíření 4).
- `app.js` **275–279** `segmentsToHtml(segments)` → `<ruby>t<rt>f</rt></ruby>` nebo `t`.
  Sdílí ho `renderSentences`, konverzace i builder.
- `app.js` **281–283** `segmentsToPlainText(segments)` → čistý text pro `speak()`.
- `app.js` **317–320**: modul-level stav kartiček (`flashcardMode`, `flashcardOrder`,
  `flashcardIndex`, `flashcardFlipped`) — sem patří i nový stav rozšíření 1.
- `app.js` **351–396** `renderFlashcard()`: zadní strana se staví přes
  `flashcardBackEl.innerHTML = ...` (390–394) — **při každém renderu se celý obsah přepíše**.
- `app.js` **426–433** flip handler je na **`flashcardEl` (celá karta `#flashcard`)**: jakýkoli
  klik uvnitř karty ji otočí (bublání) a při otočení na zadní stranu přehraje **slovo**.
- `app.js` **398–424** `goToFlashcard()` → po doznění animace volá `renderFlashcard()`
  (Předchozí / Další / Zamíchat i hodnocení jdou přes tuto cestu).
- `style.css` **331–338**: `.flashcard { width:280px; height:320px }` — **pevná velikost**.
  **344–358** `.flashcard-face` je `position:absolute; inset:0; justify-content:center`;
  `overflow` není nastaven. **376–402** styly zadní strany.
- `style.css` **265–314**: hotové styly `.speak-btn`, `.reveal-btn`, `.sentence-reveal(.visible)`,
  `.sentence-romaji`, `.sentence-translation` — dají se recyklovat.
- Tlačítka **✓/✗** (`index.html` 99–102) i navigace jsou **mimo kartu**; při pevné výšce karty je
  nová věta nevytlačí.
- Verze assetů: `index.html` 15/314/315 = `?v=5`; `service-worker.js` `CACHE_NAME =
  "hiragana-cache-v6"` a `APP_SHELL` používá `?v=5`.
- Nasazení: `hiragana-deploy/` je **samostatný git repo** (origin `hiragana-app.git`, větev
  `main`) — deploy = zkopírovat změněné assety, commit, push.

Homonyma (ověřeno skriptem — kolize jen v romaji, ne v zápisu): `hana` 花/鼻, `kaeru` かえる/帰る,
**`hachi` 蜂/八** (spec neuvádí, ale existuje). Navíc `は` = 歯 (zub): řetězec „は“ splývá s
tématickou partikulí は, takže „obsahuje cílové slovo“ nejde u něj ověřovat porovnáním řetězce.

---

## Zvažované varianty

### A) Uložení věty

| Varianta | Pro | Proti |
|---|---|---|
| **Inline pole `example` v každém objektu `FLASHCARDS`** (zvoleno) | Věta žije u konkrétní karty → význam homonyma je zaručen strukturou; pokrytí se ověří triviálně (každý objekt má klíč `example`); konzistentní se stávajícím stylem | Delší řádky v `data.js` |
| Samostatná mapa klíčovaná slovem/romaji | Data oddělená od karet | **Padá na homonymech** (hana, kaeru, hachi) a na `は`; nutný lookup + fallback; horší ověření pokrytí |
| Paralelní pole podle indexu | Krátké | Křehké — přeřazení/vložení tiše rozhodí párování |

### B) Označení cílového slova pro tučně

| Varianta | Pro | Proti |
|---|---|---|
| **Flag `hl:true` na segmentu/segmentech** (zvoleno) | Cílové slovo = často víc segmentů (食べ+ます); flag označí všechny; segment už je jednotka, kterou renderer prochází; odolné vůči přeřazení. **Zdvojeně poslouží rozšíření 4** jako signál „glosuj z karty“ | Autor nesmí flag zapomenout (hlídá skript) |
| Index cílového segmentu | Jedno číslo | Neoznačí vícesegmentový tvar; desync při editaci |

### C) Vykreslení tučně

| Varianta | Pro | Proti |
|---|---|---|
| **Rozšířit `segmentsToHtml` o `seg.hl` → `<strong>`** (zvoleno pro zbytek appky) | Jedna funkce řeší ruby i tučně; přírůstkové a inertní pro stávající data | Sahá do sdílené funkce (beze změny chování jinde) |
| Samostatný helper | Sdílená funkce netknutá | Skoro duplikát |

> Pozn.: kvůli rozšíření 4 (klikací tokeny + glosa z kontextu karty) potřebuje **věta na kartičce**
> vlastní renderer `exampleSegmentsToHtml(ex, card)` — viz níže. `segmentsToHtml` se `hl` používá
> jen pro cílové slovo **karty** (`.flashcard-word`), ne pro tokeny věty.

## Zvolené řešení

Inline `example` na každé kartě, cíl označený flagem `hl:true`, tučně přes rozšířený
`segmentsToHtml`. Vykreslení recykluje hotové CSS třídy z „Vět“. Rozšíření 1–4 (níže) přidávají
session-paměť odhalení, podmíněné 🔊, poznámku a klikací glosu jako pevnou lištu.

Proč tohle: nejmenší zásah, který sedí na realitu kódu i na akceptační kritéria. Homonyma jsou
vyřešená strukturálně (věta je fyzicky u své karty), ne heuristikou nad řetězcem. Obětuji tím
delší řádky v `data.js` — přijatelné.

---

## Rozšíření po schválení (body 1–4)

### 1) Paměť volby „Ukázat větu“ do konce sezení

**Mechanika:** jedna modul-level proměnná v `app.js` vedle stávajícího stavu (317–320):
`let flashcardExampleRevealed = false;` (**in-memory, ne `localStorage`** → reset po reloadu =
konec sezení). `renderFlashcard()` z ní odvodí, zda má reveal-box třídu `.visible` a jaký má
tlačítko text. Reveal handler proměnnou přepisuje: `flashcardExampleRevealed =
revealBox.classList.toggle("visible")`. Když uživatel jednou odhalí, každá další karta v sezení
se vykreslí rovnou odhalená, dokud neklikne na „Skrýt větu“.

**Mění spec kritérium.** Původní akceptační kritérium „nová karta začíná se **skrytou** větou
(reset)“ je tímto rozšířením **vědomě přepsáno** na „nová karta respektuje sezení-wide volbu“.
(Reset stále nastane při reloadu appky.) Glosa lišta (bod 4) se ale při přechodu na jinou kartu
**vždy zavře** — odhalení věty a otevření glosy jsou dva nezávislé stavy.

### 2) 🔊 až s odhalenou větou

**Mechanika:** tlačítko 🔊 se přesune **dovnitř reveal-boxu** (`.sentence-reveal`), který je do
odhalení `display:none`. Ve skrytém stavu je proto vidět jen „Ukázat větu“; po odhalení se objeví
věta i 🔊. Žádný zvláštní stav — plyne z toho, že 🔊 je součást odhaleného obsahu.

### 3) Poznámka pod větou

**Mechanika:** stálý malý text uvnitř reveal-boxu:
`<div class="flashcard-example-note">tučně = hledané slovo (může být i v jiném tvaru)</div>`.
Zobrazí se spolu s odhalenou větou, aby začátečník nebyl zmatený z 食べます vs. 食べる z karty.
Statický text, žádná logika.

### 4) Slovní glosa (klik na slovo ve větě → čtení + význam)

**Rozsah (automatika + volitelná ruční glosa), priorita při určení glosy tokenu:**

1. **Cílové slovo** — token má `hl:true` → glosa z karty: `{ romaji: card.romaji, text: card.english }`.
2. **Částice** — `PARTICLE_GLOSS[token.t]` existuje → glosa z mapy `{ romaji, text }` (české).
3. **Ostatní slovo** — token má autorské pole `g` → `{ romaji, text }`.
4. Jinak → **plain text, neklikací**.

(`hl` má přednost před mapou, takže u karty は=zub se cílový segment `{t:"は", hl:true}` glosuje
jako zub z karty, ne jako partikule.)

**(a) Data — token dostane volitelné pole `g`, plus nová mapa `PARTICLE_GLOSS`:**

```js
// example-segment: { t, f?, hl?, g? }
//   hl?: true            → cílové slovo (tučně + glosa z karty)
//   g?:  { romaji, text} → ruční glosa pro NE-částicové, NE-cílové slovo (text = cz nebo en)

// data.js — nová mapa (texty prvních 8 zkráceny z PARTICLES[].role, poslední 4 dopsané)
const PARTICLE_GLOSS = {
  "は": { romaji: "wa", text: "téma věty" },
  "が": { romaji: "ga", text: "podmět (nová informace)" },
  "を": { romaji: "o",  text: "předmět slovesa" },
  "に": { romaji: "ni", text: "cíl / místo / čas (kam, kdy, komu)" },
  "で": { romaji: "de", text: "místo děje / prostředek" },
  "の": { romaji: "no", text: "přivlastnění (X-ovo Y)" },
  "か": { romaji: "ka", text: "otázka (na konci věty)" },
  "へ": { romaji: "e",  text: "směr (kam)" },
  "と": { romaji: "to", text: "a / s (kým)" },
  "も": { romaji: "mo", text: "také / i" },
  "から": { romaji: "kara", text: "od / protože" },
  "まで": { romaji: "made", text: "až do" },
};
```

**Konvence autorování (důležité):** aby se částice glosovaly automaticky, musí být ve větě
**samostatné segmenty** — `[{t:"りんご"},{t:"を"},{t:"食",f:"た",hl:true},{t:"べます",hl:true}]`,
ne slepené `{t:"りんごを"}`. To je vědomá odchylka od stylu `SENTENCES` (kde jsou částice
přilepené); example-věty jsou nová data a token-level dělení je potřeba pro klikatelnost.
Za běhu se **netokenizuje** (bez závislostí to nejde spolehlivě) — dělení je na autorovi.

**(b) Vykreslení — pevná „glosa lišta“ dole v kartě, ne plovoucí pop-up.** Karta je 280×320 px
a scrolluje; plovoucí pop-up uvnitř 3D-transformované scrollovatelné plochy je zdroj bugů s
pozicováním. Lišta je poslední prvek reveal-boxu, `position: sticky; bottom: 0`, do prvního
kliku `hidden`. Klik na klikací token ji naplní (`romaji` + `text`) a zobrazí.

```js
// app.js — helpery
function glossForToken(seg, card) {
  if (seg.hl) return { romaji: card.romaji, text: card.english };
  if (PARTICLE_GLOSS[seg.t]) return PARTICLE_GLOSS[seg.t];
  if (seg.g) return seg.g;
  return null;                        // neklikací
}

// dedikovaný renderer věty na kartičce (klikatelnost + kontext karty)
function exampleSegmentsToHtml(ex, card) {
  return ex.segments.map((seg, i) => {
    const inner = seg.f ? `<ruby>${seg.t}<rt>${seg.f}</rt></ruby>` : seg.t;
    const body  = seg.hl ? `<strong>${inner}</strong>` : inner;
    return glossForToken(seg, card)
      ? `<span class="gloss-token" data-seg="${i}">${body}</span>`   // jen INDEX do atributu
      : body;                                                        // → žádný escaping textů glos
  }).join("");
}

function hideGloss(root) {
  const bar = root.querySelector(".flashcard-gloss-bar");
  if (bar) { bar.hidden = true; bar.dataset.seg = ""; }
  root.querySelectorAll(".gloss-token.active").forEach(t => t.classList.remove("active"));
}

function toggleGloss(root, i, gloss, tok) {
  if (!gloss) return;
  const bar = root.querySelector(".flashcard-gloss-bar");
  if (!bar.hidden && bar.dataset.seg === String(i)) { hideGloss(root); return; }  // toggle
  root.querySelectorAll(".gloss-token.active").forEach(t => t.classList.remove("active"));
  tok.classList.add("active");
  bar.innerHTML = `<span class="gloss-romaji">${gloss.romaji}</span> ` +
                  `<span class="gloss-text">${gloss.text}</span>`;
  bar.hidden = false;
  bar.dataset.seg = String(i);
}
```

**(c) Ochrana otočení a zavírání:**
- Klik na token i na lištu volá `e.stopPropagation()` → **neotočí kartu** (flip handler je na
  ancestoru `#flashcard`).
- **Zavření glosy:** (i) klik na aktivní token = toggle zavře; (ii) klik na jiný token přepne
  obsah; (iii) klik „jinam“ (do prázdna karty) — flip handler dostane **guard**: je-li lišta
  otevřená, jen ji zavře a **return** (neotočí); (iv) přechod na jinou kartu → `renderFlashcard`
  přestaví `innerHTML`, lišta zmizí. Tokeny/lišta/tlačítka mají `stopPropagation`, takže do flip
  handleru dojdou jen kliky do prázdna.

**Jazyk glos (vědomá nekonzistence):** cílové slovo ukáže romaji + **anglicky** (přesně to, co je
na kartě), částice romaji + **česky** (UI je české). Přijato — odpovídá zbytku appky.

---

## Změny datového modelu

Rozšíření objektu v `FLASHCARDS` o pole `example`; example-segment má navíc `hl`/`g`:

```js
// example-segment: { t: string, f?: string, hl?: true, g?: { romaji: string, text: string } }
// example:         { segments: ExampleSegment[], romaji: string, english: string }

{ segments: [{ t: "食", f: "た" }, { t: "べる" }], romaji: "taberu", english: "to eat",
  example: {
    segments: [
      { t: "毎日", f: "まいにち", g: { romaji: "mainichi", text: "každý den" } },
      { t: "りんご", g: { romaji: "ringo", text: "jablko" } },
      { t: "を" },                                   // částice → glosa z PARTICLE_GLOSS
      { t: "食", f: "た", hl: true }, { t: "べます", hl: true }  // cílové slovo → glosa z karty
    ],
    romaji: "mainichi ringo o tabemasu",             // čtení CELÉ věty
    english: "I eat an apple every day."             // překlad CELÉ věty
  }
}
```

Pravidla obsahu (vymáhá review + skript):
- `example` má **vždy** `segments` (≥1), `romaji` (celá věta), `english` (celá věta).
- ≥1 segment má `hl:true` (cílové slovo, tučně; u sloves/přídavných jmen i v časovaném tvaru).
- **Částice se píší jako samostatné segmenty** (jinak nejsou klikací).
- `g` je volitelné — autor přidá jen u slov, která stojí za vysvětlení; ostatní zůstanou plain.
- U homonym (hana, kaeru, hachi) a `は` (zub) věta odpovídá **významu karty**; `hl` značí přesný
  cílový výskyt.
- `PARTICLE_GLOSS` je nová statická mapa v `data.js`.

Žádná migrace, žádná změna `localStorage`/SRS. Vše aditivní.

---

## Dopad na kód

### `data.js`
- Nová mapa `PARTICLE_GLOSS` (viz výše), poblíž `PARTICLES`.
- Do každého objektu `FLASHCARDS` doplnit `example` (dávkově, viz plán).

### `app.js`
- **`segmentsToHtml` (275–279)** — přidat podporu `hl` (`<strong>` kolem segmentu s `hl`);
  zpětně kompatibilní (stávající data `hl` nemají). Používá se pro `.flashcard-word`.
- **Nový stav (u 317–320):** `let flashcardExampleRevealed = false;` (rozšíření 1).
- **Nové helpery:** `glossForToken`, `exampleSegmentsToHtml`, `hideGloss`, `toggleGloss` (výše).
- **`renderFlashcard()` (390–394)** — zadní strana + skrytý blok věty **jen když `card.example`**
  (guard kvůli přírůstkovému doplňování dat):
  ```js
  const ex = card.example;
  const exampleHtml = ex ? `
    <div class="flashcard-example">
      <div class="flashcard-example-actions">
        <button type="button" class="reveal-btn fc-example-reveal">${
          flashcardExampleRevealed ? "Skrýt větu" : "Ukázat větu"}</button>
      </div>
      <div class="sentence-reveal fc-example-reveal-box${flashcardExampleRevealed ? " visible" : ""}">
        <div class="flashcard-example-line">
          <span class="flashcard-example-jp">${exampleSegmentsToHtml(ex, card)}</span>
          <button type="button" class="speak-btn fc-example-speak" title="Přehrát větu">🔊</button>
        </div>
        <div class="sentence-romaji">${ex.romaji}</div>
        <div class="sentence-translation">${ex.english}</div>
        <div class="flashcard-example-note">tučně = hledané slovo (může být i v jiném tvaru)</div>
        <div class="flashcard-gloss-bar" hidden></div>
      </div>
    </div>` : "";
  flashcardBackEl.innerHTML = `
    <div class="flashcard-word">${segmentsToHtml(card.segments)}</div>
    <div class="flashcard-romaji">${card.romaji}</div>
    <div class="flashcard-english">${card.english}</div>
    ${exampleHtml}`;
  ```
- **Napojení listenerů** — hned za `innerHTML` (obsah se přepisuje každým renderem → navazuje se
  znovu na nové uzly, staré mizí s uzly; vzor jako `renderSentences`). **`stopPropagation` všude:**
  ```js
  if (ex) {
    const revealBtn = flashcardBackEl.querySelector(".fc-example-reveal");
    const revealBox = flashcardBackEl.querySelector(".fc-example-reveal-box");
    revealBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      flashcardExampleRevealed = revealBox.classList.toggle("visible");     // rozšíření 1
      revealBtn.textContent = flashcardExampleRevealed ? "Skrýt větu" : "Ukázat větu";
      if (!flashcardExampleRevealed) hideGloss(flashcardBackEl);
    });
    flashcardBackEl.querySelector(".fc-example-speak").addEventListener("click", (e) => {
      e.stopPropagation();
      speak(segmentsToPlainText(ex.segments));                              // čte VĚTU
    });
    flashcardBackEl.querySelector(".flashcard-example-jp").addEventListener("click", (e) => {
      const tok = e.target.closest(".gloss-token");
      if (!tok) return;
      e.stopPropagation();
      const i = +tok.dataset.seg;
      toggleGloss(flashcardBackEl, i, glossForToken(ex.segments[i], card), tok);
    });
    flashcardBackEl.querySelector(".flashcard-gloss-bar")
      .addEventListener("click", (e) => e.stopPropagation());
  }
  ```
- **Flip handler (426–433)** — přidat guard na začátek (rozšíření 4): otevřená glosa se zavře a
  klik neotočí:
  ```js
  flashcardEl.addEventListener("click", () => {
    const bar = flashcardBackEl.querySelector(".flashcard-gloss-bar");
    if (bar && !bar.hidden) { hideGloss(flashcardBackEl); return; }   // zavři glosu, neotoč
    flashcardFlipped = !flashcardFlipped;
    flashcardEl.classList.toggle("flipped", flashcardFlipped);
    if (flashcardFlipped) {
      const card = FLASHCARDS[flashcardOrder[flashcardIndex]];
      speak(segmentsToPlainText(card.segments));                      // flip dál čte SLOVO
    }
  });
  ```
- **Reset stavu při přechodu karty** — `goToFlashcard → renderFlashcard` přestaví `innerHTML`:
  glosa lišta zmizí (vždy), odhalení věty se řídí `flashcardExampleRevealed` (rozšíření 1, tj.
  **ne** nutně skryté). Uvnitř jedné karty flip tam/zpět `renderFlashcard` nevolá → stav drží.

### `style.css`
- Recyklovat `.reveal-btn`, `.speak-btn`, `.sentence-reveal(.visible)`, `.sentence-romaji`,
  `.sentence-translation`.
- Přidat:
  ```css
  .flashcard-example { width: 100%; margin-top: 0.6rem; }
  .flashcard-example-actions { display: flex; justify-content: center; }
  .flashcard-example-line { display: flex; align-items: flex-start; gap: 0.4rem;
    justify-content: center; }
  .flashcard-example-jp { font-size: 1.15rem; line-height: 1.9; overflow-wrap: anywhere; }
  .gloss-token { cursor: pointer; border-bottom: 1px dotted var(--accent); }
  .gloss-token.active { background: var(--accent-soft); border-radius: 4px; }
  .flashcard-example-note { font-size: 0.72rem; color: var(--text-muted); margin-top: 0.4rem; }
  .flashcard-gloss-bar { position: sticky; bottom: 0; margin-top: 0.5rem;
    padding: 0.4rem 0.6rem; background: var(--surface); border-top: 1px solid var(--border);
    font-size: 0.85rem; text-align: center; }
  .flashcard-gloss-bar .gloss-romaji { color: var(--accent); font-weight: 600; }
  ```
- **Přetečení (pevná výška 320px):** na zadní stranu scroll + robustní centrování (flex `center`
  ořezává horní část u přetečení):
  ```css
  .flashcard-back { overflow-y: auto; justify-content: flex-start; }
  .flashcard-back .flashcard-word { margin-top: auto; }
  .flashcard-back .flashcard-example { margin-bottom: auto; }
  ```
  Primární obrana je krátká věta (data). `position:sticky` lišta uvnitř scrollovatelné zadní
  strany drží glosu u dolní hrany.

### `index.html`
- Struktura beze změny (zadní strana je generovaná v JS). Volitelně hint (74).
- `?v=5` → `?v=6` na řádcích **15**, **314**, **315**.

### `service-worker.js`
- `CACHE_NAME` `"hiragana-cache-v6"` → `"hiragana-cache-v7"`.
- `APP_SHELL`: `style.css/data.js/app.js` `?v=5` → `?v=6`.

Bez nových závislostí, bez frameworku.

---

## Plán implementace

Pořadí je zvolené tak, aby **appka běžela po každém kroku** (guard `if (card.example)`).

1. **Vykreslení + CSS + `segmentsToHtml` (`hl`)** — bez dat vět.
   - _Hotovo když:_ appka běží, zadní strany jako dnes (žádná karta nemá `example` → žádné tlačítko).
2. **Rozšíření 1–3 (session paměť + 🔊 v odhalení + poznámka)** — malé UI úpravy v `renderFlashcard`
   a CSS.
   - _Hotovo když:_ po prvním „Ukázat větu“ zůstávají další karty odhalené až do „Skrýt větu“;
     🔊 je vidět až po odhalení; poznámka je pod větou. (Testovatelné až s pilotními daty v kroku 4;
     do té doby ověřit, že se nic nerozbilo.)
3. **Rozšíření 4 (glosy)** — `PARTICLE_GLOSS`, `glossForToken`, `exampleSegmentsToHtml`,
   `hideGloss`/`toggleGloss`, glosa lišta, guard ve flip handleru, CSS.
   - _Hotovo když:_ appka běží (bez dat glos nic nepadá; funkce jsou připravené).
4. **Pilot — 16 úvodních karet** (`data.js` 598–613) + **3 homonymní páry** (hana 花/鼻, kaeru
   かえる/帰る, hachi 蜂/八) + **`は` (zub)**, včetně konvence částic jako samostatné segmenty a pár
   `g` glos.
   - _Hotovo když:_ na těchto kartách jde: odhalit/skrýt (session paměť drží mezi kartami), 🔊 čte
     větu, cílové slovo tučně, klik na částici/cílové slovo/`g`-slovo otevře glosu v liště, klik na
     jiný token přepne, klik na aktivní token zavře, klik do prázdna zavře glosu (a neotočí),
     přechod karty glosu zavře, klik na token/🔊/reveal **neotočí** kartu, u homonym sedí význam,
     a dlouhá věta scrolluje uvnitř karty na 360px. Ověřit ručně v prohlížeči.
5. **Doplnění vět po dávkách** podle kategorií v `data.js`:

   | Dávka | Kategorie (řádky) | ~počet |
   |---|---|---|
   | 1 | Úvod + Animals + Food & drink (598–661) | ~60 |
   | 2 | Family + Body + Colors + Numbers (664–708) | ~35 |
   | 3 | Time & weather + Nature + Places + Transportation (711–751) | ~35 |
   | 4 | Home & objects + Clothing + Emotions (754–787) | ~30 |
   | 5 | School & work + Verbs (790–850) | ~35 |
   | 6 | i-adjectives + na-adjectives (853–904) | ~50 |
   | 7 | Days & calendar + Seasons + People & jobs + More places (907–955) | ~40 |
   | 8 | Meals & food + Study + Question words + Everyday + Adverbs (958–1001) | ~35 |

   Po **každé** dávce spustit verifikační skript a projet report dané dávky.
   - _Hotovo když:_ skript hlásí 0 strukturálních problémů a report významově sedí.
6. **Finální kontrola pokrytí.** `FLASHCARDS.length === 352`, všech 352 má validní `example`
   (segments+romaji+english, ≥1 `hl`). Homonyma a `は` ručně na význam.
   - _Hotovo když:_ `s example: 352, problemu: 0`.
7. **Bump verzí + nasazení.** `?v=6` v `index.html`; `CACHE_NAME` v7 + `?v=6` v `APP_SHELL`;
   kopie assetů (`data.js`, `app.js`, `style.css`, `index.html`, `service-worker.js`) do
   `hiragana-deploy/`, commit, `git push origin main`.
   - _Hotovo když:_ deploy repo má nový commit, push prošel, appka po hard-reloadu ukazuje věty a
     glosy a funguje offline (DevTools → Offline → odhalit větu + kliknout na částici).

### Verifikační skript (read-only, do scratchpadu)

```js
// node kontrola.js  — v adresáři hiragana/
const fs = require("fs");
const src = fs.readFileSync("data.js", "utf8");
const check = `
let problems = 0, withEx = 0;
FLASHCARDS.forEach((c, i) => {
  const word = c.segments.map(s => s.t).join("");
  const tag = i + " " + word + " (" + c.romaji + " / " + c.english + ")";
  const e = c.example;
  if (!e) { console.log("CHYBI example:", tag); problems++; return; }
  withEx++;
  if (!Array.isArray(e.segments) || !e.segments.length) { console.log("spatne segments:", tag); problems++; }
  if (!e.romaji) { console.log("chybi romaji:", tag); problems++; }
  if (!e.english) { console.log("chybi english:", tag); problems++; }
  if (!(e.segments || []).some(s => s.hl)) { console.log("zadny hl segment:", tag); problems++; }
  // klikatelné tokeny (kontrola, ze klicove castice jsou samostatne segmenty):
  const clickable = (e.segments || [])
    .filter(s => s.hl || PARTICLE_GLOSS[s.t] || s.g)
    .map(s => s.t).join(" ");
  // console.log(tag, "=>", e.segments.map(s => s.t).join(""), "| klik:", clickable, "| " + e.english);
});
console.log("---");
console.log("karet:", FLASHCARDS.length, " s example:", withEx, " problemu:", problems);
`;
eval(src + check);
```

Skript hlídá **strukturu** (přítomnost, tři složky, ≥1 `hl`) a umí vypsat klikatelné tokeny každé
věty (kontrola, že částice jsou samostatné segmenty). **Význam**, správnost časování a jazyk glos
ověří review autora (Claude) z reportu — řetězcem to nejde (食べる→食べます; „は“ vs. partikule).

---

## Rizika a co může selhat

- **Přetečení pevné karty (320px).** Nejvyšší riziko, teď navíc s poznámkou + glosa lištou.
  Mitigace: krátké věty (data) + `overflow-y` + sticky lišta. Ověřit nejdelší věty na 360px.
- **Slepené částice** (`{t:"りんごを"}`) → částice se neglosuje. Chytí review přes výpis
  klikatelných tokenů ve skriptu; autorská konvence „částice = samostatný segment“.
- **Zapomenutý `stopPropagation`** (token, lišta, 🔊, reveal) → klik otočí kartu. Ověřeno v pilotu.
- **Guard glosy vs. otočení** — klik do prázdna při otevřené glose ji jen zavře (neotočí); ověřit,
  že se tím nerozbilo běžné otáčení, když glosa není otevřená.
- **Session paměť matoucí?** Uživatel může být překvapen, že další karta je rovnou odhalená —
  je to schválené chování; „Skrýt větu“ ho vypne pro zbytek sezení.
- **Zapomenutý `hl`** → nic tučně / u „は“ tučně partikule. Chytí skript (≥1 `hl`) + review.
- **HTML v glosách** — do DOM se z tokenu dává jen číselný `data-seg` (index), texty glos se berou
  z JS objektů → žádné vkládání cizích textů do atributů. `PARTICLE_GLOSS`/`g` texty jsou plain
  (bez `<>&`), hlídá autor.
- **Jazyk glos** (částice cz, cílové slovo en) — vědomá nekonzistence, odpovídá appce.
- **Nezvýšená cache verze** → stará verze u uživatelů. Součást kroku 7 (akceptační kritérium).
- **TTS nedostupné** → `speak()` má guard; věta se přesto zobrazí, appka nespadne.

## Co tento návrh vědomě neřeší

- Věty/glosy v jiných záložkách (Kvíz, Psaní, Věty, Konverzace, Skládání) — mimo rozsah spec.
- Více vět k jednomu slovu / carousel; uživatelsky editovatelné věty; vlastní audio; gramatický
  rozbor; generování vět online.
- **Automatickou tokenizaci/segmentaci** vět — dělení na segmenty (a tím i klikatelnost částic) je
  na autorovi; runtime morfologická analýza je bez závislostí mimo rozsah.
- **Glosu pro každé slovo** — plná glosa jen u částic, cílového slova a slov s ručním `g`; ostatní
  zůstávají plain (záměr rozšíření 4).
- Perzistenci volby odhalení mezi sezeními (rozšíření 1 je in-memory; reload = reset).
- Refaktor pevné velikosti karty na dynamickou výšku — jen scroll uvnitř karty.
- Změnu formátu `SENTENCES`/konverzací — `hl`/`g`/`PARTICLE_GLOSS` jsou aditivní, jinde nepoužité.
