/**
 * Parse a `maxheight=<n>` directive (a positive decimal) out of a fence
 * info-string or an image title, returning the LaTeX height as a fraction of
 * `\textheight` (e.g. "0.5\\textheight"), or undefined when absent/malformed.
 * The same rule applies to diagram fences and image titles.
 */
export function parseMaxHeightFraction(info: string | null | undefined): string | undefined {
  if (!info) return undefined;
  const m = info.match(/maxheight=(\d*\.?\d+)/);
  return m ? `${m[1]}\\textheight` : undefined;
}
