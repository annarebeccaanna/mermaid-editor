// Open details in a text are written as [[SO]]. This finds them, so the app can mark them
// and show a draft notice for as long as any are left.

const PLACEHOLDER = /\[\[([^\]]+)\]\]/g;

/** The distinct open details in the text, in order of appearance. */
export function findPlaceholders(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER)) if (!found.includes(m[1])) found.push(m[1]);
  return found;
}

/** Split a text into plain parts and open details, for display. */
export function splitPlaceholders(text: string): Array<{ text: string; open: boolean }> {
  const parts: Array<{ text: string; open: boolean }> = [];
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), open: false });
    parts.push({ text: m[1], open: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), open: false });
  return parts;
}
