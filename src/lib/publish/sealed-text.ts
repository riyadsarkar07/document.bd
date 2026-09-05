/**
 * Transfer the sealed statement from Save into the Publish re-render.
 *
 * History publish rebuilds the portal JPEG from the vault row. The phrase must
 * be copied verbatim — consecutive periods such as
 * `Sealed at my direction this ....day of....Month.......`
 * must never be trimmed, collapsed, or replaced by the template default.
 */
export function sealedTextFromVault(
  stored: string | null | undefined,
  fallback: string,
): string {
  return typeof stored === 'string' ? stored : fallback;
}
