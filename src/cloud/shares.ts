// Sharing diagrams and folders with other people (table `shares`; the rules live in the database).
import { supabase } from './client';
import { cloudErrorMessage, type CloudError } from './errors';
import { ancestors, folderRole, type DiagramItem, type FolderItem, type ShareRole } from './tree';

export type { ShareRole } from './tree';

/** Something that can be shared: a diagram or a folder (a folder share covers everything inside). */
export interface ShareTarget {
  kind: 'diagram' | 'folder';
  id: string;
}

export interface Share {
  id: string;
  role: ShareRole;
  grantee_id: string;
  email: string;
}

/** A share on a folder above the target (the target inherits it). */
export interface InheritedShare extends Share {
  folder_id: string;
}

/** A diagram somebody else owns that I can see. */
export interface SharedItem extends DiagramItem {
  /** my role here: the strongest of a share on the diagram and shares on the folders above it */
  role: ShareRole | null;
  /** I was given access to this very item (so I can drop it from my list) */
  direct: boolean;
  ownerEmail: string;
}

/** A folder somebody else owns that I can see. */
export interface SharedFolder extends FolderItem {
  role: ShareRole | null;
  direct: boolean;
  ownerEmail: string;
}

export const NO_ACCOUNT = 'Für diese Adresse gibt es (noch) kein Konto. Neue Personen müssen zuerst eingeladen werden.';

function client() {
  if (!supabase) throw new Error('Die Cloud ist nicht eingerichtet.');
  return supabase;
}

const fail = (e: CloudError) => new Error(cloudErrorMessage(e));

const column = (t: ShareTarget) => (t.kind === 'folder' ? 'folder_id' : 'diagram_id');

/** Look up the e-mail address of each person (only people I share with, or who share with me, are visible). */
async function emails(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data, error } = await client().from('profiles').select('id, email').in('id', [...new Set(ids)]);
  if (error) throw fail(error);
  return new Map<string, string>(data.map((p) => [p.id, p.email]));
}

/** Who has access through a share on the target itself (owner only). */
export async function listShares(target: ShareTarget): Promise<Share[]> {
  const { data, error } = await client().from('shares').select('id, role, grantee_id').eq(column(target), target.id).order('created_at');
  if (error) throw fail(error);
  const email = await emails(data.map((s) => s.grantee_id));
  return data.map((s) => ({ id: s.id, role: s.role, grantee_id: s.grantee_id, email: email.get(s.grantee_id) ?? '' }));
}

/** The folders the target lies in, nearest first. Shares on them reach the target as well. */
export async function foldersAbove(target: ShareTarget): Promise<Array<{ id: string; name: string }>> {
  const row = await client()
    .from(target.kind === 'folder' ? 'folders' : 'diagrams')
    .select(target.kind === 'folder' ? 'parent_id' : 'folder_id')
    .eq('id', target.id)
    .single();
  if (row.error) throw fail(row.error);
  const data = row.data as { parent_id?: string | null; folder_id?: string | null };
  const start = (target.kind === 'folder' ? data.parent_id : data.folder_id) ?? null;
  if (!start) return [];
  const all = await client().from('folders').select('id, name, owner_id, parent_id');
  if (all.error) throw fail(all.error);
  const folders: FolderItem[] = all.data;
  return [start, ...ancestors(folders, start)].flatMap((id) => {
    const f = folders.find((x) => x.id === id);
    return f ? [{ id: f.id, name: f.name }] : [];
  });
}

/** Shares on the given folders, i.e. access that reaches the target from above. */
export async function listInheritedShares(folderIds: string[]): Promise<InheritedShare[]> {
  if (!folderIds.length) return [];
  const { data, error } = await client().from('shares').select('id, role, grantee_id, folder_id').in('folder_id', folderIds).order('created_at');
  if (error) throw fail(error);
  const email = await emails(data.map((s) => s.grantee_id));
  return data.map((s) => ({ id: s.id, role: s.role, grantee_id: s.grantee_id, folder_id: s.folder_id, email: email.get(s.grantee_id) ?? '' }));
}

/** Give the person with this exact e-mail address access. */
export async function addShare(target: ShareTarget, email: string, role: ShareRole): Promise<void> {
  const found = await client().rpc('find_user_by_email', { p_email: email });
  if (found.error) throw fail(found.error);
  const person = found.data?.[0];
  if (!person) throw new Error(NO_ACCOUNT);
  const { error } = await client().from('shares').insert({ [column(target)]: target.id, grantee_id: person.id, role });
  if (error) throw error.code === '23505' ? new Error(`${person.email} hat schon Zugriff.`) : fail(error);
}

export async function updateShareRole(shareId: string, role: ShareRole): Promise<void> {
  const { data, error } = await client().from('shares').update({ role }).eq('id', shareId).select('id');
  if (error) throw fail(error);
  if (!data.length) throw new Error('Die Freigabe gibt es nicht mehr.');
}

export async function removeShare(shareId: string): Promise<void> {
  const { data, error } = await client().from('shares').delete().eq('id', shareId).select('id');
  if (error) throw fail(error);
  if (!data.length) throw new Error('Die Freigabe gibt es nicht mehr.');
}

/** Drop something that was shared with me from my list. */
export async function leaveShared(target: ShareTarget, myId: string): Promise<void> {
  const { data, error } = await client().from('shares').delete().eq(column(target), target.id).eq('grantee_id', myId).select('id');
  if (error) throw fail(error);
  if (!data.length) throw new Error('Das erreicht dich über einen übergeordneten geteilten Ordner und lässt sich hier nicht entfernen.');
}

/** Add my role (shares on the item or on folders above it) and the owner's address to what others own. */
export async function describeShared(
  diagrams: DiagramItem[],
  folders: FolderItem[],
  myId: string,
): Promise<{ diagrams: SharedItem[]; folders: SharedFolder[] }> {
  if (!diagrams.length && !folders.length) return { diagrams: [], folders: [] };
  const mine = await client().from('shares').select('diagram_id, folder_id, role').eq('grantee_id', myId);
  if (mine.error) throw fail(mine.error);
  const owner = await emails([...diagrams.map((d) => d.owner_id), ...folders.map((f) => f.owner_id)]);

  const onDiagram = new Map<string, ShareRole>();
  const onFolder = new Map<string, ShareRole>();
  for (const s of mine.data) (s.diagram_id ? onDiagram : onFolder).set(s.diagram_id ?? s.folder_id, s.role);

  return {
    folders: folders.map((f) => ({ ...f, role: folderRole(folders, onFolder, f.id), direct: onFolder.has(f.id), ownerEmail: owner.get(f.owner_id) ?? '' })),
    diagrams: diagrams.map((d) => {
      const direct = onDiagram.get(d.id) ?? null;
      const viaFolder = folderRole(folders, onFolder, d.folder_id);
      return { ...d, role: direct === 'editor' || viaFolder === 'editor' ? 'editor' : (direct ?? viaFolder), direct: onDiagram.has(d.id), ownerEmail: owner.get(d.owner_id) ?? '' };
    }),
  };
}
