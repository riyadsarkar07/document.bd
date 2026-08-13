export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function formatTimestamp(d: Date): string {
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(d.getDate()).padStart(2, '0');
  const m = M[d.getMonth()];
  const y = d.getFullYear();
  const h24 = d.getHours();
  const h12 = h24 % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ap = h24 >= 12 ? 'PM' : 'AM';
  return `${day} ${m} ${y} — ${String(h12).padStart(2, '0')}:${mm} ${ap}`;
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatTimestamp(new Date(then));
}

export function escHtml(s: string): string {
  if (!s) return '—';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function cleanTrademarkNo(value: string): string {
  return value.replace(/^Trademark\s*No\.\s*/i, '').trim();
}

export function cleanDate(value: string): string {
  return value.replace(/^Date:\s*/i, '').trim();
}

export function toDataUrl(
  img: HTMLImageElement,
  type = 'image/jpeg',
  quality = 0.96,
): string {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(img, 0, 0);
  return c.toDataURL(type, quality);
}
