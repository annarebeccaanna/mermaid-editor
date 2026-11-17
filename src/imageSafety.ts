// Images in diagrams can point at any server. Opening somebody else's diagram must not make the
// browser contact that server (it would learn the IP address and the time), so such images stay
// blocked until the person agrees.
import { assetUrl } from './desktop';

const LOCAL = /^(data:|blob:|mmd-asset:)/i;

/** Grey box shown where an image is not loaded. */
export const BLOCKED_IMAGE =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect x="1" y="1" width="118" height="78" rx="6" fill="#eef1f4" stroke="#b8c2cc" stroke-dasharray="4 3"/><path d="M40 52l14-16 12 12 8-8 12 12z" fill="#b8c2cc"/><text x="60" y="70" font-family="sans-serif" font-size="9" text-anchor="middle" fill="#6b7785">nicht geladen</text></svg>',
  );

/** The address the way a browser reads it: it drops tabs and line breaks and trims control characters. */
const normalize = (img: string) => img.replace(/[\t\n\r]/g, '').replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '');

/** Loading this would contact another server (web address, or `//host` which browsers also read that way). */
export function isExternalImage(img: string): boolean {
  const t = normalize(img);
  return /^https?:/i.test(t) || /^[\\/]{2}/.test(t);
}

/** A scheme we do not know (`javascript:`, `ftp:`, …). Drive letters like `C:\` are paths, not schemes. */
function isOddScheme(t: string): boolean {
  return /^[a-z][a-z0-9+.-]+:/i.test(t) && !LOCAL.test(t) && !/^https?:/i.test(t);
}

/** What to put into `src`: the image itself, or a placeholder while it must not be loaded. */
export function imageSrc(img: string, docPath: string | null, allowExternal: boolean): string {
  const t = normalize(img);
  if (isOddScheme(t) || (isExternalImage(t) && !allowExternal)) return BLOCKED_IMAGE;
  return assetUrl(t, docPath);
}

/** How many images of the diagram point at other servers. */
export const countExternalImages = (nodes: Array<{ img?: string }>) => nodes.filter((n) => n.img && isExternalImage(n.img)).length;
