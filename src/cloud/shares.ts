// Sharing diagrams with other people (table `shares`; the rules live in the database).
import { supabase } from './client';
import { cloudErrorMessage, type CloudError } from './errors';
import type { DiagramItem } from './tree';

export type ShareRole = 'viewer' | 'editor';

export interface Share {
  id: string;
  role: ShareRole;
  grantee_id: string;
  email: string;
}

/** A diagram somebody else owns and shared with me. */
export interface SharedItem extends DiagramItem {
  /** my role from a share on this diagram (null: it reaches me through a shared folder) */
  role: ShareRole | null;
  ownerEmail: string;
}

export const NO_ACCOUNT = 'Für diese Adresse gibt es (noch) kein Konto. Neue Personen müssen zuerst eingeladen werden.';

function client() {
  if (!supabase) throw new Error('Die Cloud ist nicht eingerichtet.');
  return supabase;
}

const fail = (e: CloudError) => new Error(cloudErrorMessage(e));

/** Who has access to a diagram through a share on the diagram itself (owner only). */
export async function listShares(diagramId: string): Promise<Share[]> {
  const { data, error } = await client().from('shares').select('id, role, grantee_id').eq('diagram_id', diagramId).order('created_at');
  if (error) throw fail(error);
  if (!data.length) return [];
  const people = await client()
    .from('profiles')
    .select('id, email')
    .in('id', data.map((s) => s.grantee_id));
  if (people.error) throw fail(people.error);
  const email = new Map<string, string>(people.data.map((p) => [p.id, p.email]));
  return data.map((s) => ({ id: s.id, role: s.role, grantee_id: s.grantee_id, email: email.get(s.grantee_id) ?? '' }));
}

/** Give the person with this exact e-mail address access. */
export async function addShare(diagramId: string, email: string, role: ShareRole): Promise<void> {
  const found = await client().rpc('find_user_by_email', { p_email: email });
  if (found.error) throw fail(found.error);
  const person = found.data?.[0];
  if (!person) throw new Error(NO_ACCOUNT);
  const { error } = await client().from('shares').insert({ diagram_id: diagramId, grantee_id: person.id, role });
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

/** Drop a diagram that was shared with me from my list. */
export async function leaveDiagram(diagramId: string, myId: string): Promise<void> {
  const { data, error } = await client().from('shares').delete().eq('diagram_id', diagramId).eq('grantee_id', myId).select('id');
  if (error) throw fail(error);
  if (!data.length) throw new Error('Dieses Diagramm erreicht dich über einen geteilten Ordner und lässt sich hier nicht entfernen.');
}

/** Add my role and the owner's address to diagrams other people shared with me. */
export async function describeShared(items: DiagramItem[], myId: string): Promise<SharedItem[]> {
  if (!items.length) return [];
  const [mine, owners] = await Promise.all([
    client().from('shares').select('diagram_id, role').eq('grantee_id', myId).not('diagram_id', 'is', null),
    client()
      .from('profiles')
      .select('id, email')
      .in('id', [...new Set(items.map((i) => i.owner_id))]),
  ]);
  if (mine.error) throw fail(mine.error);
  if (owners.error) throw fail(owners.error);
  const role = new Map<string, ShareRole>(mine.data.map((s) => [s.diagram_id, s.role]));
  const email = new Map<string, string>(owners.data.map((p) => [p.id, p.email]));
  return items.map((i) => ({ ...i, role: role.get(i.id) ?? null, ownerEmail: email.get(i.owner_id) ?? '' }));
}
