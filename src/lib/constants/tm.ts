import type { InspectorSection, SliderSpec, TMSnapshot } from '../editor/types';

/**
 * Trademark Certificate editor state — values preserved verbatim from the
 * original application (legacy/index.html). Do NOT modify these numbers;
 * the renderer is calibrated against them.
 */
export const TM_DEFAULTS: TMSnapshot = {
  trademarkNo: '245788',
  regDate: '08/04/2024',
  appDate: '08/12/2015',
  companyName: 'The Territorial News (TTN)',
  ownerName: 'Riyad Sarkar',
  address:
    "Nuran House, 2nd Floor, Thana Road, Badarmokam Mosque Area, Teknaf, Cox's Bazar-4760, Bangladesh.",
  compType: 'A Bangladeshi Media/News Company',
  openingText:
    'Certified that the Trademark of which a representation is annexed hereto has been registered in the name of',
  middleTextArial: 'in class 41 under No.',
  goodsDesc:
    'in respect of online news publishing; digital journalism; media broadcasting; news reporting; photography; video production; social media news services and all other media services included in class-41.',
  sealedTextPhrase: 'Sealed at my direction this .....day of......Month........',
  sealedDate: '10 JUL 2024',
  logoText: '',
  arialSize: 50,
  corsivSize: 62,
  sealSize: 40,
  blueDateSize: 40,
  tmX: 277,
  tmY: 987,
  dateX: 1833,
  dateY: 987,
  paraY: 1078,
  logoY: 1814,
  logoSize: 433,
  sealX: 302,
  sealY: 2908,
  blueX: 783,
  blueY: 2857,
  logoTextSize: 59,
  logoTextX: 1200,
  logoTextY: 2188,
  signX: 1271,
  signY: 1717,
  signSize: 322,
};

const sl = (spec: Omit<SliderSpec, 'key'>): Omit<SliderSpec, 'key'> => ({
  step: 1,
  ...spec,
});

const sliders: Record<string, Omit<SliderSpec, 'key'>> = {
  arialSize: sl({ label: 'Arial Regular Font Size', min: 20, max: 100, default: 50 }),
  corsivSize: sl({ label: 'Italic Description Font Size', min: 20, max: 100, default: 62 }),
  sealSize: sl({ label: 'Sealed Phrase Font Size', min: 20, max: 100, default: 40 }),
  blueDateSize: sl({ label: 'Blue Date Font Size', min: 10, max: 100, default: 40 }),
  tmX: sl({ label: 'TM No. X', min: 50, max: 1500, default: 277 }),
  tmY: sl({ label: 'TM No. Y', min: 200, max: 3000, default: 987 }),
  dateX: sl({ label: 'Date X', min: 500, max: 3000, default: 1833 }),
  dateY: sl({ label: 'Date Y', min: 200, max: 3000, default: 987 }),
  paraY: sl({ label: 'Main Paragraph Start Y', min: 200, max: 2500, default: 1078 }),
  logoY: sl({ label: 'Logo Y-Position', min: 450, max: 5000, default: 1814 }),
  logoSize: sl({ label: 'Logo Size', min: 50, max: 1000, default: 433 }),
  sealX: sl({ label: 'Sealed Phrase X', min: 50, max: 1500, default: 302 }),
  sealY: sl({ label: 'Sealed Phrase Y', min: 600, max: 5000, default: 2908 }),
  blueX: sl({ label: 'Blue Date X', min: 100, max: 2000, default: 783 }),
  blueY: sl({ label: 'Blue Date Y', min: 600, max: 5000, default: 2857 }),
  logoTextSize: sl({ label: 'Logo Text Font Size', min: 10, max: 150, default: 59 }),
  logoTextX: sl({ label: 'Logo Text X', min: 50, max: 2500, default: 1200 }),
  logoTextY: sl({ label: 'Logo Text Y', min: 50, max: 5000, default: 2188 }),
  signX: sl({ label: 'Signature X', min: 50, max: 3000, default: 1271 }),
  signY: sl({ label: 'Signature Y', min: 500, max: 5000, default: 1717 }),
  signSize: sl({ label: 'Signature Size', min: 50, max: 1500, default: 322 }),
};

export const TM_SLIDERS: Record<string, SliderSpec> = Object.fromEntries(
  Object.entries(sliders).map(([key, spec]) => [key, { key, ...spec }]),
) as Record<string, SliderSpec>;

export const TM_SECTIONS: InspectorSection[] = [
  {
    id: 'cert-data',
    label: 'Certificate Data',
    groups: [],
  },
  {
    id: 'text-segments',
    label: 'Text Segments',
    groups: [],
  },
  {
    id: 'logo-text',
    label: 'Logo Text Configuration',
    accent: 'gold',
    groups: [[TM_SLIDERS.logoTextSize], [TM_SLIDERS.logoTextX, TM_SLIDERS.logoTextY]],
  },
  {
    id: 'font-scales',
    label: 'Font Scales',
    groups: [
      [TM_SLIDERS.arialSize, TM_SLIDERS.corsivSize],
      [TM_SLIDERS.sealSize, TM_SLIDERS.blueDateSize],
    ],
  },
  {
    id: 'header-positions',
    label: 'Header Positions',
    groups: [
      [TM_SLIDERS.tmX, TM_SLIDERS.tmY],
      [TM_SLIDERS.dateX, TM_SLIDERS.dateY],
    ],
  },
  {
    id: 'paragraph-logo',
    label: 'Paragraph & Logo',
    groups: [[TM_SLIDERS.paraY, TM_SLIDERS.logoY], [TM_SLIDERS.logoSize]],
  },
  {
    id: 'sealed-row',
    label: 'Sealed Row Anchors',
    groups: [
      [TM_SLIDERS.sealX, TM_SLIDERS.sealY],
      [TM_SLIDERS.blueX, TM_SLIDERS.blueY],
    ],
  },
  {
    id: 'signature',
    label: 'Signature Overlay',
    groups: [
      [TM_SLIDERS.signX, TM_SLIDERS.signY],
      [TM_SLIDERS.signSize],
    ],
  },
];

export const TM_BACKGROUND = '/assets/cert-bangladesh.png';
export const TM_SIGNATURE = '/assets/sign remove.png';

/** Keys treated as plain string inputs on the certificate. */
export const TM_TEXT_FIELDS: { key: keyof TMSnapshot; label: string; textarea?: boolean }[] = [
  { key: 'trademarkNo', label: 'Trademark No.' },
  { key: 'regDate', label: 'Reg. Date' },
  { key: 'appDate', label: 'Application Date' },
  { key: 'companyName', label: 'Company Name' },
  { key: 'ownerName', label: 'Owner Name' },
  { key: 'address', label: 'Address', textarea: true },
  { key: 'compType', label: 'Company Type' },
  { key: 'openingText', label: 'Opening Text (Segment 1)', textarea: true },
  { key: 'middleTextArial', label: 'Middle Text Arial (Segment 3)' },
  { key: 'goodsDesc', label: 'Goods Description (Italic — Segment 4)', textarea: true },
  { key: 'sealedTextPhrase', label: 'Sealed Statement Phrase', textarea: true },
  { key: 'sealedDate', label: 'Sealed Date (Blue Ink)' },
  { key: 'logoText', label: 'Logo Text Input' },
];
