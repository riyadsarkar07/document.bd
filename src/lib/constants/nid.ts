import type { InspectorSection, NIDSnapshot, SliderSpec } from '../editor/types';

/**
 * NID card editor state — values preserved verbatim from the original
 * application (legacy/index.html). Do NOT modify these numbers.
 */
export const NID_DEFAULTS: NIDSnapshot = {
  nameBangla: 'মোঃ রিয়াদ সরকার',
  nameEnglish: 'Md. Riyad Sarkar',
  pitaName: 'মোঃ আব্দুল করিম',
  mataName: 'মোছাঃ রাহেলা বেগম',
  dob: '01 Jan 1990',
  idNo: '1234567890123',
  nameBanglaSize: 144,
  nameBanglaX: 1380,
  nameBanglaY: 928,
  nameEnglishSize: 113,
  nameEnglishX: 1380,
  nameEnglishY: 1130,
  pitaSize: 115,
  pitaX: 1397,
  pitaY: 1350,
  mataSize: 110,
  mataX: 1397,
  mataY: 1557,
  dobSize: 105,
  dobX: 1741,
  dobY: 1793,
  idNoSize: 130,
  idNoX: 1511,
  idNoY: 2012,
  photoX: 200,
  photoY: 900,
  photoW: 400,
  photoH: 400,
};

const sl = (spec: Omit<SliderSpec, 'key'>): Omit<SliderSpec, 'key'> => ({
  step: 1,
  ...spec,
});

const sliders: Record<string, Omit<SliderSpec, 'key'>> = {
  nameBanglaSize: sl({ label: 'Size', min: 8, max: 300, default: 144, mono: true }),
  nameBanglaX: sl({ label: 'X', min: 0, max: 2200, default: 1380, mono: true }),
  nameBanglaY: sl({ label: 'Y', min: 0, max: 2200, default: 928, mono: true }),
  nameEnglishSize: sl({ label: 'Size', min: 8, max: 300, default: 113, mono: true }),
  nameEnglishX: sl({ label: 'X', min: 0, max: 2200, default: 1380, mono: true }),
  nameEnglishY: sl({ label: 'Y', min: 0, max: 2200, default: 1130, mono: true }),
  pitaSize: sl({ label: 'Size', min: 8, max: 300, default: 115, mono: true }),
  pitaX: sl({ label: 'X', min: 0, max: 2200, default: 1397, mono: true }),
  pitaY: sl({ label: 'Y', min: 0, max: 2200, default: 1350, mono: true }),
  mataSize: sl({ label: 'Size', min: 8, max: 300, default: 110, mono: true }),
  mataX: sl({ label: 'X', min: 0, max: 2200, default: 1397, mono: true }),
  mataY: sl({ label: 'Y', min: 0, max: 2200, default: 1557, mono: true }),
  dobSize: sl({ label: 'Size', min: 8, max: 300, default: 105, mono: true }),
  dobX: sl({ label: 'X', min: 0, max: 2200, default: 1741, mono: true }),
  dobY: sl({ label: 'Y', min: 0, max: 2200, default: 1793, mono: true }),
  idNoSize: sl({ label: 'Size', min: 8, max: 300, default: 130, mono: true }),
  idNoX: sl({ label: 'X', min: 0, max: 2200, default: 1511, mono: true }),
  idNoY: sl({ label: 'Y', min: 0, max: 2200, default: 2012, mono: true }),
  photoX: sl({ label: 'Photo X', min: 0, max: 2200, default: 200 }),
  photoY: sl({ label: 'Photo Y', min: 0, max: 2200, default: 900 }),
  photoW: sl({ label: 'Width', min: 20, max: 1000, default: 400 }),
  photoH: sl({ label: 'Height', min: 20, max: 1000, default: 400 }),
};

export const NID_SLIDERS: Record<string, SliderSpec> = Object.fromEntries(
  Object.entries(sliders).map(([key, spec]) => [key, { key, ...spec }]),
) as Record<string, SliderSpec>;

export const NID_SECTIONS: InspectorSection[] = [
  {
    id: 'name-bangla',
    label: 'নাম — Bangla Name',
    groups: [
      [NID_SLIDERS.nameBanglaSize, NID_SLIDERS.nameBanglaX, NID_SLIDERS.nameBanglaY],
    ],
  },
  {
    id: 'name-english',
    label: 'Name — English',
    groups: [
      [NID_SLIDERS.nameEnglishSize, NID_SLIDERS.nameEnglishX, NID_SLIDERS.nameEnglishY],
    ],
  },
  {
    id: 'father',
    label: 'পিতা — Father',
    groups: [[NID_SLIDERS.pitaSize, NID_SLIDERS.pitaX, NID_SLIDERS.pitaY]],
  },
  {
    id: 'mother',
    label: 'মাতা — Mother',
    groups: [[NID_SLIDERS.mataSize, NID_SLIDERS.mataX, NID_SLIDERS.mataY]],
  },
  {
    id: 'dob',
    label: 'Date of Birth',
    groups: [[NID_SLIDERS.dobSize, NID_SLIDERS.dobX, NID_SLIDERS.dobY]],
  },
  {
    id: 'id-no',
    label: 'ID Number',
    groups: [[NID_SLIDERS.idNoSize, NID_SLIDERS.idNoX, NID_SLIDERS.idNoY]],
  },
  {
    id: 'photo',
    label: 'Profile Photo',
    accent: 'blue',
    groups: [
      [NID_SLIDERS.photoX, NID_SLIDERS.photoY],
      [NID_SLIDERS.photoW, NID_SLIDERS.photoH],
    ],
  },
];

export const NID_BACKGROUND = '/assets/nid-bg.png';

export const NID_TEXT_FIELDS: { key: 'nameBangla' | 'nameEnglish' | 'pitaName' | 'mataName' | 'dob' | 'idNo'; label: string }[] = [
  { key: 'nameBangla', label: 'Bangla Name' },
  { key: 'nameEnglish', label: 'English Name' },
  { key: 'pitaName', label: "Father's Name (Bangla)" },
  { key: 'mataName', label: "Mother's Name (Bangla)" },
  { key: 'dob', label: 'Date of Birth' },
  { key: 'idNo', label: 'National ID Number' },
];

/** Font registration — family names preserved from the original renderer. */
export const FONT_FACES = [
  { family: 'Arial Regular', url: '/assets/arial-regular.ttf' },
  { family: 'Arial Bold', url: '/assets/arial-regular.ttf', weight: 'bold' },
  { family: 'Monotype Corsiva Bold Italic', url: '/assets/monotype-corsiva-bold-italic.otf' },
  { family: 'Kalpurush', url: '/assets/kalpurush.ttf' },
  { family: 'Kalpurush Bold', url: '/assets/kalpurush.ttf', weight: 'bold' },
];

export const ASSET_LIST = [
  { name: 'cert-bangladesh.png', type: 'image', desc: 'Trademark certificate background', path: '/assets/cert-bangladesh.png' },
  { name: 'nid-bg.png', type: 'image', desc: 'NID card background', path: '/assets/nid-bg.png' },
  { name: 'sign remove.png', type: 'image', desc: 'Signature overlay', path: '/assets/sign remove.png' },
  { name: 'arial-regular.ttf', type: 'font', desc: 'Arial Regular / Arial Bold', path: '/assets/arial-regular.ttf' },
  { name: 'kalpurush.ttf', type: 'font', desc: 'Kalpurush / Kalpurush Bold', path: '/assets/kalpurush.ttf' },
  { name: 'monotype-corsiva-bold-italic.otf', type: 'font', desc: 'Monotype Corsiva Bold Italic', path: '/assets/monotype-corsiva-bold-italic.otf' },
  { name: 'FontsFree-Net-times-new-roman-italic.ttf', type: 'font', desc: 'Times New Roman Italic (unused, archived)', path: '/assets/FontsFree-Net-times-new-roman-italic.ttf' },
] as const;
