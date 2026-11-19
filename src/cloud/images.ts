// Images that live in the cloud with their diagram (private storage bucket `diagram-images`).
// In the diagram code an image is written as `cloud:<diagram id>/<file>`; the files themselves are
// reachable for everyone who may see the diagram (rules in supabase/migrations/20261117010000_diagram_images.sql).
import { create } from 'zustand';
import { supabase } from './client';
import { cloudErrorMessage } from './errors';
import { cloudPath, cloudRef, mapRefs, refsIn } from './imageRefs';

export { cloudPath, cloudRef, isCloudImage, refsIn } from './imageRefs';

export const BUCKET = 'diagram-images';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Allowed types and the file ending each one gets. SVG is left out on purpose (it can carry scripts). */
export const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

/** Why this file cannot be used as an image, or null when it can. */
export function validateImage(file: { type: string; size: number }): string | null {
  if (!IMAGE_TYPES[file.type]) return 'Als Bild geht nur PNG, JPEG, GIF oder WebP.';
  if (file.size > MAX_IMAGE_BYTES) return `Das Bild ist größer als ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`;
  if (file.size === 0) return 'Die Datei ist leer.';
  return null;
}

function bucket() {
  if (!supabase) throw new Error('Die Cloud ist nicht eingerichtet.');
  return supabase.storage.from(BUCKET);
}

const fail = (e: { message: string }) => new Error(cloudErrorMessage(e));

/** Upload an image for the diagram; returns the reference to put into the code. */
export async function uploadImage(diagramId: string, file: File): Promise<string> {
  const problem = validateImage(file);
  if (problem) throw new Error(problem);
  const name = `${crypto.randomUUID()}.${IMAGE_TYPES[file.type]}`;
  const { error } = await bucket().upload(`${diagramId}/${name}`, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
  if (error) throw fail(error);
  return cloudRef(diagramId, name);
}

// ---------------------------------------------------------------------------
// Showing images: short-lived signed addresses, kept until shortly before they run out
// ---------------------------------------------------------------------------

const URL_LIFETIME_S = 3600;
const RENEW_BEFORE_MS = 5 * 60 * 1000;

interface CloudImageState {
  /** reference → address; null: the image is not available (deleted, or no access) */
  urls: Record<string, string | null>;
  expires: Record<string, number>;
  /** Make sure addresses for these references exist (fetches the missing or nearly expired ones). */
  ensure: (refs: string[]) => Promise<void>;
  clear: () => void;
}

const inFlight = new Set<string>();

export const useCloudImages = create<CloudImageState>((set, get) => ({
  urls: {},
  expires: {},
  clear: () => set({ urls: {}, expires: {} }),
  ensure: async (refs) => {
    if (!supabase) return;
    const { urls, expires } = get();
    const now = Date.now();
    const need = [...new Set(refs.map((r) => r.trim()))].filter((r) => {
      if (inFlight.has(r) || !cloudPath(r)) return false;
      return !(r in urls) || (urls[r] !== null && (expires[r] ?? 0) < now + RENEW_BEFORE_MS);
    });
    if (!need.length) return;
    need.forEach((r) => inFlight.add(r));
    try {
      const { data, error } = await bucket().createSignedUrls(need.map((r) => cloudPath(r)!), URL_LIFETIME_S);
      const next = { ...get().urls };
      const exp = { ...get().expires };
      need.forEach((r, i) => {
        const item = error ? null : data?.[i];
        next[r] = item && !item.error && item.signedUrl ? item.signedUrl : null;
        exp[r] = now + URL_LIFETIME_S * 1000;
      });
      set({ urls: next, expires: exp });
    } finally {
      need.forEach((r) => inFlight.delete(r));
    }
  },
}));

async function toDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

/** The images as data addresses (for export, which must not depend on addresses that expire). */
export async function cloudImagesAsData(refs: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  await Promise.all(
    [...new Set(refs.map((r) => r.trim()))].map(async (ref) => {
      const path = cloudPath(ref);
      if (!path) return void (out[ref] = null);
      const { data, error } = await bucket().download(path);
      out[ref] = error || !data ? null : await toDataUrl(data);
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------
// Copying and cleaning up
// ---------------------------------------------------------------------------

/**
 * A copy of a diagram gets copies of its image files, so it keeps working when the original is changed
 * or removed. Returns the code with the new references (unchanged when there are no cloud images).
 */
export async function cloneImages(content: string, newDiagramId: string): Promise<string> {
  const refs = refsIn(content);
  if (!refs.length) return content;
  const moved = new Map<string, string>();
  for (const ref of refs) {
    const from = cloudPath(ref);
    if (!from) continue;
    const ending = from.split('.').pop() ?? 'png';
    const name = `${crypto.randomUUID()}.${ending}`;
    const { error } = await bucket().copy(from, `${newDiagramId}/${name}`);
    if (error) throw fail(error);
    moved.set(ref, cloudRef(newDiagramId, name));
  }
  return mapRefs(content, (ref) => moved.get(ref) ?? ref);
}

/** Remove all image files of a diagram. Has to run while the person still has access to the diagram. */
export async function removeDiagramImages(diagramId: string): Promise<void> {
  const { data, error } = await bucket().list(diagramId, { limit: 1000 });
  if (error) throw fail(error);
  const paths = (data ?? []).filter((f) => f.name && f.id).map((f) => `${diagramId}/${f.name}`);
  if (!paths.length) return;
  const res = await bucket().remove(paths);
  if (res.error) throw fail(res.error);
}
