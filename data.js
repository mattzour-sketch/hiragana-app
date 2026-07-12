// Hiragana data: character sets grouped by category
const HIRAGANA_BASIC = [
  ["あ","a"],["い","i"],["う","u"],["え","e"],["お","o"],
  ["か","ka"],["き","ki"],["く","ku"],["け","ke"],["こ","ko"],
  ["さ","sa"],["し","shi"],["す","su"],["せ","se"],["そ","so"],
  ["た","ta"],["ち","chi"],["つ","tsu"],["て","te"],["と","to"],
  ["な","na"],["に","ni"],["ぬ","nu"],["ね","ne"],["の","no"],
  ["は","ha"],["ひ","hi"],["ふ","fu"],["へ","he"],["ほ","ho"],
  ["ま","ma"],["み","mi"],["む","mu"],["め","me"],["も","mo"],
  ["や","ya"],["ゆ","yu"],["よ","yo"],
  ["ら","ra"],["り","ri"],["る","ru"],["れ","re"],["ろ","ro"],
  ["わ","wa"],["を","wo"],["ん","n"],
];

const HIRAGANA_DAKUTEN = [
  ["が","ga"],["ぎ","gi"],["ぐ","gu"],["げ","ge"],["ご","go"],
  ["ざ","za"],["じ","ji"],["ず","zu"],["ぜ","ze"],["ぞ","zo"],
  ["だ","da"],["ぢ","ji"],["づ","zu"],["で","de"],["ど","do"],
  ["ば","ba"],["び","bi"],["ぶ","bu"],["べ","be"],["ぼ","bo"],
  ["ぱ","pa"],["ぴ","pi"],["ぷ","pu"],["ぺ","pe"],["ぽ","po"],
];

const HIRAGANA_YOON = [
  ["きゃ","kya"],["きゅ","kyu"],["きょ","kyo"],
  ["しゃ","sha"],["しゅ","shu"],["しょ","sho"],
  ["ちゃ","cha"],["ちゅ","chu"],["ちょ","cho"],
  ["にゃ","nya"],["にゅ","nyu"],["にょ","nyo"],
  ["ひゃ","hya"],["ひゅ","hyu"],["ひょ","hyo"],
  ["みゃ","mya"],["みゅ","myu"],["みょ","myo"],
  ["りゃ","rya"],["りゅ","ryu"],["りょ","ryo"],
  ["ぎゃ","gya"],["ぎゅ","gyu"],["ぎょ","gyo"],
  ["じゃ","ja"],["じゅ","ju"],["じょ","jo"],
  ["びゃ","bya"],["びゅ","byu"],["びょ","byo"],
  ["ぴゃ","pya"],["ぴゅ","pyu"],["ぴょ","pyo"],
];

// Rows for the reading chart (basic gojuon layout, column-first order aeiou)
const BASIC_ROWS = [
  { label: "a-row", items: HIRAGANA_BASIC.slice(0,5) },
  { label: "ka", items: HIRAGANA_BASIC.slice(5,10) },
  { label: "sa", items: HIRAGANA_BASIC.slice(10,15) },
  { label: "ta", items: HIRAGANA_BASIC.slice(15,20) },
  { label: "na", items: HIRAGANA_BASIC.slice(20,25) },
  { label: "ha", items: HIRAGANA_BASIC.slice(25,30) },
  { label: "ma", items: HIRAGANA_BASIC.slice(30,35) },
  { label: "ya", items: [HIRAGANA_BASIC[35], null, HIRAGANA_BASIC[36], null, HIRAGANA_BASIC[37]] },
  { label: "ra", items: HIRAGANA_BASIC.slice(38,43) },
  { label: "wa", items: [HIRAGANA_BASIC[43], null, null, null, HIRAGANA_BASIC[44]] },
  { label: "n", items: [HIRAGANA_BASIC[45], null, null, null, null] },
];

const DAKUTEN_ROWS = [
  { label: "ga", items: HIRAGANA_DAKUTEN.slice(0,5) },
  { label: "za", items: HIRAGANA_DAKUTEN.slice(5,10) },
  { label: "da", items: HIRAGANA_DAKUTEN.slice(10,15) },
  { label: "ba", items: HIRAGANA_DAKUTEN.slice(15,20) },
  { label: "pa", items: HIRAGANA_DAKUTEN.slice(20,25) },
];

const YOON_ROWS = [
  { label: "kya", items: HIRAGANA_YOON.slice(0,3) },
  { label: "sha", items: HIRAGANA_YOON.slice(3,6) },
  { label: "cha", items: HIRAGANA_YOON.slice(6,9) },
  { label: "nya", items: HIRAGANA_YOON.slice(9,12) },
  { label: "hya", items: HIRAGANA_YOON.slice(12,15) },
  { label: "mya", items: HIRAGANA_YOON.slice(15,18) },
  { label: "rya", items: HIRAGANA_YOON.slice(18,21) },
  { label: "gya", items: HIRAGANA_YOON.slice(21,24) },
  { label: "ja", items: HIRAGANA_YOON.slice(24,27) },
  { label: "bya", items: HIRAGANA_YOON.slice(27,30) },
  { label: "pya", items: HIRAGANA_YOON.slice(30,33) },
];

// Sentences using real kanji, with furigana (hiragana reading) attached to each
// kanji segment so the reading shows above the kanji as ruby text.
// Each entry: { segments: [{t: text, f?: furigana}], romaji, english }
// A segment without `f` is plain kana/punctuation and is rendered as-is.
const SENTENCES = [
  { segments: [{ t: "こんにちは" }], romaji: "konnichiwa", english: "Hello. / Good afternoon." },
  { segments: [{ t: "おはよう" }], romaji: "ohayou", english: "Good morning." },
  { segments: [{ t: "ありがとう" }], romaji: "arigatou", english: "Thank you." },
  { segments: [{ t: "私", f: "わたし" }, { t: "は" }, { t: "学生", f: "がくせい" }, { t: "です" }],
    romaji: "watashi wa gakusei desu", english: "I am a student." },
  { segments: [{ t: "これは" }, { t: "本", f: "ほん" }, { t: "です" }],
    romaji: "kore wa hon desu", english: "This is a book." },
  { segments: [{ t: "あれは" }, { t: "猫", f: "ねこ" }, { t: "です" }],
    romaji: "are wa neko desu", english: "That is a cat." },
  { segments: [{ t: "今日", f: "きょう" }, { t: "は" }, { t: "暑", f: "あつ" }, { t: "いです" }],
    romaji: "kyou wa atsui desu", english: "Today is hot." },
  { segments: [{ t: "私", f: "わたし" }, { t: "は" }, { t: "日本語", f: "にほんご" }, { t: "を" }, { t: "勉強", f: "べんきょう" }, { t: "します" }],
    romaji: "watashi wa nihongo o benkyou shimasu", english: "I study Japanese." },
  { segments: [{ t: "毎日", f: "まいにち" }, { t: "コーヒーを" }, { t: "飲", f: "の" }, { t: "みます" }],
    romaji: "mainichi koohii o nomimasu", english: "I drink coffee every day." },
  { segments: [{ t: "学校", f: "がっこう" }, { t: "は" }, { t: "遠", f: "とお" }, { t: "いです" }],
    romaji: "gakkou wa tooi desu", english: "The school is far." },
  { segments: [{ t: "犬", f: "いぬ" }, { t: "が" }, { t: "好", f: "す" }, { t: "きです" }],
    romaji: "inu ga suki desu", english: "I like dogs." },
  { segments: [{ t: "今", f: "いま" }, { t: "何時", f: "なんじ" }, { t: "ですか" }],
    romaji: "ima nanji desu ka", english: "What time is it now?" },
  { segments: [{ t: "これはいくらですか" }],
    romaji: "kore wa ikura desu ka", english: "How much is this?" },
  { segments: [{ t: "明日", f: "あした" }, { t: "は" }, { t: "雨", f: "あめ" }, { t: "です" }],
    romaji: "ashita wa ame desu", english: "Tomorrow it will rain." },
  { segments: [{ t: "私", f: "わたし" }, { t: "の" }, { t: "名前", f: "なまえ" }, { t: "は" }, { t: "田中", f: "たなか" }, { t: "です" }],
    romaji: "watashi no namae wa tanaka desu", english: "My name is Tanaka." },
  { segments: [{ t: "寿司", f: "すし" }, { t: "が" }, { t: "食", f: "た" }, { t: "べたいです" }],
    romaji: "sushi ga tabetai desu", english: "I want to eat sushi." },
  { segments: [{ t: "ここに" }, { t: "座", f: "すわ" }, { t: "ってもいいですか" }],
    romaji: "koko ni suwattemo ii desu ka", english: "May I sit here?" },
  { segments: [{ t: "図書館", f: "としょかん" }, { t: "はどこですか" }],
    romaji: "toshokan wa doko desu ka", english: "Where is the library?" },
  { segments: [{ t: "音楽", f: "おんがく" }, { t: "を" }, { t: "聞", f: "き" }, { t: "きます" }],
    romaji: "ongaku o kikimasu", english: "I listen to music." },
  { segments: [{ t: "日本", f: "にほん" }, { t: "へ" }, { t: "行", f: "い" }, { t: "きたいです" }],
    romaji: "nihon e ikitai desu", english: "I want to go to Japan." },
];

// Short two-person dialogues for conversation practice.
// Each conversation: { title, lines: [{ speaker: "A"|"B", segments, romaji, english }] }
const CONVERSATIONS = [
  {
    title: "Pozdrav",
    lines: [
      { speaker: "A", segments: [{ t: "こんにちは。" }],
        romaji: "konnichiwa.", english: "Hello." },
      { speaker: "B", segments: [{ t: "こんにちは。" }, { t: "元気", f: "げんき" }, { t: "ですか。" }],
        romaji: "konnichiwa. genki desu ka.", english: "Hello. How are you?" },
      { speaker: "A", segments: [{ t: "元気", f: "げんき" }, { t: "です。あなたは？" }],
        romaji: "genki desu. anata wa?", english: "I'm fine. And you?" },
      { speaker: "B", segments: [{ t: "私", f: "わたし" }, { t: "も" }, { t: "元気", f: "げんき" }, { t: "です。" }],
        romaji: "watashi mo genki desu.", english: "I'm fine too." },
    ],
  },
  {
    title: "Seznámení",
    lines: [
      { speaker: "A", segments: [{ t: "初", f: "はじ" }, { t: "めまして。" }, { t: "私", f: "わたし" }, { t: "は" }, { t: "田中", f: "たなか" }, { t: "です。" }],
        romaji: "hajimemashite. watashi wa tanaka desu.", english: "Nice to meet you. I'm Tanaka." },
      { speaker: "B", segments: [{ t: "初", f: "はじ" }, { t: "めまして。" }, { t: "私", f: "わたし" }, { t: "は" }, { t: "スミスです。よろしくお" }, { t: "願", f: "ねが" }, { t: "いします。" }],
        romaji: "hajimemashite. watashi wa sumisu desu. yoroshiku onegai shimasu.", english: "Nice to meet you. I'm Smith. Pleased to meet you." },
      { speaker: "A", segments: [{ t: "こちらこそ、よろしくお" }, { t: "願", f: "ねが" }, { t: "いします。" }],
        romaji: "kochira koso, yoroshiku onegai shimasu.", english: "Likewise, pleased to meet you." },
    ],
  },
  {
    title: "V kavárně",
    lines: [
      { speaker: "A", segments: [{ t: "いらっしゃいませ。" }, { t: "何", f: "なに" }, { t: "にしますか。" }],
        romaji: "irasshaimase. nani ni shimasu ka.", english: "Welcome! What would you like?" },
      { speaker: "B", segments: [{ t: "コーヒーをお" }, { t: "願", f: "ねが" }, { t: "いします。" }],
        romaji: "koohii o onegai shimasu.", english: "Coffee, please." },
      { speaker: "A", segments: [{ t: "かしこまりました。" }, { t: "三百円", f: "さんびゃくえん" }, { t: "です。" }],
        romaji: "kashikomarimashita. sanbyaku en desu.", english: "Certainly. That's 300 yen." },
      { speaker: "B", segments: [{ t: "ありがとうございます。" }],
        romaji: "arigatou gozaimasu.", english: "Thank you." },
    ],
  },
  {
    title: "Cesta do knihovny",
    lines: [
      { speaker: "A", segments: [{ t: "すみません、" }, { t: "図書館", f: "としょかん" }, { t: "はどこですか。" }],
        romaji: "sumimasen, toshokan wa doko desu ka.", english: "Excuse me, where is the library?" },
      { speaker: "B", segments: [{ t: "あそこです。まっすぐ" }, { t: "行", f: "い" }, { t: "ってください。" }],
        romaji: "asoko desu. massugu itte kudasai.", english: "It's over there. Please go straight." },
      { speaker: "A", segments: [{ t: "ありがとうございます。" }],
        romaji: "arigatou gozaimasu.", english: "Thank you." },
      { speaker: "B", segments: [{ t: "どういたしまして。" }],
        romaji: "dou itashimashite.", english: "You're welcome." },
    ],
  },
  {
    title: "Plány na víkend",
    lines: [
      { speaker: "A", segments: [{ t: "週末", f: "しゅうまつ" }, { t: "、" }, { t: "何", f: "なに" }, { t: "をしますか。" }],
        romaji: "shuumatsu, nani o shimasu ka.", english: "What are you doing this weekend?" },
      { speaker: "B", segments: [{ t: "友達", f: "ともだち" }, { t: "と" }, { t: "映画", f: "えいが" }, { t: "を" }, { t: "見", f: "み" }, { t: "ます。" }],
        romaji: "tomodachi to eiga o mimasu.", english: "I'm watching a movie with a friend." },
      { speaker: "A", segments: [{ t: "いいですね。" }, { t: "何", f: "なん" }, { t: "の" }, { t: "映画", f: "えいが" }, { t: "ですか。" }],
        romaji: "ii desu ne. nan no eiga desu ka.", english: "Nice. What movie?" },
      { speaker: "B", segments: [{ t: "まだわかりません。" }],
        romaji: "mada wakarimasen.", english: "I don't know yet." },
      { speaker: "A", segments: [{ t: "楽", f: "たの" }, { t: "しんでください。" }],
        romaji: "tanoshinde kudasai.", english: "Have fun." },
      { speaker: "B", segments: [{ t: "ありがとうございます。" }],
        romaji: "arigatou gozaimasu.", english: "Thank you." },
    ],
  },
  {
    title: "Nákup oblečení",
    lines: [
      { speaker: "A", segments: [{ t: "何", f: "なに" }, { t: "をさがしていますか。" }],
        romaji: "nani o sagashite imasu ka.", english: "What are you looking for?" },
      { speaker: "B", segments: [{ t: "シャツをさがしています。" }],
        romaji: "shatsu o sagashite imasu.", english: "I'm looking for a shirt." },
      { speaker: "A", segments: [{ t: "こちらはいかがですか。" }],
        romaji: "kochira wa ikaga desu ka.", english: "How about this one?" },
      { speaker: "B", segments: [{ t: "いいですね。" }, { t: "試着", f: "しちゃく" }, { t: "してもいいですか。" }],
        romaji: "ii desu ne. shichaku shitemo ii desu ka.", english: "Nice. Can I try it on?" },
      { speaker: "A", segments: [{ t: "もちろんです。" }],
        romaji: "mochiron desu.", english: "Of course." },
    ],
  },
  {
    title: "Telefonát",
    lines: [
      { speaker: "A", segments: [{ t: "もしもし、" }, { t: "田中", f: "たなか" }, { t: "です。" }, { t: "今", f: "いま" }, { t: "、" }, { t: "大丈夫", f: "だいじょうぶ" }, { t: "ですか。" }],
        romaji: "moshi moshi, tanaka desu. ima, daijoubu desu ka.", english: "Hello, this is Tanaka. Is now a good time?" },
      { speaker: "B", segments: [{ t: "はい、" }, { t: "大丈夫", f: "だいじょうぶ" }, { t: "です。" }],
        romaji: "hai, daijoubu desu.", english: "Yes, it's fine." },
      { speaker: "A", segments: [{ t: "すみません、" }, { t: "明日", f: "あした" }, { t: "は" }, { t: "忙", f: "いそが" }, { t: "しいです。" }],
        romaji: "sumimasen, ashita wa isogashii desu.", english: "Sorry, I'm busy tomorrow." },
      { speaker: "B", segments: [{ t: "わかりました。また" }, { t: "今度", f: "こんど" }, { t: "。" }],
        romaji: "wakarimashita. mata kondo.", english: "Understood. Some other time." },
    ],
  },
  {
    title: "V restauraci",
    lines: [
      { speaker: "A", segments: [{ t: "何", f: "なに" }, { t: "を" }, { t: "注文", f: "ちゅうもん" }, { t: "しますか。" }],
        romaji: "nani o chuumon shimasu ka.", english: "What will you order?" },
      { speaker: "B", segments: [{ t: "すみません、" }, { t: "メニューを" }, { t: "見", f: "み" }, { t: "せてください。" }],
        romaji: "sumimasen, menyuu o misete kudasai.", english: "Excuse me, please show me the menu." },
      { speaker: "A", segments: [{ t: "どうぞ。" }],
        romaji: "douzo.", english: "Here you go." },
      { speaker: "B", segments: [{ t: "ラーメンをください。" }],
        romaji: "raamen o kudasai.", english: "Ramen, please." },
      { speaker: "A", segments: [{ t: "少々", f: "しょうしょう" }, { t: "お" }, { t: "待", f: "ま" }, { t: "ちください。" }],
        romaji: "shoushou omachi kudasai.", english: "Please wait a moment." },
    ],
  },
  {
    title: "Malá řeč o počasí",
    lines: [
      { speaker: "A", segments: [{ t: "今日", f: "きょう" }, { t: "は" }, { t: "寒", f: "さむ" }, { t: "いですね。" }],
        romaji: "kyou wa samui desu ne.", english: "It's cold today, isn't it." },
      { speaker: "B", segments: [{ t: "そうですね。" }, { t: "明日", f: "あした" }, { t: "も" }, { t: "寒", f: "さむ" }, { t: "いです。" }],
        romaji: "sou desu ne. ashita mo samui desu.", english: "That's right. Tomorrow will be cold too." },
      { speaker: "A", segments: [{ t: "風邪", f: "かぜ" }, { t: "に" }, { t: "気", f: "き" }, { t: "をつけてください。" }],
        romaji: "kaze ni ki o tsukete kudasai.", english: "Please be careful not to catch a cold." },
      { speaker: "B", segments: [{ t: "ありがとうございます。" }],
        romaji: "arigatou gozaimasu.", english: "Thank you." },
    ],
  },
];

// Sentence-building exercises: put word/particle tokens in the correct order.
// Each entry: { english, romaji, tokens: [ [{t,f}, ...], ... ] } — each token is
// itself a small segments array (so multi-kanji/okurigana tokens keep furigana).
const BUILDER_SENTENCES_HANDCRAFTED = [
  {
    english: "I am a student.",
    romaji: "watashi wa gakusei desu",
    tokens: [
      [{ t: "私", f: "わたし" }],
      [{ t: "は" }],
      [{ t: "学生", f: "がくせい" }],
      [{ t: "です" }],
    ],
  },
  {
    english: "This is a book.",
    romaji: "kore wa hon desu",
    tokens: [
      [{ t: "これ" }],
      [{ t: "は" }],
      [{ t: "本", f: "ほん" }],
      [{ t: "です" }],
    ],
  },
  {
    english: "I like dogs.",
    romaji: "inu ga suki desu",
    tokens: [
      [{ t: "犬", f: "いぬ" }],
      [{ t: "が" }],
      [{ t: "好", f: "す" }, { t: "き" }],
      [{ t: "です" }],
    ],
  },
  {
    english: "I listen to music.",
    romaji: "ongaku o kikimasu",
    tokens: [
      [{ t: "音楽", f: "おんがく" }],
      [{ t: "を" }],
      [{ t: "聞", f: "き" }, { t: "きます" }],
    ],
  },
  {
    english: "I want to go to Japan.",
    romaji: "nihon e ikitai desu",
    tokens: [
      [{ t: "日本", f: "にほん" }],
      [{ t: "へ" }],
      [{ t: "行", f: "い" }, { t: "きたいです" }],
    ],
  },
  {
    english: "My name is Tanaka.",
    romaji: "watashi no namae wa tanaka desu",
    tokens: [
      [{ t: "私", f: "わたし" }],
      [{ t: "の" }],
      [{ t: "名前", f: "なまえ" }],
      [{ t: "は" }],
      [{ t: "田中", f: "たなか" }],
      [{ t: "です" }],
    ],
  },
  {
    english: "The school is far.",
    romaji: "gakkou wa tooi desu",
    tokens: [
      [{ t: "学校", f: "がっこう" }],
      [{ t: "は" }],
      [{ t: "遠", f: "とお" }, { t: "いです" }],
    ],
  },
  {
    english: "I drink coffee.",
    romaji: "koohii o nomimasu",
    tokens: [
      [{ t: "コーヒー" }],
      [{ t: "を" }],
      [{ t: "飲", f: "の" }, { t: "みます" }],
    ],
  },
  {
    english: "I like cats.",
    romaji: "neko ga suki desu",
    tokens: [
      [{ t: "猫", f: "ねこ" }],
      [{ t: "が" }],
      [{ t: "好", f: "す" }, { t: "き" }],
      [{ t: "です" }],
    ],
  },
  {
    english: "It's raining today.",
    romaji: "kyou wa ame desu",
    tokens: [
      [{ t: "今日", f: "きょう" }],
      [{ t: "は" }],
      [{ t: "雨", f: "あめ" }],
      [{ t: "です" }],
    ],
  },
  {
    english: "This is not a cat.",
    romaji: "kore wa neko ja nai desu",
    tokens: [
      [{ t: "これ" }],
      [{ t: "は" }],
      [{ t: "猫", f: "ねこ" }],
      [{ t: "じゃないです" }],
    ],
  },
  {
    english: "What is this?",
    romaji: "kore wa nani desu ka",
    tokens: [
      [{ t: "これ" }],
      [{ t: "は" }],
      [{ t: "何", f: "なに" }],
      [{ t: "ですか" }],
    ],
  },
  {
    english: "Please sit here.",
    romaji: "koko ni suwatte kudasai",
    tokens: [
      [{ t: "ここ" }],
      [{ t: "に" }],
      [{ t: "座", f: "すわ" }, { t: "って" }],
      [{ t: "ください" }],
    ],
  },
  {
    english: "Yesterday was rainy.",
    romaji: "kinou wa ame deshita",
    tokens: [
      [{ t: "昨日", f: "きのう" }],
      [{ t: "は" }],
      [{ t: "雨", f: "あめ" }],
      [{ t: "でした" }],
    ],
  },
  {
    english: "I am a Japanese teacher.",
    romaji: "watashi wa nihongo no sensei desu",
    tokens: [
      [{ t: "私", f: "わたし" }],
      [{ t: "は" }],
      [{ t: "日本語", f: "にほんご" }],
      [{ t: "の" }],
      [{ t: "先生", f: "せんせい" }],
      [{ t: "です" }],
    ],
  },
  {
    english: "I go to school by train every day.",
    romaji: "mainichi densha de gakkou e ikimasu",
    tokens: [
      [{ t: "毎日", f: "まいにち" }],
      [{ t: "電車", f: "でんしゃ" }],
      [{ t: "で" }],
      [{ t: "学校", f: "がっこう" }],
      [{ t: "へ" }],
      [{ t: "行", f: "い" }, { t: "きます" }],
    ],
  },
  {
    english: "I don't want to study today.",
    romaji: "kyou wa benkyou shitakunai desu",
    tokens: [
      [{ t: "今日", f: "きょう" }],
      [{ t: "は" }],
      [{ t: "勉強", f: "べんきょう" }],
      [{ t: "したくないです" }],
    ],
  },
  {
    english: "I like flowers and water.",
    romaji: "hana to mizu ga suki desu",
    tokens: [
      [{ t: "花", f: "はな" }],
      [{ t: "と" }],
      [{ t: "水", f: "みず" }],
      [{ t: "が" }],
      [{ t: "好", f: "す" }, { t: "き" }],
      [{ t: "です" }],
    ],
  },
];

// Bulk-generated sentence-building exercises: a small, hand-verified vocabulary
// (subjects x objects) combined into two grammar patterns that stay correct and
// sensible for every combination — "X likes Y" (X は Y が好きです) and
// "X buys Y" (X は Y を買います, only for physically buyable objects). This lets
// the builder deck scale to hundreds of exercises without hand-typing (and
// risking furigana typos in) each one individually.
const BUILDER_SUBJECTS = [
  { t: "私", f: "わたし", romaji: "watashi", en: "I", thirdPerson: false },
  { t: "あなた", romaji: "anata", en: "you", thirdPerson: false },
  { t: "田中", f: "たなか", romaji: "tanaka", en: "Tanaka", thirdPerson: true },
  { t: "スミス", romaji: "sumisu", en: "Smith", thirdPerson: true },
  { t: "先生", f: "せんせい", romaji: "sensei", en: "the teacher", thirdPerson: true },
  { t: "学生", f: "がくせい", romaji: "gakusei", en: "the student", thirdPerson: true },
  { t: "友達", f: "ともだち", romaji: "tomodachi", en: "my friend", thirdPerson: true },
  { t: "母", f: "はは", romaji: "haha", en: "my mother", thirdPerson: true },
];

const BUILDER_OBJECTS = [
  { t: "猫", f: "ねこ", romaji: "neko", en: "cats", buyable: true },
  { t: "犬", f: "いぬ", romaji: "inu", en: "dogs", buyable: true },
  { t: "本", f: "ほん", romaji: "hon", en: "books", buyable: true },
  { t: "水", f: "みず", romaji: "mizu", en: "water", buyable: true },
  { t: "花", f: "はな", romaji: "hana", en: "flowers", buyable: true },
  { t: "音楽", f: "おんがく", romaji: "ongaku", en: "music", buyable: true },
  { t: "寿司", f: "すし", romaji: "sushi", en: "sushi", buyable: true },
  { t: "コーヒー", romaji: "koohii", en: "coffee", buyable: true },
  { t: "日本語", f: "にほんご", romaji: "nihongo", en: "Japanese", buyable: false },
  { t: "映画", f: "えいが", romaji: "eiga", en: "movies", buyable: true },
  { t: "魚", f: "さかな", romaji: "sakana", en: "fish", buyable: true },
  { t: "りんご", romaji: "ringo", en: "apples", buyable: true },
  { t: "パン", romaji: "pan", en: "bread", buyable: true },
  { t: "たまご", romaji: "tamago", en: "eggs", buyable: true },
  { t: "やさい", romaji: "yasai", en: "vegetables", buyable: true },
  { t: "電車", f: "でんしゃ", romaji: "densha", en: "trains", buyable: false },
  { t: "雨", f: "あめ", romaji: "ame", en: "rain", buyable: false },
  { t: "学校", f: "がっこう", romaji: "gakkou", en: "school", buyable: false },
  { t: "図書館", f: "としょかん", romaji: "toshokan", en: "libraries", buyable: false },
  { t: "日本", f: "にほん", romaji: "nihon", en: "Japan", buyable: false },
];

function builderToken(item) {
  return item.f ? [{ t: item.t, f: item.f }] : [{ t: item.t }];
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function generateBuilderSentences() {
  const generated = [];
  BUILDER_SUBJECTS.forEach(subj => {
    BUILDER_OBJECTS.forEach(obj => {
      // Pattern 1: "X wa Y ga suki desu." — always valid, for any subject/object.
      generated.push({
        english: `${capitalize(subj.en)} ${subj.thirdPerson ? "likes" : "like"} ${obj.en}.`,
        romaji: `${subj.romaji} wa ${obj.romaji} ga suki desu`,
        tokens: [
          builderToken(subj),
          [{ t: "は" }],
          builderToken(obj),
          [{ t: "が" }],
          [{ t: "好", f: "す" }, { t: "き" }],
          [{ t: "です" }],
        ],
      });
      // Pattern 2: "X wa Y o kaimasu." — only for physically buyable objects.
      if (obj.buyable) {
        generated.push({
          english: `${capitalize(subj.en)} ${subj.thirdPerson ? "buys" : "buy"} ${obj.en}.`,
          romaji: `${subj.romaji} wa ${obj.romaji} o kaimasu`,
          tokens: [
            builderToken(subj),
            [{ t: "は" }],
            builderToken(obj),
            [{ t: "を" }],
            [{ t: "買", f: "か" }, { t: "います" }],
          ],
        });
      }
    });
  });
  return generated;
}

const BUILDER_SENTENCES = BUILDER_SENTENCES_HANDCRAFTED.concat(generateBuilderSentences());

// Vocabulary flashcards. Front: emoji + kanji (with furigana). Back: romaji + English.
// Each entry: { emoji, segments, romaji, english }
const FLASHCARDS = [
  { emoji: "🐶", segments: [{ t: "犬", f: "いぬ" }], romaji: "inu", english: "dog" },
  { emoji: "🐱", segments: [{ t: "猫", f: "ねこ" }], romaji: "neko", english: "cat" },
  { emoji: "📖", segments: [{ t: "本", f: "ほん" }], romaji: "hon", english: "book" },
  { emoji: "🏫", segments: [{ t: "学校", f: "がっこう" }], romaji: "gakkou", english: "school" },
  { emoji: "🎓", segments: [{ t: "学生", f: "がくせい" }], romaji: "gakusei", english: "student" },
  { emoji: "🧑‍🏫", segments: [{ t: "先生", f: "せんせい" }], romaji: "sensei", english: "teacher" },
  { emoji: "🎵", segments: [{ t: "音楽", f: "おんがく" }], romaji: "ongaku", english: "music" },
  { emoji: "📚", segments: [{ t: "図書館", f: "としょかん" }], romaji: "toshokan", english: "library" },
  { emoji: "🍣", segments: [{ t: "寿司", f: "すし" }], romaji: "sushi", english: "sushi" },
  { emoji: "☕", segments: [{ t: "コーヒー" }], romaji: "koohii", english: "coffee" },
  { emoji: "🌧️", segments: [{ t: "雨", f: "あめ" }], romaji: "ame", english: "rain" },
  { emoji: "💧", segments: [{ t: "水", f: "みず" }], romaji: "mizu", english: "water" },
  { emoji: "🌸", segments: [{ t: "花", f: "はな" }], romaji: "hana", english: "flower" },
  { emoji: "🚃", segments: [{ t: "電車", f: "でんしゃ" }], romaji: "densha", english: "train" },
  { emoji: "🏠", segments: [{ t: "家", f: "いえ" }], romaji: "ie", english: "house" },
  { emoji: "🗾", segments: [{ t: "日本", f: "にほん" }], romaji: "nihon", english: "Japan" },
];

// Grammar/particle reference for the sentence-structure section.
// Each entry: { particle, name, role, example: [hiragana, romaji, english] }
const PARTICLES = [
  {
    particle: "は",
    reading: "wa (jako téma věty)",
    role: "Označuje TÉMA věty — 'co se týče...'. Čte se jako 'wa', ne 'ha'.",
    example: ["わたしは がくせいです", "watashi WA gakusei desu", "I am a student. (as for me, [I am] a student)"]
  },
  {
    particle: "が",
    reading: "ga",
    role: "Označuje PODMĚT, hlavně u nových informací nebo u sloves/pocitů jako 'suki' (mít rád).",
    example: ["いぬが すきです", "inu GA suki desu", "I like dogs. (dogs are likeable)"]
  },
  {
    particle: "を",
    reading: "o",
    role: "Označuje PŘEDMĚT slovesa — na co/koho směřuje děj. Čte se jako 'o', ne 'wo'.",
    example: ["おんがくを ききます", "ongaku O kikimasu", "I listen to music."]
  },
  {
    particle: "に",
    reading: "ni",
    role: "Označuje MÍSTO/ČAS děje, směr nebo cíl ('kam', 'kdy', 'komu').",
    example: ["ここに すわっても いいですか", "koko NI suwattemo ii desu ka", "May I sit here?"]
  },
  {
    particle: "で",
    reading: "de",
    role: "Označuje MÍSTO, kde se děj odehrává, nebo prostředek ('čím').",
    example: ["がっこうで べんきょうします", "gakkou DE benkyou shimasu", "I study at school."]
  },
  {
    particle: "の",
    reading: "no",
    role: "Přivlastňovací částice — spojuje dvě podstatná jména jako 'X's Y'.",
    example: ["わたしの なまえは たなかです", "watashi NO namae wa tanaka desu", "My name is Tanaka."]
  },
  {
    particle: "か",
    reading: "ka",
    role: "Na konci věty mění větu na OTÁZKU.",
    example: ["これは いくらですか", "kore wa ikura desu KA", "How much is this?"]
  },
  {
    particle: "へ",
    reading: "e",
    role: "Označuje SMĚR pohybu ('kam jdu/jedu'). Čte se jako 'e', ne 'he'.",
    example: ["にほんへ いきたいです", "nihon E ikitai desu", "I want to go to Japan."]
  },
];
