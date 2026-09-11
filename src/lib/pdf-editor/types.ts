export type PdfTool =
  | 'select'
  | 'text'
  | 'highlight'
  | 'pen'
  | 'whiteout'
  | 'image'
  | 'signature'
  | 'rect'
  | 'ellipse'
  | 'line';

export type PdfRotation = 0 | 90 | 180 | 270;

export interface PdfPoint {
  x: number;
  y: number;
}

export interface PdfBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPageMeta {
  id: string;
  sourceIndex: number;
  rotation: PdfRotation;
  sourceRotate: PdfRotation;
  widthPt: number;
  heightPt: number;
}

interface AnnotationBase {
  id: string;
  pageId: string;
}

export interface TextAnnotation extends AnnotationBase {
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  color: string;
  bold: boolean;
}

export interface HighlightAnnotation extends AnnotationBase {
  type: 'highlight';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
}

export interface PenAnnotation extends AnnotationBase {
  type: 'pen';
  points: PdfPoint[];
  color: string;
  strokeWidth: number;
}

export interface WhiteoutAnnotation extends AnnotationBase {
  type: 'whiteout';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageAnnotation extends AnnotationBase {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
}

export interface SignatureAnnotation extends AnnotationBase {
  type: 'signature';
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
}

export interface ShapeAnnotation extends AnnotationBase {
  type: 'shape';
  shape: 'rect' | 'ellipse' | 'line';
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fill: string | null;
}

export type PdfAnnotation =
  | TextAnnotation
  | HighlightAnnotation
  | PenAnnotation
  | WhiteoutAnnotation
  | ImageAnnotation
  | SignatureAnnotation
  | ShapeAnnotation;

export interface PdfEditorDocument {
  fileName: string;
  pages: PdfPageMeta[];
  annotations: PdfAnnotation[];
}

export const EMPTY_PDF_DOCUMENT: PdfEditorDocument = {
  fileName: '',
  pages: [],
  annotations: [],
};

export const PDF_TOOL_LABEL: Record<PdfTool, string> = {
  select: 'Select',
  text: 'Add Text',
  highlight: 'Highlight',
  pen: 'Draw',
  whiteout: 'Whiteout',
  image: 'Add Image',
  signature: 'Signature',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
};
