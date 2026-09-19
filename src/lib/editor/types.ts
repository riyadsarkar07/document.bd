import type { DocumentKind } from '@/lib/workspace/document-kinds';

export type DocKind = 'tm' | 'nid' | 'tin' | 'unhcr';

export type TinAlign = 'left' | 'center' | 'right' | 'justify';
export type TinWeight = 'normal' | 'bold';

export interface TinLayout {
  fontSize: number;
  x: number;
  y: number;
  width: number;
  height: number;
  lineHeight: number;
  align: TinAlign;
  fontWeight: TinWeight;
}

export const TIN_FIELD_KEYS = [
  'tinNo',
  'taxpayerName',
  'name',
  'dob',
  'fatherName',
  'motherName',
  'currentAddress',
  'permanentAddress',
  'taxCircle',
  'taxZone',
] as const;

export type TinFieldKey = (typeof TIN_FIELD_KEYS)[number];

export interface SliderSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step?: number;
  mono?: boolean;
}

export type FieldSpec = SliderSpec;

export interface InspectorSection {
  id: string;
  label: string;
  icon?: string;
  accent?: 'gold' | 'blue' | 'default';
  groups: SliderSpec[][];
}

export interface TMSnapshot {
  trademarkNo: string;
  regDate: string;
  appDate: string;
  companyName: string;
  ownerName: string;
  address: string;
  compType: string;
  openingText: string;
  middleTextArial: string;
  goodsDesc: string;
  sealedTextPhrase: string;
  sealedDate: string;
  logoText: string;
  arialSize: number;
  corsivSize: number;
  sealSize: number;
  blueDateSize: number;
  tmX: number;
  tmY: number;
  dateX: number;
  dateY: number;
  paraY: number;
  logoY: number;
  logoSize: number;
  sealX: number;
  sealY: number;
  blueX: number;
  blueY: number;
  logoTextSize: number;
  logoTextX: number;
  logoTextY: number;
  signX: number;
  signY: number;
  signSize: number;
  logoDataUrl?: string | null;
  /** Identifies which Studio editor created the vault/history row. */
  docKind?: DocumentKind;
}

export interface NIDSnapshot {
  nameBangla: string;
  nameEnglish: string;
  pitaName: string;
  mataName: string;
  dob: string;
  idNo: string;
  nameBanglaSize: number;
  nameBanglaX: number;
  nameBanglaY: number;
  nameEnglishSize: number;
  nameEnglishX: number;
  nameEnglishY: number;
  pitaSize: number;
  pitaX: number;
  pitaY: number;
  mataSize: number;
  mataX: number;
  mataY: number;
  dobSize: number;
  dobX: number;
  dobY: number;
  idNoSize: number;
  idNoX: number;
  idNoY: number;
  photoX: number;
  photoY: number;
  photoW: number;
  photoH: number;
  photoDataUrl?: string | null;
}

export interface TINSnapshot {
  tinNo: string;
  taxpayerName: string;
  name: string;
  dob: string;
  fatherName: string;
  motherName: string;
  currentAddress: string;
  permanentAddress: string;
  taxCircle: string;
  taxZone: string;
  layouts: Record<TinFieldKey, TinLayout>;
  qrSize: number;
  qrX: number;
  qrY: number;
}

export type UnhcrFontFamily = 'arial' | 'arial-bold';

export interface UnhcrLayout {
  fontSize: number;
  x: number;
  y: number;
  fontFamily: UnhcrFontFamily;
}

export const UNHCR_FIELD_KEYS = [
  'unhcrNo',
  'name',
  'dob',
  'sex',
  'origin',
  'issuedDate',
  'expiredDate',
] as const;

export type UnhcrFieldKey = (typeof UNHCR_FIELD_KEYS)[number];

export const UNHCR_CODE_KEYS = ['barcode1', 'barcode2', 'qr'] as const;

export type UnhcrCodeKey = (typeof UNHCR_CODE_KEYS)[number];

export const UNHCR_TEST_OVERLAY_KEYS = ['testBarcodeText', 'testRefNo'] as const;

export type UnhcrTestOverlayKey = (typeof UNHCR_TEST_OVERLAY_KEYS)[number];

export type UnhcrTextOrientation = 'horizontal' | 'vertical';

export type UnhcrOverlayKey = UnhcrFieldKey | 'photo' | UnhcrCodeKey | UnhcrTestOverlayKey;

export interface UnhcrSnapshot {
  unhcrNo: string;
  name: string;
  dob: string;
  sex: string;
  origin: string;
  issuedDate: string;
  expiredDate: string;
  layouts: Record<UnhcrFieldKey, UnhcrLayout>;
  photoX: number;
  photoY: number;
  photoW: number;
  photoH: number;
  photoDataUrl?: string | null;
  barcodePayload: string;
  barcode1X: number;
  barcode1Y: number;
  barcode1W: number;
  barcode1H: number;
  barcode2X: number;
  barcode2Y: number;
  barcode2W: number;
  barcode2H: number;
  qrPayload: string;
  qrX: number;
  qrY: number;
  qrSize: number;
  testBarcodeText: string;
  testBarcodeTextX: number;
  testBarcodeTextY: number;
  testBarcodeTextW: number;
  testBarcodeTextH: number;
  testBarcodeTextFontSize: number;
  testRefNo: string;
  testRefNoX: number;
  testRefNoY: number;
  testRefNoW: number;
  testRefNoH: number;
  testRefNoFontSize: number;
  testRefNoOrientation: UnhcrTextOrientation;
}
