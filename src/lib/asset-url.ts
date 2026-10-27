export function encodeAssetUrl(src: string): string {
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return src;
  try {
    return encodeURI(decodeURI(src));
  } catch {
    return encodeURI(src);
  }
}
