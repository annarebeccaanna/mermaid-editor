// How a cloud image is written in the diagram code: `cloud:<diagram id>/<file>`.
// Pure helpers without any network, so they can also be used by the code that decides what to show.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const REF = new RegExp(`^cloud:(${UUID})/([A-Za-z0-9._-]+)$`, 'i');
/** All references inside a piece of code, wherever they stand. */
const REF_IN_TEXT = new RegExp(`cloud:${UUID}/[A-Za-z0-9._-]+`, 'gi');

export const isCloudImage = (img: string) => /^cloud:/i.test(img.trim());
export const cloudRef = (diagramId: string, file: string) => `cloud:${diagramId}/${file}`;

/** Path inside the bucket for a reference, or null when it is not a well-formed reference. */
export function cloudPath(ref: string): string | null {
  const m = REF.exec(ref.trim());
  return m ? `${m[1].toLowerCase()}/${m[2]}` : null;
}

/** The distinct references in a piece of diagram code. */
export const refsIn = (text: string): string[] => [...new Set(text.match(REF_IN_TEXT) ?? [])];

/** Replace every reference in a piece of code. */
export const mapRefs = (text: string, fn: (ref: string) => string): string => text.replace(REF_IN_TEXT, fn);

/** The cloud references among the images of these nodes. */
export const cloudRefsOf = (nodes: Array<{ img?: string }>): string[] => [...new Set(nodes.flatMap((n) => (n.img && isCloudImage(n.img) ? [n.img.trim()] : [])))];
