export type DocKind = 'tm' | 'nid';

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
}
