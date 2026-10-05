# Slovo dne

> Business-analytická specifikace (user stories + akceptační kritéria).
> Popisuje chování a tvar obsahu, ne implementaci.

## Kontext

Aplikace nemá denní rytmus ani řízený přísun nových slov. Záložka Kartičky v režimu „Opakování“
dnes počítá **každé dosud neviděné slovo jako k opakování** — nový uživatel má první den 352 karet
„k opakování“ po dávkách 20, bez rozlišení nové/opakované. Každé slovo má navíc jen jednu
příkladovou větu (`example`), u většiny slov jediný kontext v celé aplikaci.

Slovo dne dává uživateli jeden jasný denní úkol: jedno nové slovo, tři věty s jeho použitím,
potvrzení „Naučeno“ → slovo vstoupí do spaced repetition. Kdo chce víc, vezme si další slovo.
Opakování se tím omezí na slova, která uživatel skutečně zavedl.

## Pojmy

- **Zavedené slovo** = slovo, které má záznam v SRS; v UI se tento stav všude jmenuje **„v opakování“**
  (slovo „zavedeno“ se v UI nepoužívá). Slovo se zavede (a) potvrzením „Naučeno“ ve
  Slově dne, nebo (b) ohodnocením ✓/✗ v Kartičkách. Samotné otočení karty ani odpověď v Kvízu
  či Psaní slovo **nezavádí**.
- **Pořadí osnovy** = pořadí karet v `FLASHCARDS` (data.js).
- **Den** = kalendářní den v místním čase zařízení (hranice o místní půlnoci).

## User stories

- Jako začátečník chci každý den dostat jedno nové slovo se třemi větami, ve kterých se používá,
  abych si ho zafixoval v kontextu a měl důvod se denně vracet.
- Jako motivovaný student chci si vzít další nové slovo hned, abych nebyl omezen tempem 1 slovo/den.
- Jako student chci, aby se naučené slovo samo zařadilo do opakování a v opakování byla jen slova,
  která jsem už zavedl, abych nedostával k „opakování“ slova, která jsem nikdy neviděl.

## Akceptační kritéria

### Výběr a zobrazení slova
- [ ] Given aplikace, Then existuje záložka **„Slovo dne“** jako první v navigaci a je aktivní
      po otevření aplikace.
- [ ] Given první zobrazení Slova dne v daném dni, Then se slovem dne stane **první nezavedené slovo
      v pořadí osnovy** a pro tento den se zafixuje.
- [ ] Given slovo dne je určené, When stránku znovu načtu, přepnu záložky nebo slovo mezitím zavedu
      (Naučeno / Kartičky), Then do konce dne vidím **stejné** slovo.
- [ ] Given nový den (po místní půlnoci), When otevřu Slovo dne, Then se určí nové slovo podle
      pravidla výše (bez ohledu na UTC).
- [ ] Given slovo dne, Then vidím slovo s furiganou, romaji, anglický význam, 🔊 pro slovo a
      **3 věty**: stávající `example` + 2 nové z `examples`.
- [ ] Given každá věta, Then má japonský text s furiganou, zvýrazněné (tučně) cílové slovo, 🔊 pro
      přehrání věty a tlačítko „Ukázat čtení a překlad“ (romaji + anglický překlad) se stejným
      chováním jako v záložce „Věty“. Klepnutí na slovo s glosou ukáže českou glosu jako na kartičce.

### Naučeno a další slovo
- [ ] Given nezavedené slovo dne, When kliknu **„Naučeno“**, Then se slovo zapíše do SRS do přihrádky 0
      (první opakování za 10 min podle `SRS_INTERVALS_MS`) a započítá se do dnešní aktivity.
- [ ] Given slovo je zavedené, Then místo „Naučeno“ vidím stav „V opakování“ a tlačítko
      **„Další slovo“**; věty zůstávají dostupné.
- [ ] When kliknu „Další slovo“, Then se zobrazí další nezavedené slovo v pořadí osnovy se stejnou
      obrazovkou (3 věty, Naučeno). Počet dalších slov za den není omezený.
- [ ] Given zobrazené další slovo, When přejdu jinam a vrátím se týž den, Then vidím naposledy
      otevřené slovo (ne znovu slovo dne).
- [ ] Given „Naučeno“ je kliknuto dvakrát / slovo už v SRS je, Then se SRS záznam **nepřepíše**
      a aktivita se nezapočítá podruhé.

### Vynechané dny
- [ ] Given uživatel N dní aplikaci neotevřel, When ji otevře, Then dostane **jedno** slovo dne
      (první nezavedené) — slova se nehromadí, nic se nepenalizuje.
- [ ] Given slovo dne včera nebylo potvrzené „Naučeno“, Then dnes je slovem dne znovu (je stále
      první nezavedené).

### Opakování (záložka Kartičky)
- [ ] Given režim „Opakování“, Then obsahuje **jen zavedená slova** s termínem opakování ≤ teď;
      počítadlo v chipu počítá totéž.
- [ ] Given žádné zavedené slovo, When otevřu „Opakování“, Then vidím prázdný stav s textem
      odkazujícím na Slovo dne (ne „Nic k opakování 🎉“ s časem).
- [ ] Given režim „Všechny karty“, Then procházení všech 352 karet funguje beze změny; When ohodnotím
      ✓/✗ nezavedenou kartu, Then se tím zavede (SRS jako dnes).
- [ ] Given dashboard Pokrok, Then „karet k opakování“ a „naplánováno na později“ počítají jen
      zavedená slova a přibude údaj **„X / 352 v opakování“**.

### Obsah a vydání
- [ ] Given data, Then **každá z 352 karet** má pole `examples` s **právě 2** větami (tvar viz níže).
- [ ] Given kterákoli karta, Then její 3 věty (`example` + 2× `examples`) mají **navzájem různý**
      japonský text a nejsou jen záměnou jednoho slova ve stejné šabloně.
- [ ] Given kterákoli nová věta, Then obsahuje cílové slovo **ve významu karty** (homonyma: 花/鼻,
      かえる žába / 帰る, 歯 vs. částice は, 赤 v 赤い vs. 赤ちゃん), u sloves a přídavných jmen smí být
      časované (stejný slovníkový kmen), a cílové slovo je označené `hl: true`.
- [ ] Given aplikace offline (PWA), Then Slovo dne včetně vět funguje bez sítě a stav přežije reload.
- [ ] Given hotová změna, Then je navýšené `?v=` u assetů, `CACHE_NAME` i verze v `APP_SHELL`
      v `service-worker.js`, nasazeno do `hiragana-deploy` a pushnuto na GitHub.

## Datový tvar nových vět

Na kartě přibude pole `examples` (pole 2 vět); stávající `example` zůstává beze změny (používá ho
Kartička). Každá věta má stejný tvar jako `example`:

```js
examples: [
  { segments: [ { t, f?, hl?, g?: { romaji, text } }, ... ], romaji, english },
  { ... },
]
```

- `segments` — japonský text po segmentech; `f` = furigana u kanji; `hl: true` na cílovém slově
  (u časovaného tvaru i na koncovce, jako dnes u sloves); `g` = česká glosa u ostatních obsahových
  slov (částice se glosují z `PARTICLE_GLOSS`, `g` nepotřebují).
- `romaji` — čtení celé věty; `english` — anglický překlad celé věty.
- Úroveň: krátké začátečnické věty ve slovní zásobě aplikace (jako `SENTENCES` / `example`).
- Rozmanitost: druhá a třetí věta ukazují jiné použití než `example` — jinou vazbu/částici, otázku,
  zápor nebo minulý čas (u sloves a přídavných jmen aspoň jeden jiný tvar než `-masu`/`-desu`
  v přítomném čase).

## Rozdělení obsahu do dávek

Věty píše a ověřuje vývojář po dávkách v pořadí osnovy (≈ 2 věty × 352 = 704 vět). Počty slov
v sekcích jsou orientační (podle komentářů v `FLASHCARDS`).

| Dávka | Sekce | Slov (cca) |
|---|---|---|
| 1 | úvodní blok (犬…日本) + Animals | 38 |
| 2 | Food & drink, Family, Body | 43 |
| 3 | Colors, Numbers, Time & weather, Nature, Places | 46 |
| 4 | Transportation, Home & objects, Clothing, Emotions & adjectives, School & work | 42 |
| 5 | Verbs | 54 |
| 6 | i-adjectives, na-adjectives | 50 |
| 7 | Days & calendar, Seasons & weather, People & jobs, More places | 43 |
| 8 | Meals & food, Study & communication, Question words, Everyday expressions, Adverbs & common words | 36 |

Funkci lze vydat po dávce 1. Dokud karta nemá `examples`, Slovo dne ukáže jen větu z `example`
(bez chyby). Kritérium „každá z 352 karet má 2 věty“ platí pro dokončení všech dávek.

## Okrajové případy a chybové stavy

| Situace | Očekávané chování |
|---|---|
| Všech 352 slov je zavedeno | Slovo dne ukáže prázdný stav „Všechna slova jsou v opakování“ s odkazem na Kartičky; „Další slovo“ se neukáže. |
| „Další slovo“ u posledního nezavedeného slova | Po Naučeno se zobrazí stejný prázdný stav jako výše. |
| Slovo dne zavedeno v Kartičkách dřív, než kliknu Naučeno | Slovo dne zůstává, ukáže stav „V opakování“ a „Další slovo“. |
| Aplikace otevřená přes půlnoc | Zobrazené slovo zůstane do reloadu / dalšího otevření záložky, pak se určí nové. |
| Změna data/časového pásma v zařízení | Slovo se určí podle místního data; návrat na už proběhlý den nepřidá nové slovo nad rámec pravidla „první nezavedené“. |
| Karta zatím bez `examples` (během dávek) | Zobrazí se jen `example`; žádná chyba, žádný prázdný blok. |
| TTS nedostupné | Texty se zobrazí, 🔊 nic nepřehraje, aplikace nespadne. |
| Poškozený/nečitelný uložený stav Slova dne | Stav se zahodí a slovo dne se určí znovu; SRS data zůstanou netknutá. |

## Dopad na stávající uživatele

- Slova, která už mají SRS záznam, jsou **zavedená** — jejich termíny a přihrádky se nemění.
- Slova bez SRS záznamu (i když byla procvičena v Kvízu/Psaní) jsou **nezavedená**: zmizí z fronty
  „Opakování“ a přijdou na řadu ve Slově dne podle pořadí osnovy. Statistiky Kvízu/Psaní zůstávají.
- Pro uživatele, který nic nezavedl, bude „Opakování“ prázdné, dokud nepoužije Slovo dne nebo
  neohodnotí kartu ve „Všech kartách“.
- Pruhy „Slovíčka“ na dashboardu (zvládnuto/rozpracováno) se počítají jako dnes.

## Mimo rozsah

- Změna výběru slov v Kvízu a Psaní (dál pracují se všemi 352 slovy).
- Denní cíl, série dní, notifikace, domovská obrazovka „Dnes“.
- Přepnutí evidence aktivity (`todayKey`) z UTC na místní čas — doporučeno jako samostatná změna.
- České překlady vět (překlady zůstávají anglicky, české jsou jen glosy slov).
- Výběr pořadí slov uživatelem, výběr podle obtížnosti nebo náhodně.
- Nové slovo do Konverzací, Vět nebo Skládání vět.

## Rozhodnutí

Potvrzeno uživatelem:
1. **Tempo:** 1 slovo denně + tlačítko „Další slovo“ pro ty, kdo chtějí víc.
2. **SRS:** nepředstavená slova se nepočítají k opakování; do opakování jde jen zavedené slovo.
3. **Věty:** ke každému slovu 2 nové ručně psané věty (≈ 700, po dávkách), celkem ≥ 3 ukázky,
   odpovídající významu karty.
4. **Jazyk:** překlady anglicky, české glosy slov jako dnes.

## Předpoklady

- PŘEDPOKLAD: V Kartičkách slovo zavádí **ohodnocení ✓/✗**, ne samotné otočení karty (jinak by
  prosté listování „Všemi kartami“ zavedlo desítky slov najednou).
- PŘEDPOKLAD: Odpověď na slovíčko v Kvízu ani Psaní slovo nezavádí.
- PŘEDPOKLAD: Pořadí osnovy = pořadí v `FLASHCARDS`; výběr není náhodný.
- PŘEDPOKLAD: Slovo dne je samostatná první záložka a výchozí po otevření; „Čtení“ se posune.
- PŘEDPOKLAD: U vět je japonský text vidět hned, romaji a překlad až po „Ukázat čtení a překlad“.

## Otevřené otázky

- Žádné blokující. K ověření s uživatelem jen předpoklad, že v Kartičkách zavádí slovo ohodnocení
  ✓/✗, ne otočení.
