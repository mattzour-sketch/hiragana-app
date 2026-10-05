# Návrh: Slovo dne

## Co řešíme

Spec: `docs/specs/slovo-dne.md`. Jde o jedno nové slovo denně se třemi větami a tlačítkem „Naučeno“, které slovo pošle do SRS. Do „Opakování“ pak jdou jen slova, která uživatel zavedl.
Rozsah tohoto kroku: funkce + **dávka 1** vět (indexy 0–37 ve `FLASHCARDS`, 犬 … ペンギン = 38 slov).
Potvrzeno uživatelem: slovo zavádí jen „Naučeno“ nebo ✓/✗ v Kartičkách. Překlady zůstávají anglicky.

## Ověřený stav kódu (na čem plán stojí)

- `app.js` 143–185: SRS klíčované **plain textem slova** (`segmentsToPlainText(card.segments)`),
  záznam `{ box, due }`. Skriptem ověřeno: všech 352 klíčů je unikátních, žádná kolize homonym.
- `app.js` 174–185 `dueCardIndices()` počítá **karty bez záznamu jako due** (`!entry || …`). Tady je jádro změny.
- `app.js` 1131 **Psaní volá `scheduleSrs` u slovíček.** Každá odpověď v Psaní tedy dnes slovo
  zavede, což je v rozporu se spec. Kvíz (`handleAnswer`) SRS nevolá, tam je to v pořádku.
- `app.js` 211–215 `todayKey()` je **UTC** (`toISOString`). Spec to nechává mimo rozsah, pro Slovo dne je potřeba samostatná funkce pro místní datum.
- `app.js` 40–52 přepínání tabů je inline v listeneru. Z kódu nejde záložku přepnout programově, a to budou potřebovat odkazy „Slovo dne“ ↔ „Kartičky“.
- `app.js` 332–368 `glossForToken(seg, card)`, `exampleSegmentsToHtml(ex, card)`,
  `hideGloss(root)`, `toggleGloss(root, i, gloss, tok)` jsou generické (pracují s `root`), takže je jde použít znovu.
  `toggleGloss` rozlišuje token jen podle indexu segmentu (`data-seg`). Proto **každá věta musí mít
  vlastní root i vlastní lištu glosy**, jinak by se indexy z různých vět tloukly.
- `style.css` 462: `.flashcard-gloss-bar` má `position: sticky; bottom: 0`. Mimo kartu by se lepila ke
  spodku viewportu, takže ji v novém panelu potřebujeme přebít.
- `style.css` 251–320: `.sentence-card`, `.sentence-top`, `.sentence-text`, `.sentence-actions`,
  `.reveal-btn`, `.speak-btn`, `.sentence-reveal(.visible)` jsou hotový vzhled i chování záložky „Věty“.
- `index.html`: 9 tabů, výchozí `read` má `active` natvrdo (ř. 36 a 48). Verze assetů jsou `?v=7`
  (ř. 18, 317, 318), `service-worker.js` má `CACHE_NAME = "hiragana-cache-v8"` a `APP_SHELL` `?v=7`. SW je
  network-first a každý GET ukládá do cache.
- `tests/flashcard-examples.test.js` vytahuje funkce z `app.js` regexem `^function name(… ^}`. Nové
  testovatelné funkce proto musí být **top-level `function` deklarace s `}` na začátku řádku**
  a bez přístupu k DOM/`localStorage`.
- **Nasazení:** složka `hiragana-deploy` na disku **neexistuje**. Samotné `hiragana-app` má origin
  `github.com/mattzour-sketch/hiragana-app.git` a `origin/main == HEAD`. Deploy tedy znamená commit a push tohoto repa (viz Rizika).
- `tests/` a `docs/` jsou v gitu **untracked**.

## Zvažované varianty

### A) Umístění v UI

| Varianta | Pro | Proti |
|---|---|---|
| **Nová 1. záložka „Slovo dne“, výchozí** (zvoleno) | Přesně podle spec (AC „první v navigaci, aktivní po otevření“). Nav je horizontálně scrollovatelný a první pozice je vždy vidět. Nic stávajícího se nepřestavuje | 10 tabů, „Pokrok“ a „Kvíz“ se odsunou víc doprava |
| Blok nahoře v „Čtení“ | Počet tabů se nemění | Čtení je tabulka znaků, tohle je jiný úkol. Porušuje AC. Ve skutečnosti zakládá domovskou obrazovku „Dnes“, která je mimo rozsah |
| Třetí chip „Nové slovo“ v Kartičkách | Sedí k opakování, tab nepřibude | Porušuje AC. Pevná karta 280×320 px 3 věty nepojme, panel by musel mít dva různé layouty |

Počet tabů neřeším tady. Doporučuju ho vzít jako **samostatný krok** (např. sloučit Věty + Konverzace
a Gramatika + Skládání vět, tím se dostaneme zpět na 8).

### B) Uložený stav Slova dne

| Varianta | Pro | Proti |
|---|---|---|
| **`{ date, key }`, kde key = plain text slova** (zvoleno) | Stejný klíč jako SRS. Přežije přeřazení i vložení karet v `data.js`. Neznámý klíč = poškozený stav → určí se znovu | O něco delší hodnota |
| `{ date, index }` | Krátké | Vložení karty (budoucí rozšíření slovníku) tiše posune slovo |
| Samostatně slovo dne a „aktuální“ slovo | Věrně kopíruje pojmy spec | K zobrazení stačí jen aktuální slovo, druhé pole by nic nepřinášelo |

### C) Zavedení slova tlačítkem „Naučeno“

| Varianta | Pro | Proti |
|---|---|---|
| **Nová funkce „zaveď, pokud chybí“: box 0, due = teď + 10 min** (zvoleno) | Idempotentní, záznam nepřepíše. Sedí na AC „přihrádka 0 / 10 min“ | Další funkce v SRS bloku |
| `scheduleSrs(key, true)` | Žádný nový kód | Dá box 1 (1 den) a přepíše existující záznam, čímž porušuje dvě AC |

## Zvolené řešení

Nová první záložka `wordOfDay` s obsahem renderovaným v JS. Stav v jednom novém klíči v `localStorage`. Den
se počítá podle místního data. Pravidlo výběru je **bezstavové vůči historii**: při každém otevření záložky
platí, že když uložený stav je dnešní a platný, ukáže se uložené slovo, jinak první nezavedené v pořadí
`FLASHCARDS`. Tím jsou bez dalšího kódu splněné i vynechané dny, nepotvrzené včerejší slovo i posun hodin
zpět. Věty použijí existující renderer i glosy z kartičky a vzhled z „Věty“. Změna sémantiky SRS je
jedna podmínka v `dueCardIndices` plus guard v Psaní.

Obětováno: počet tabů (řešit zvlášť) a další růst monolitu `app.js`. Nový soubor JS nezakládám, protože by
znamenal další `<script>` a další položku v `APP_SHELL` a jeho přínos by byl jen kosmetický.

## Změny datového modelu

### localStorage

| Klíč | Stav | Tvar |
|---|---|---|
| `hiragana-word-of-day` | **nový** | `{ "date": "2026-09-27", "key": "犬" }` (`date` = místní datum, `key` = plain text slova) |
| `hiragana-srs` | beze změny tvaru | `{ [key]: { box, due } }`. Nově platí: **zavedené slovo = má záznam** |
| `hiragana-activity` | beze změny | Naučeno přičte +1 jen při skutečném zavedení |

**Validace při čtení** `hiragana-word-of-day`: JSON se musí dát naparsovat, `date` musí odpovídat `^\d{4}-\d{2}-\d{2}$`,
`key` musí být string a existovat ve `FLASHCARDS`. Jinak se stav zahodí a určí znovu. SRS se nikdy nesahá.

**Migrace stávajících uživatelů:** žádný přepis dat ani verze schématu, mění se jen výklad:
- slova se SRS záznamem jsou zavedená a termíny zůstanou,
- slova bez záznamu z „Opakování“ zmizí (dřív byla due, protože `!entry`),
- uživatel bez záznamů uvidí prázdné „Opakování“ s odkazem na Slovo dne,
- záznamy, které dřív vznikly v Psaní, se berou jako zavedené (spec: „má záznam = zavedené“).

### Místní datum

Nová `localDateKey(date)` vrací `YYYY-MM-DD` z `getFullYear/getMonth/getDate`, tedy **ne** z `toISOString`.
`todayKey()` (UTC, aktivita) zůstává, protože sjednocení je podle spec mimo rozsah. Důsledek: „Naučeno“ mezi 00:00
a 02:00 SELČ se v grafu aktivity připíše předchozímu dni. To už dnes platí pro všechny odpovědi.

### `examples` v `data.js`

Tvar přesně podle spec. Nové pole na kartě vedle `example`:

```
examples: [ { segments: [{ t, f?, hl?, g? }], romaji, english }, { … } ]   // právě 2
```

- Konvence stejné jako u `example`: částice jako **samostatné segmenty** (klikací glosa z `PARTICLE_GLOSS`),
  `hl: true` na cílovém slově včetně koncovky u časovaných tvarů, `g` u dalších obsahových slov. Texty
  nesmí obsahovat `< > &`.
- Karta bez `examples` je během dávek 2–8 platná. Seznam vět karty je `example` plus `examples`, pokud jsou.
- Zvýraznění: `exampleSegmentsToHtml` už obaluje `hl` do `<strong>`, na rendereru se nic nemění.
- Homonyma v dávce 1: 花 (květina), かえる (žába), はち (včela). Věta musí nést význam karty a musí se to projevit
  v anglickém překladu věty.

## Dopad na kód

### `app.js`

**Pure helpery** (top-level, bez DOM a `localStorage`, testovatelné):
- `localDateKey(date)` → `"YYYY-MM-DD"` místně. Umístit vedle `todayKey`.
- `dueIndicesFrom(cards, srs, now)` → indexy karet **se záznamem** a `due <= now`, seřazené podle `due`.
  `dueCardIndices()` se stane tenkým obalem (`loadSrs()`, `Date.now()`). Změna chování je tady.
- `introduceInSrs(srs, key, now)` → `true`, pokud záznam přidal (`{ box: 0, due: now + SRS_INTERVALS_MS[0] }`),
  `false`, pokud už existoval (nepřepisuje ho).
- `firstUnintroducedIndex(cards, srs)` → index, nebo `-1`.
- `parseWordOfDayState(raw, cards)` → `{ date, key }` nebo `null` (validace viz výše).
- `resolveWordOfDay(state, today, cards, srs)` → `{ date, key }` nebo `null` (vše zavedeno). Když je stav dnešní,
  vrátí ho, jinak `{ today, klíč prvního nezavedeného }`.
- `sentencesForCard(card)` → `[card.example, ...(card.examples || [])]` bez prázdných hodnot.

**SRS/obaly s I/O** (SRS blok 141–209):
- `introduceCard(key)` = load → `introduceInSrs` → save. Při `true` volá `recordActivity()`.
- `introducedCount()` = počet karet se záznamem.
- Komentář u `dueCardIndices` („never reviewed count as due“) přepsat.

**Taby** (40–52): vytáhnout listener do `showTab(id)`, který řeší třídy a refresh podle záložky. Nově navíc
`wordOfDay` → `renderWordOfDay()`. Listener pak jen volá `showTab`. Chování ostatních tabů se nemění.

**Nová sekce `// --- Word of the day ---`** (za Flashcards):
- `renderWordOfDay()`: načte stav → `resolveWordOfDay` → uloží → vykreslí do `#wodContent`:
  - hlavička: slovo (`segmentsToHtml`, furigana), romaji, anglický význam, 🔊 slova,
  - stav: nezavedené → primární tlačítko „Naučeno“; zavedené → text „V opakování“ a tlačítko „Další slovo“,
  - věty z `sentencesForCard`. Každá je `.sentence-card[data-sent=i]` se vzhledem z „Věty“: JP text přes
    `exampleSegmentsToHtml(ex, card)`, 🔊 věty, „Ukázat čtení a překlad“/„Skrýt“ a **vlastní lišta glosy
    mimo reveal-box**, protože JP text je vidět hned a tokeny jsou klikací bez odhalení,
  - `resolve` vrátí `null` nebo po Naučeno už žádné nezavedené nezbývá → prázdný stav „Všechna slova jsou
    v opakování“ s tlačítkem „Kartičky“ (`showTab("flashcards")`). Tady se vědomě rozhoduje pro tabulku
    okrajových případů místo AC „do konce dne stejné slovo“, které platí jen do chvíle, než dojdou slova.
- **Jeden delegovaný listener** na `#wodContent`, navázaný jednou (obsah se přepisuje, kontejner ne):
  `[data-action=learn]` → `introduceCard` → `renderWordOfDay()`;
  `[data-action=next]` → uložit `{ today, první nezavedené }` → render;
  🔊 / reveal / `.gloss-token` → root = nejbližší `.sentence-card`, `toggleGloss(root, …)` s
  `sentencesForCard(card)[data-sent]`; klik jinam ve větě → `hideGloss(root)`.
- Při načtení se `renderWordOfDay()` volá jednou (jako `renderProgress()`). Přes půlnoc se nic nepřepočítává
  bez reloadu nebo nového otevření záložky, což je chování podle spec.

**Kartičky**:
- `renderFlashcard()` prázdný stav (408–424): mezi „Dávka hotová“ a „Nic k opakování“ přidat větev
  `introducedCount() === 0` → titulek „Opakování je prázdné“, text „Slova do opakování přidáš ve Slově
  dne.“, tlačítko „Slovo dne“. Stávající texty ostatních větví zůstávají.
- `answerFlashcard` se nemění (✓/✗ nezavedené karty v „Všech kartách“ ji zavede přes `scheduleSrs`).

**Psaní** (1131): `scheduleSrs` volat jen u **už zavedeného** slovíčka. Zavedené slovo se dál přeplánuje jako
dnes, nezavedené se nezavede. Kvíz beze změny.

**Pokrok** (1215–1231): `scheduled = introducedCount() - due` (dnes `FLASHCARDS.length - due`, po změně by to
bylo špatně). Přidat čtvrtý `.srs-stat` „v opakování“ s hodnotou `X / 352`. Pruhy „Slovíčka“ zůstávají.

### `index.html`
- Nový první tab `<button class="tab-btn active" data-tab="wordOfDay">Slovo dne</button>`, z `read` odebrat `active`.
- Nová první sekce `<section id="wordOfDay" class="tab-panel active">` s kontejnerem `#wodContent`.
- V `#flashcardEmpty` přidat skryté tlačítko `#flashcardGoWord` („Slovo dne“).
- `?v=7` → `?v=8` (ř. 18, 317, 318).

### `style.css`
Použít znovu `.sentence-card`, `.sentence-*`, `.reveal-btn`, `.speak-btn`, `.primary-btn`, `.gloss-token` a `.flashcard-empty`.
Přidat jen `.wod-head` (velké slovo, romaji, význam, 🔊), `.wod-status` a
`.wod-sentences .flashcard-gloss-bar { position: static; }`. Tmavý režim pokrývají existující proměnné.

### `service-worker.js`
`CACHE_NAME` → `"hiragana-cache-v9"`, v `APP_SHELL` `?v=7` → `?v=8`. Strategie (network-first) beze změny.

### `data.js`
Dávka 1: `examples` (2 věty) u karet 0–37. Nic jiného.

### Testy
- **Nový `tests/word-of-day.test.js`** (vzor: `node:test`, eval reálného `data.js` a funkcí vytažených z `app.js`):
  - `localDateKey`: `new Date(2026, 8, 27, 23, 30)` → `2026-09-27`, `new Date(2026, 8, 28, 0, 30)` → `…-28`.
  - `resolveWordOfDay`: prázdný stav → první nezavedené; stejný den → stejné slovo i po zavedení; nový den a
    včerejší slovo nezavedené → totéž slovo; nový den a zavedené → další; N dní pauza → jedno slovo;
    starší datum (posun hodin) → první nezavedené; vše zavedeno → `null`.
  - `parseWordOfDayState`: nevalidní JSON, chybějící pole, špatné datum nebo neznámý klíč → `null`.
  - `introduceInSrs`: nový záznam box 0 a due +10 min; druhé volání vrátí `false` a záznam se nezmění.
  - `dueIndicesFrom`: karta bez záznamu **není** due; záznam s `due <= now` je, `due > now` není.
  - `sentencesForCard`: bez `examples` → 1 věta; s `examples` → 3.
- **Rozšířit `tests/flashcard-examples.test.js`** o data `examples`:
  - validátor rozdělit na `validateSentence(s, card)` (segments, romaji, english, ≥1 `hl`, stem pravidlo)
    a použít ho pro `example` i pro každou položku `examples`,
  - `examples` buď chybí, nebo má **právě 2** položky,
  - postup dávek: konstanta `EXAMPLES_DONE_UNTIL = 38`, tj. karty `< 38` `examples` mít musí. Po každé dávce se
    konstanta posune, po dávce 8 se test změní na „všech 352“,
  - 3 japonské texty karty jsou po dvou různé,
  - heuristika „ne jen záměna slova“: dvě věty karty se stejným počtem segmentů, které se liší
    v ≤ 1 segmentu, test shodí. Na falešné poplachy bude allowlist s komentářem,
  - homonyma dávky 1 (花/flower, かえる/frog, はち/bee): překlad obou nových vět obsahuje význam karty,
  - `< > &` a test částic jako samostatných segmentů rozšířit i na `examples`.
- Spouštění: `node --test` (Node 22 je k dispozici).

## Plán implementace

Aplikace jde spustit po každém kroku (`python -m http.server 8732` podle `.claude/launch.json`).

1. **Pure helpery + unit testy** (`localDateKey`, `dueIndicesFrom`, `introduceInSrs`,
   `firstUnintroducedIndex`, `parseWordOfDayState`, `resolveWordOfDay`, `sentencesForCard`).
   `dueIndicesFrom` zatím napsat, ale `dueCardIndices` na něj ještě nepřepínat.
   _Hotovo:_ `node --test` je zelený, aplikace se chová jako dřív.
2. **Záložka Slovo dne** (`showTab`, HTML tab a sekce, `renderWordOfDay`, delegovaný listener, CSS,
   `introduceCard`, prázdný stav).
   _Hotovo:_ aplikace otevře Slovo dne. Při čistém `localStorage` ukáže 犬 s 1 větou. Naučeno vytvoří
   `hiragana-srs["犬"] = {box:0, …}` a zobrazí „V opakování“ a „Další slovo“. Druhé Naučeno (dvojklik) záznam
   nezmění. „Další slovo“ → 猫, a po přepnutí tabu i po reloadu zůstane 猫. Když se v DevTools `date` přepíše
   na včerejšek, reload ukáže první nezavedené. Rozbitý JSON v klíči nezpůsobí pád. Glosy fungují zvlášť
   v každé větě a lišta se nelepí ke spodku obrazovky.
3. **Přepnutí sémantiky SRS** (`dueCardIndices` → `dueIndicesFrom`, `introducedCount`, guard v Psaní,
   prázdný stav Kartiček s tlačítkem, Pokrok).
   _Hotovo:_ čistý profil → chip „Opakování (0)“ a prázdný stav s tlačítkem, které otevře Slovo dne. Naučeno →
   za 10 min je slovo v Opakování. ✓ na nezavedenou kartu ve „Všech kartách“ ji zavede. Odpověď na slovíčko
   v Psaní `hiragana-srs` nezmění, pokud slovo nebylo zavedené. Pokrok ukazuje „Zavedeno X / 352“ a
   „naplánováno“ = zavedeno − due. Profil se staršími SRS záznamy si termíny zachová.
4. **Dávka 1 vět** (karty 0–37, 76 vět) + datové testy (`EXAMPLES_DONE_UNTIL = 38`).
   _Hotovo:_ testy jsou zelené. Ruční review výpisu tří vět u každé karty (význam, různá vazba nebo tvar,
   začátečnická úroveň). Ve Slově dne je u 犬 vidět 3 věty, u 米 (index 38) 1 věta bez chyby.
5. **Verze, cache a nasazení**: `?v=8`, `hiragana-cache-v9`, commit (včetně `tests/` a `docs/`), push.
   _Hotovo:_ po reloadu je vidět nová verze. DevTools → Offline → reload → Slovo dne včetně vět funguje a
   stav přežije.

## Rizika a co může selhat

- **Změna chování pro stávající uživatele**: Opakování se výrazně zmenší nebo vyprázdní. Je to záměr spec, ale
  bez vysvětlení to může vypadat jako ztráta dat. Mitigace: prázdný stav s odkazem, data se nemažou.
- **Psaní dnes tiše zavádí slova** (ř. 1131). Pokud guard vynecháme, AC „Psaní nezavádí“ tiše neplatí. Je to
  v kroku 3 a ověřuje se to ručně.
- **Konflikt AC** „stejné slovo do konce dne“ vs. „vše zavedeno → prázdný stav“: řešeno ve prospěch
  prázdného stavu (viz výše). Týká se jen posledního slova.
- **Půlnoc s otevřenou aplikací**: slovo se přepočítá až při otevření záložky nebo reloadu, přesně podle spec.
  PWA na mobilu obnovená z pozadí bez reloadu může ukazovat včerejší slovo, dokud uživatel nepřepne tab.
- **UTC vs. místní datum**: aktivita z Naučeno se kolem půlnoci připíše jinému dni než Slovo dne. Známý dluh,
  mimo rozsah.
- **Klíč = plain text slova**: kdyby se později přidala karta se stejným zápisem, sdílela by SRS i stav. Dnes
  ověřeno 352/352 unikátních a hlídá to test.
- **Lišta glosy**: sdílená lišta pro víc vět by kvůli indexům `data-seg` glosovala špatné slovo, proto má každá
  věta vlastní root. Bez CSS override je lišta `sticky`.
- **Kvalita 76 vět**: homonyma, šablonovité věty, nesamostatné částice. Testy chytí strukturu a část heuristik,
  význam hlídá review.
- **Extrakce funkcí v testech regexem**: funkce, která nebude top-level `function … }` od kraje řádku, test nenajde
  (hlasitý pád, ne tichý).
- **Nasazení**: spec zmiňuje `hiragana-deploy`, ale na disku není. Repo `hiragana-app` samo míří na GitHub
  `hiragana-app.git`. Před krokem 5 je potřeba ověřit, odkud se web servíruje (GitHub Pages z tohoto repa?).
- **Zapomenutý bump verze** → uživatelé offline dostanou starý `app.js` s novým `index.html`. Je to součást kroku 5.

## Co tento návrh vědomě neřeší

- Dávky vět 2–8 (kód s chybějícími `examples` počítá).
- Snížení počtu tabů a konsolidaci navigace (samostatný krok).
- Přepnutí `todayKey`/aktivity na místní čas.
- Rozdělení `app.js` do modulů.
- Změnu výběru slov v Kvízu a Psaní (dál všech 352). Změnu SRS v Psaní jen omezuji na zavedená slova.
- Denní cíl, série, notifikace, domovskou obrazovku „Dnes“, české překlady vět, volbu pořadí slov.
