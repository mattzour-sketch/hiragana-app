# Příkladová věta na kartičce se slovíčkem

> Business-analytická specifikace (user stories + akceptační kritéria).
> Nepopisuje implementaci ani datový model — jen chování, které musí být ověřitelné.

## Kontext

Kartička teď ukazuje slovo izolovaně: přední strana obrázek (emoji) nebo u abstraktních slov
anglický význam, zadní strana slovo s furiganou + romaji + anglický překlad. Student vidí slovo,
ale ne **jak se používá** — s jakými partikulemi, v jaké vazbě, jak se sloveso/přídavné jméno
chová ve větě. To je nejcennější právě u sloves a přídavných jmen (ve slovníkovém tvaru) a u
abstraktních slov, kde chybí obrázková opora.

Cílem je ke slovíčku přidat jednu krátkou příkladovou větu ve stejném formátu, jaký appka už
používá u záložky „Věty“ (`SENTENCES`) — japonsky s furiganou, romaji a anglickým překladem —
aby student viděl slovo v přirozeném kontextu, aniž by opustil kartičky. Věta je na zadní straně
skrytá za tlačítkem a odhalí se až na vyžádání, aby zadní strana zůstala čistá.

## User stories

- Jako student japonštiny chci u slovíčka na kartičce vidět jednu krátkou příkladovou větu,
  abych viděl, jak se slovo přirozeně používá v kontextu, ne jen jeho izolovaný překlad.
- Jako student chci mít u příkladové věty čtení (furigana + romaji) a anglický překlad,
  abych větě rozuměl, i když v ní jsou znaky nebo slova, která ještě neznám.
- Jako student chci, aby příkladová věta nerušila stávající učení (otáčení karty, hodnocení
  SRS ✓/✗, čtení slova nahlas), abych mohl kartičky používat stejně jako dosud.

## Akceptační kritéria

- [ ] Given data kartiček, Then **každá z 352 karet** má právě jednu příkladovou větu ve formátu
      `segments` (s furiganou) + `romaji` + `english`, uloženou staticky v datech appky.
- [ ] Given libovolná karta, Then japonský text její věty **obsahuje cílové slovo** — u
      podstatných jmen a neměnných slov doslovně, u sloves a přídavných jmen i v časovaném /
      odvozeném tvaru se stejným slovníkovým kmenem (např. karta „食べる / to eat“ smí mít větu
      s „食べます“ nebo „食べたい“). Kritérium je splněno i pro tvar odvozený od slovníkového.
- [ ] Given homonymní karty (はな = 花 květina vs. 鼻 nos, かえる = žába vs. 帰る vrátit se,
      は = 歯 zub), Then přiřazená věta odpovídá **významu dané karty**, ne jen shodě řetězce/romaji.
- [ ] Given zadní strana karty, When se na ni dostanu otočením, Then je věta **skrytá** a vidím
      jen tlačítko „Ukázat větu“ a tlačítko 🔊; zbytek zadní strany (slovo, romaji, překlad)
      vypadá a funguje jako dnes.
- [ ] Given skrytá věta, When kliknu na „Ukázat větu“, Then se zobrazí japonská věta s furiganou,
      její **romaji čtení i anglický překlad**. When kliknu znovu, Then se věta zase skryje
      (toggle) — stejné chování jako „Ukázat čtení a překlad“ v záložce „Věty“.
- [ ] Given zobrazená věta, Then je cílové slovo ve větě vizuálně zvýrazněné **tučně**.
- [ ] Given zadní strana karty, When kliknu na tlačítko 🔊, Then se přehraje **japonská věta**
      přes TTS (`speak()`) a karta se **neotočí**.
- [ ] Given tlačítka „Ukázat větu“ i 🔊, When na kterékoli z nich kliknu, Then se karta **neotočí**
      (klik zastaví propagaci a nepustí se na handler otočení).
- [ ] Given furigana ve větě, Then se vykresluje stejně jako věty v záložce „Věty“ (ruby nad
      znakem přes `segmentsToHtml`), tedy vizuálně konzistentně.
- [ ] Given věta, Then její `romaji` odpovídá čtení celé japonské věty (ne jen cílového slova)
      a anglický překlad odpovídá významu věty.
- [ ] Given karta s větou, When kartu otočím (klikem mimo tlačítka věty), ohodnotím ✓/✗,
      použiji Předchozí / Další / Zamíchat nebo nechám přehrát **slovo** nahlas, Then všechny tyto
      funkce fungují beze změny (žádná regrese v SRS ani v ovládání).
- [ ] Given odhalená věta, When přejdu na jinou kartu (Další / Předchozí / Zamíchat / ohodnocení),
      Then nová karta začíná se **skrytou** větou (stav odhalení se resetuje).
- [ ] Given appka spuštěná **offline** (PWA), When otevřu kartičku a odhalím větu, Then se věta,
      její čtení i překlad zobrazí bez připojení k síti.
- [ ] Given telefon o šířce ~360 px, When je věta delší, Then se text zalomí nebo posouvá v rámci
      karty a nevytlačí tlačítka ✓/✗ mimo obrazovku.
- [ ] Given hotová změna, Then je před vydáním navýšené `?v=` u assetů (`style.css`, `data.js`,
      `app.js`), zvýšené číslo cache v `service-worker.js` (`CACHE_NAME` i verze v `APP_SHELL`),
      a změna je nasazená do `hiragana-deploy` a **pushnutá na GitHub**.

## Okrajové případy a chybové stavy

| Situace | Očekávané chování |
|---|---|
| Karta bez věty | Nemá nastat — každá z 352 karet musí mít větu; chybějící věta je vada dat k odhalení při review. |
| Sloveso/přídavné jméno ve slovníkovém tvaru | Věta smí slovo časovat; „obsahuje slovo“ platí i pro tvar odvozený od slovníkového kmene. |
| Homonyma (stejný zápis/romaji, jiný význam) | Věta sedí na význam konkrétní karty, ne jen na řetězec. |
| Slovo je samo fráze/pozdrav (ありがとう, さようなら) | Věta frázi přirozeně obsahuje nebo ji rozšiřuje; žádná karta není z pokrytí vyňata. |
| Velmi dlouhá věta na malém displeji | Text se zalomí / posouvá uvnitř karty; ovládací tlačítka zůstanou dostupná. |
| Klik na „Ukázat větu“ nebo 🔊 | Zastaví propagaci — kartu **neotočí**. |
| Přechod na další kartu s odhalenou větou | Nová karta má větu opět skrytou (reset stavu odhalení). |
| TTS (čtení nahlas) není v prohlížeči k dispozici | Věta se stále zobrazí jako text; přehrání je best-effort, appka nespadne. |
| Duplicitní emoji/romaji u dvou karet | Každá karta má vlastní, významově správnou větu. |

## Mimo rozsah

- Přidání příkladových vět do jiných záložek (Kvíz, Psaní, Věty, Konverzace, Skládání vět,
  přehledové tabulky) — tato specifikace se týká **jen kartiček**.
- Více vět k jednomu slovu / procházení vět (carousel).
- Uživatelsky psané nebo editovatelné věty.
- Vlastní audio nahrávky nad rámec stávajícího TTS.
- Gramatické vysvětlení věty nebo rozbor partikulí.
- Generování vět za běhu přes online API/slovník (appka je offline-first).

## Rozhodnutí

Nahrazuje původní otevřené otázky — vše potvrzeno produktem.

1. **Zdroj a pokrytí:** příkladová věta ke **každému z 352 slov**. Věty ručně píše a ověřuje
   vývojář (Claude) po dávkách, ve formátu jako `SENTENCES` (`segments` s furiganou + `romaji`
   + `english`). Uložené **staticky v datech** kvůli offline režimu.
2. **Zobrazení:** věta je na zadní straně skrytá za tlačítkem **„Ukázat větu“**; zadní strana
   zůstává čistá, dokud uživatel neklikne. Chování (odhalit/skrýt, toggle) je jako u tlačítka
   „Ukázat čtení a překlad“ v záložce „Věty“.
3. **Čtení nahlas:** vlastní tlačítko **🔊** na zadní straně přehraje větu přes `speak()`.
4. **Zvýraznění:** cílové slovo je ve větě **tučně**.
5. **Ochrana otočení:** klik na „Ukázat větu“ i na 🔊 **zastaví propagaci** — nesmí otočit kartu.
6. **Nasazení:** bump `?v=` u assetů, zvýšení cache verze v `service-worker.js`, deploy do
   `hiragana-deploy` a push na GitHub.

## Předpoklady

- PŘEDPOKLAD: Požadavek se týká pouze záložky **Kartičky**; ostatní rozhraní zůstávají beze změny.
- PŘEDPOKLAD: Ke slovu se váže **jedna** věta (ne seznam k prolistování).
- PŘEDPOKLAD: Věty jsou uložené **staticky v datech appky** (kvůli offline režimu), ve stejném
  tvaru jako `SENTENCES` (japonský text s furiganou + romaji + anglický překlad).
- PŘEDPOKLAD: Věta má vždy všechny tři složky (furigana, romaji, english); nestačí jen japonský text.
- PŘEDPOKLAD: Věty se drží slovní zásoby a úrovně existujících `SENTENCES` (krátké, jednoduché,
  začátečnické), aby nepřidávaly zbytečně těžké nové znaky.
