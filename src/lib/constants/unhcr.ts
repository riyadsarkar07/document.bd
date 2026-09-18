import type { SliderSpec, UnhcrFieldKey, UnhcrLayout, UnhcrSnapshot } from '../editor/types';
import { UNHCR_FIELD_KEYS } from '../editor/types';

/**
 * UNHCR ID-style editor constants.
 *
 * Identity values stay empty by default — this editor does not invent official
 * document data. Layout boxes sit on the uploaded template
 * (`public/assets/Unchar.png`, 2560×1800) so operators can overlay case notes
 * at the printed labels and save/restore font + position settings.
 */

export const UNHCR_DOC_WIDTH = 2560;
export const UNHCR_DOC_HEIGHT = 1800;
export const UNHCR_BACKGROUND = '/assets/Unchar.png';
export const UNHCR_CASE_LABEL = 'Facebook Imposter';

export const UNHCR_FIELD_ORDER: readonly UnhcrFieldKey[] = UNHCR_FIELD_KEYS;

export interface UnhcrFieldMeta {
  key: UnhcrFieldKey;
  label: string;
}

export const UNHCR_FIELDS: UnhcrFieldMeta[] = [
  { key: 'unhcrNo', label: 'UNHCR No:' },
  { key: 'name', label: 'Name / Nama:' },
  { key: 'dob', label: 'Date of Birth / Tarikh Lahir:' },
  { key: 'sex', label: 'Sex / Jantina:' },
  { key: 'origin', label: 'Country of Origin / Negara Asal:' },
  { key: 'issuedDate', label: 'Issued Date:' },
  { key: 'expiredDate', label: 'Expired Date / Tarikh Pembaharuan:' },
];

export const UNHCR_FONT_OPTIONS: { value: UnhcrLayout['fontFamily']; label: string }[] = [
  { value: 'arial', label: 'Arial' },
  { value: 'arial-bold', label: 'Arial Bold' },
];

const layout = (
  x: number,
  y: number,
  fontSize: number,
  extra?: Partial<UnhcrLayout>,
): UnhcrLayout => ({
  fontSize,
  x,
  y,
  fontFamily: 'arial',
  ...extra,
});

/**
 * Default overlay boxes on the 2560×1800 template, aligned under the printed
 * labels. Operators can nudge each field independently.
 */
export const UNHCR_DEFAULT_LAYOUTS: Record<UnhcrFieldKey, UnhcrLayout> = {
  unhcrNo: layout(1288, 178, 36, { fontFamily: 'arial-bold' }),
  name: layout(852, 478, 36, { fontFamily: 'arial-bold' }),
  dob: layout(852, 718, 32),
  sex: layout(1768, 718, 32),
  origin: layout(852, 918, 32),
  issuedDate: layout(852, 1188, 32),
  expiredDate: layout(1568, 1188, 32),
};

export const UNHCR_DEFAULTS: UnhcrSnapshot = {
  unhcrNo: '',
  name: '',
  dob: '',
  sex: '',
  origin: '',
  issuedDate: '',
  expiredDate: '',
  layouts: UNHCR_DEFAULT_LAYOUTS,
};

export function normalizeUnhcrSnapshot(s: Partial<UnhcrSnapshot>): UnhcrSnapshot {
  const layouts: Partial<Record<UnhcrFieldKey, UnhcrLayout>> = {};
  for (const key of UNHCR_FIELD_KEYS) {
    const saved = s.layouts?.[key];
    layouts[key] = {
      ...UNHCR_DEFAULT_LAYOUTS[key],
      ...(saved ?? {}),
    };
  }
  const root: Partial<UnhcrSnapshot> = {};
  for (const key of UNHCR_FIELD_KEYS) {
    if (typeof s[key] === 'string') (root as Record<string, string>)[key] = s[key] as string;
  }
  return {
    ...UNHCR_DEFAULTS,
    ...root,
    layouts: layouts as Record<UnhcrFieldKey, UnhcrLayout>,
  };
}

export const UNHCR_LAYOUT_RANGES: Record<'fontSize' | 'x' | 'y', Omit<SliderSpec, 'key'>> = {
  fontSize: { label: 'Font Size', min: 8, max: 120, default: 32, mono: true },
  x: { label: 'X', min: 0, max: UNHCR_DOC_WIDTH, default: 852, mono: true },
  y: { label: 'Y', min: 0, max: UNHCR_DOC_HEIGHT, default: 478, mono: true },
};
