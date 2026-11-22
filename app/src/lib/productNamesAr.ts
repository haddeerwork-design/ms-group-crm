// ---------------------------------------------------------------------
// Arabic names for products, written by the app from the English name.
// A dictionary of the produce, jams and words Egyptian exporters use, put
// together word by word ("Dragon Fruit & Strawberry Jam" → "مربى دراجون فروت
// وفراولة"). If ANY word is unknown, no name is suggested: the person types it.
// Every suggestion stays editable (Products → product → Arabic name).
// ---------------------------------------------------------------------

type Entry = { ar: string; f?: boolean } // f = feminine word in Arabic (for "frozen", "dried"…)

/** Phrases first (longest wins), then single words. Plurals are found by dropping s / es. */
const PHRASES: Record<string, Entry> = {
  'passion fruit': { ar: 'باشن فروت' }, 'dragon fruit': { ar: 'دراجون فروت' }, 'star fruit': { ar: 'فاكهة النجمة', f: true },
  'sweet potato': { ar: 'بطاطا', f: true }, 'spring onion': { ar: 'بصل أخضر' }, 'green onion': { ar: 'بصل أخضر' },
  'dry onion': { ar: 'بصل جاف' }, 'red onion': { ar: 'بصل أحمر' }, 'golden onion': { ar: 'بصل ذهبي' }, 'white onion': { ar: 'بصل أبيض' },
  'green bean': { ar: 'فاصوليا خضراء', f: true }, 'green pea': { ar: 'بسلة', f: true }, 'snow pea': { ar: 'بسلة صيني', f: true },
  'iceberg lettuce': { ar: 'خس آيسبرج' }, 'romaine lettuce': { ar: 'خس رومين' },
  'navel orange': { ar: 'برتقال أبو سرة' }, 'valencia orange': { ar: 'برتقال فالنسيا' }, 'blood orange': { ar: 'برتقال بدمه' },
  'barhi date': { ar: 'بلح برحي' }, 'medjool date': { ar: 'تمر مجدول' }, 'siwi date': { ar: 'تمر سيوي' }, 'zaghloul date': { ar: 'بلح زغلول' },
  'keitt mango': { ar: 'مانجو كيت' }, 'kent mango': { ar: 'مانجو كنت' }, 'tommy atkins mango': { ar: 'مانجو تومي أتكنز' },
  'habanero pepper': { ar: 'فلفل هابانيرو' }, 'chili pepper': { ar: 'فلفل حار' }, 'hot pepper': { ar: 'فلفل حار' },
  'bell pepper': { ar: 'فلفل رومي' }, 'sweet pepper': { ar: 'فلفل رومي' },
  'mixed vegetable': { ar: 'خضروات مشكلة', f: true }, 'mixed fruit': { ar: 'فواكه مشكلة', f: true },
  'cherry tomato': { ar: 'طماطم شيري', f: true }, 'baby corn': { ar: 'ذرة صغيرة', f: true }, 'sweet corn': { ar: 'ذرة حلوة', f: true },
  'table grape': { ar: 'عنب مائدة' }, 'red globe grape': { ar: 'عنب ريد جلوب' }, 'seedless grape': { ar: 'عنب بدون بذر' },
  'prickly pear': { ar: 'تين شوكي' }, 'bitter orange': { ar: 'نارنج' }, 'sour orange': { ar: 'نارنج' },
  'baladi orange': { ar: 'برتقال بلدي' }, 'murcott mandarin': { ar: 'يوسفي موركت' },
  'brussels sprout': { ar: 'كرنب بروكسل' }, 'red cabbage': { ar: 'كرنب أحمر' }, 'chinese cabbage': { ar: 'كرنب صيني' },
  'sun dried tomato': { ar: 'طماطم مجففة بالشمس', f: true }, 'sun-dried tomato': { ar: 'طماطم مجففة بالشمس', f: true },
  'hibiscus flower': { ar: 'كركديه' }, 'black seed': { ar: 'حبة البركة', f: true },
  'olive oil': { ar: 'زيت زيتون' }, 'tomato paste': { ar: 'صلصة طماطم', f: true },
}
const WORDS: Record<string, Entry> = {
  // fruits
  orange: { ar: 'برتقال' }, mandarin: { ar: 'يوسفي' }, tangerine: { ar: 'يوسفي' }, clementine: { ar: 'كليمنتين' },
  lemon: { ar: 'ليمون' }, lime: { ar: 'ليمون أخضر' }, grapefruit: { ar: 'جريب فروت' }, pomelo: { ar: 'بوملي' },
  mango: { ar: 'مانجو' }, strawberry: { ar: 'فراولة', f: true }, strawberries: { ar: 'فراولة', f: true },
  grape: { ar: 'عنب' }, pomegranate: { ar: 'رمان' }, guava: { ar: 'جوافة', f: true }, avocado: { ar: 'أفوكادو' },
  banana: { ar: 'موز' }, apple: { ar: 'تفاح' }, pear: { ar: 'كمثرى', f: true }, peach: { ar: 'خوخ' }, apricot: { ar: 'مشمش' },
  plum: { ar: 'برقوق' }, fig: { ar: 'تين' }, date: { ar: 'بلح' }, dates: { ar: 'بلح' }, watermelon: { ar: 'بطيخ' }, melon: { ar: 'كانتلوب' },
  cantaloupe: { ar: 'كانتلوب' }, papaya: { ar: 'بابايا', f: true }, pineapple: { ar: 'أناناس' }, kiwi: { ar: 'كيوي' },
  lychee: { ar: 'ليتشي' }, litchi: { ar: 'ليتشي' }, cherimoya: { ar: 'قشطة', f: true }, persimmon: { ar: 'كاكا' },
  blueberry: { ar: 'توت أزرق' }, blueberries: { ar: 'توت أزرق' }, raspberry: { ar: 'توت أحمر' }, raspberries: { ar: 'توت أحمر' },
  blackberry: { ar: 'توت أسود' }, blackberries: { ar: 'توت أسود' }, mulberry: { ar: 'توت' }, cherry: { ar: 'كريز' }, cherries: { ar: 'كريز' },
  coconut: { ar: 'جوز هند' }, olive: { ar: 'زيتون' }, quince: { ar: 'سفرجل' }, citrus: { ar: 'موالح', f: true },
  passion: { ar: 'باشن فروت' }, dragon: { ar: 'دراجون فروت' }, fruit: { ar: 'فاكهة', f: true }, fruits: { ar: 'فواكه', f: true },
  // vegetables
  potato: { ar: 'بطاطس', f: true }, potatoes: { ar: 'بطاطس', f: true }, onion: { ar: 'بصل' }, garlic: { ar: 'ثوم' },
  tomato: { ar: 'طماطم', f: true }, tomatoes: { ar: 'طماطم', f: true }, cucumber: { ar: 'خيار' }, carrot: { ar: 'جزر' },
  pepper: { ar: 'فلفل' }, peppers: { ar: 'فلفل' }, capsicum: { ar: 'فلفل رومي' }, chili: { ar: 'فلفل حار' }, chilli: { ar: 'فلفل حار' },
  broccoli: { ar: 'بروكلي' }, cauliflower: { ar: 'قرنبيط' }, cabbage: { ar: 'كرنب' }, lettuce: { ar: 'خس' }, spinach: { ar: 'سبانخ', f: true },
  molokhia: { ar: 'ملوخية', f: true }, mulukhiyah: { ar: 'ملوخية', f: true }, okra: { ar: 'بامية', f: true }, artichoke: { ar: 'خرشوف' },
  eggplant: { ar: 'باذنجان' }, aubergine: { ar: 'باذنجان' }, zucchini: { ar: 'كوسة', f: true }, courgette: { ar: 'كوسة', f: true },
  pea: { ar: 'بسلة', f: true }, peas: { ar: 'بسلة', f: true }, bean: { ar: 'فاصوليا', f: true }, beans: { ar: 'فاصوليا', f: true },
  corn: { ar: 'ذرة', f: true }, celery: { ar: 'كرفس' }, leek: { ar: 'كرات' }, beetroot: { ar: 'بنجر' }, beet: { ar: 'بنجر' },
  radish: { ar: 'فجل' }, turnip: { ar: 'لفت' }, pumpkin: { ar: 'قرع عسلي' }, squash: { ar: 'قرع' }, ginger: { ar: 'جنزبيل' },
  mushroom: { ar: 'مشروم' }, asparagus: { ar: 'هليون' }, kale: { ar: 'كيل' }, taro: { ar: 'قلقاس' }, colocasia: { ar: 'قلقاس' },
  vegetable: { ar: 'خضروات', f: true }, vegetables: { ar: 'خضروات', f: true },
  // herbs and others
  parsley: { ar: 'بقدونس' }, coriander: { ar: 'كزبرة', f: true }, cilantro: { ar: 'كزبرة', f: true }, dill: { ar: 'شبت' },
  mint: { ar: 'نعناع' }, basil: { ar: 'ريحان' }, thyme: { ar: 'زعتر' }, rosemary: { ar: 'روزماري' }, oregano: { ar: 'أوريجانو' },
  chamomile: { ar: 'كاموميل' }, hibiscus: { ar: 'كركديه' }, cumin: { ar: 'كمون' }, fennel: { ar: 'شمر' }, anise: { ar: 'ينسون' },
  marjoram: { ar: 'بردقوش' }, sage: { ar: 'مريمية', f: true }, moringa: { ar: 'مورينجا', f: true }, peanut: { ar: 'فول سوداني' },
  peanuts: { ar: 'فول سوداني' }, sesame: { ar: 'سمسم' }, honey: { ar: 'عسل' }, raisin: { ar: 'زبيب' }, raisins: { ar: 'زبيب' },
}
/** Words that change how the name is built. */
const JAM = new Set(['jam', 'jams', 'jelly', 'marmalade', 'preserve', 'preserves', 'spread'])
const STATE: Record<string, [string, string]> = { // [masculine, feminine], placed after the name
  frozen: ['مجمد', 'مجمدة'], iqf: ['مجمد', 'مجمدة'], dried: ['مجفف', 'مجففة'], dehydrated: ['مجفف', 'مجففة'],
  organic: ['عضوي', 'عضوية'], pickled: ['مخلل', 'مخللة'], peeled: ['مقشر', 'مقشرة'], sliced: ['شرائح', 'شرائح'],
  chopped: ['مقطع', 'مقطعة'], whole: ['كامل', 'كاملة'], puree: ['مهروس', 'مهروسة'], pulp: ['لب', 'لب'],
}
const SKIP = new Set(['fresh', 'premium', 'quality', 'class', 'grade', 'the', 'of', 'egyptian', 'egypt'])

const singular = (w: string) => (w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.endsWith('oes') ? w.slice(0, -2) : w.endsWith('es') && WORDS[w.slice(0, -2)] ? w.slice(0, -2) : w.endsWith('s') ? w.slice(0, -1) : w)
const word = (w: string): Entry | undefined => WORDS[w] ?? WORDS[singular(w)]

/** Translates a run of words ("dragon fruit strawberry") into Arabic items, or null if one is unknown. */
function items(words: string[]): Entry[] | null {
  const out: Entry[] = []
  for (let i = 0; i < words.length;) {
    let hit: Entry | undefined, len = 0
    for (let n = Math.min(4, words.length - i); n >= 2 && !hit; n--) {
      const ph = words.slice(i, i + n)
      const key = ph.join(' '), keySg = [...ph.slice(0, -1), singular(ph[ph.length - 1])].join(' ')
      hit = PHRASES[key] ?? PHRASES[keySg]; if (hit) len = n
    }
    if (!hit) { hit = word(words[i]); len = 1 }
    if (!hit) return null
    // "passion fruit" written as two words is one item, not "passion" + "fruit"
    if ((words[i] === 'passion' || words[i] === 'dragon') && len === 1 && /^fruits?$/.test(words[i + 1] ?? '')) len = 2
    out.push(hit); i += len
  }
  return out
}

/** Arabic name for an English product name, or null when it cannot be done safely. */
export function arabicProductName(en: string | null | undefined): string | null {
  if (!en?.trim()) return null
  const clean = en.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[–—\-/,+]/g, ' ').replace(/&/g, ' and ').replace(/[^a-z\s]/g, ' ')
  const words = clean.split(/\s+/).filter((w) => w && !SKIP.has(w))
  if (!words.length) return null
  const isJam = words.some((w) => JAM.has(w))
  const states = words.filter((w) => STATE[w])
  const rest = words.filter((w) => !JAM.has(w) && !STATE[w])
  // groups split by "and" ("dragon fruit and strawberry")
  const groups: string[][] = [[]]
  for (const w of rest) w === 'and' || w === 'with' ? groups.push([]) : groups[groups.length - 1].push(w)
  const parts: Entry[] = []
  for (const g of groups.filter((x) => x.length)) { const r = items(g); if (!r) return null; parts.push(...r) }
  if (!parts.length) return null
  // two fruits with no "and" in a jam ("Passion Lemon Jam") are joined with و too
  const name = parts.map((p) => p.ar).reduce((a, b) => `${a} و${b}`)
  const fem = parts.length === 1 ? !!parts[0].f : true
  const adj = states.map((s) => STATE[s][fem ? 1 : 0]).join(' ')
  const out = isJam ? `مربى ${name}` : name
  return (adj ? `${out} ${adj}` : out).replace(/\s+/g, ' ').trim()
}
