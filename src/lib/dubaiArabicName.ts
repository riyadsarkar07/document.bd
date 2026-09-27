const EXACT_NAME_AR: Record<string, string> = {
  riyad: 'الرياض',
  riyadh: 'الرياض',
  sabbir: 'صابر',
  saber: 'صابر',
  sabir: 'صابر',
  alex: 'أليكس',
  morgan: 'مورغان',
  mohammed: 'محمد',
  mohammad: 'محمد',
  muhammad: 'محمد',
  muhamed: 'محمد',
  mohamad: 'محمد',
  md: 'محمد',
  ahmed: 'أحمد',
  ahmad: 'أحمد',
  ali: 'علي',
  omar: 'عمر',
  osman: 'عثمان',
  usman: 'عثمان',
  hassan: 'حسن',
  hasan: 'حسن',
  hussein: 'حسين',
  hussain: 'حسين',
  hossain: 'حسين',
  hossen: 'حسين',
  ibrahim: 'إبراهيم',
  yusuf: 'يوسف',
  yousuf: 'يوسف',
  youssef: 'يوسف',
  fatima: 'فاطمة',
  aisha: 'عائشة',
  maryam: 'مريم',
  noor: 'نور',
  nur: 'نور',
  karim: 'كريم',
  kareem: 'كريم',
  rahman: 'رحمن',
  abdul: 'عبد',
  abdullah: 'عبد الله',
  sarkar: 'سركار',
  khan: 'خان',
  islam: 'إسلام',
  chowdhury: 'شودري',
  jordan: 'جوردان',
  lee: 'لي',
};

const DIGRAPHS: [string, string][] = [
  ['sch', 'ش'],
  ['tch', 'تش'],
  ['kh', 'خ'],
  ['gh', 'غ'],
  ['sh', 'ش'],
  ['ch', 'تش'],
  ['th', 'ث'],
  ['dh', 'ذ'],
  ['ph', 'ف'],
  ['aa', 'ا'],
  ['ee', 'ي'],
  ['oo', 'و'],
  ['ou', 'و'],
  ['ai', 'ي'],
  ['ay', 'ي'],
  ['ey', 'ي'],
  ['ie', 'ي'],
  ['qu', 'ق'],
];

const LETTERS: Record<string, string> = {
  a: 'ا',
  b: 'ب',
  c: 'ك',
  d: 'د',
  e: '',
  f: 'ف',
  g: 'ج',
  h: 'ه',
  i: 'ي',
  j: 'ج',
  k: 'ك',
  l: 'ل',
  m: 'م',
  n: 'ن',
  o: 'و',
  p: 'ب',
  q: 'ق',
  r: 'ر',
  s: 'س',
  t: 'ت',
  u: 'و',
  v: 'ف',
  w: 'و',
  x: 'كس',
  y: 'ي',
  z: 'ز',
};

function normalizeToken(token: string): string {
  return token
    .replace(/[.'’`]/g, '')
    .replace(/[^A-Za-z\u0600-\u06FF]+/g, '')
    .toLowerCase();
}

function phoneticToken(token: string): string {
  let rest = token;
  let out = '';
  while (rest.length) {
    const digraph = DIGRAPHS.find(([from]) => rest.startsWith(from));
    if (digraph) {
      out += digraph[1];
      rest = rest.slice(digraph[0].length);
      continue;
    }
    out += LETTERS[rest[0]] ?? rest[0];
    rest = rest.slice(1);
  }
  return out;
}

function transliterateToken(token: string): string {
  if (!token) return '';
  if (/[\u0600-\u06FF]/.test(token)) return token;
  const key = normalizeToken(token);
  if (!key) return '';
  if (EXACT_NAME_AR[key]) return EXACT_NAME_AR[key];
  return phoneticToken(key);
}

/** Map an English / Latin personal name to Arabic script for the DEMO overlay. */
export function englishNameToArabic(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\s+/)
    .map(transliterateToken)
    .filter(Boolean)
    .join(' ');
}
