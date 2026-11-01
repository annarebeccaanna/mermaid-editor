// Reading and writing diagrams in the cloud (table `diagrams`, protected by row-level security).
import { supabase } from './client';
import type { DiagramItem } from './tree';

export interface CloudDiagram {
  id: string;
  name: string;
  content: string;
  version: number;
  folder_id: string | null;
}

/** Somebody else saved the diagram after we read it. */
export class ConflictError extends Error {
  constructor() {
    super('Das Diagramm wurde inzwischen von jemand anderem geändert.');
  }
}

function client() {
  if (!supabase) throw new Error('Die Cloud ist nicht eingerichtet.');
  return supabase;
}

const fail = (e: { message: string }) => new Error(`Cloud: ${e.message}`);

export async function listDiagrams(): Promise<DiagramItem[]> {
  const { data, error } = await client().from('diagrams').select('id, name, folder_id, updated_at');
  if (error) throw fail(error);
  return data;
}

export async function loadDiagram(id: string): Promise<CloudDiagram> {
  const { data, error } = await client().from('diagrams').select('id, name, content, version, folder_id').eq('id', id).single();
  if (error) throw fail(error);
  return data;
}

export async function createDiagram(name: string, content: string, folderId: string | null = null): Promise<CloudDiagram> {
  const { data, error } = await client()
    .from('diagrams')
    .insert({ name, content, folder_id: folderId })
    .select('id, name, content, version, folder_id')
    .single();
  if (error) throw fail(error);
  return data;
}

export interface DiagramPatch {
  name?: string;
  content?: string;
  folder_id?: string | null;
}

/**
 * Save changes if the diagram is still at `version`; returns the new version.
 * Throws ConflictError when it has changed (or can no longer be written) in the meantime.
 */
export async function saveDiagram(id: string, version: number, patch: DiagramPatch): Promise<number> {
  const { data, error } = await client().from('diagrams').update(patch).eq('id', id).eq('version', version).select('version');
  if (error) throw fail(error);
  if (!data.length) throw new ConflictError();
  return data[0].version;
}

/**
 * Change name or folder without a version check. Only for diagrams that are not open in the editor
 * (the open one goes through saveDiagram so that a stale copy is still noticed).
 */
export async function updateDiagram(id: string, patch: Pick<DiagramPatch, 'name' | 'folder_id'>): Promise<void> {
  const { data, error } = await client().from('diagrams').update(patch).eq('id', id).select('id');
  if (error) throw fail(error);
  if (!data.length) throw new Error('Das Diagramm gibt es nicht mehr oder du darfst es nicht ändern.');
}

export async function deleteDiagram(id: string): Promise<void> {
  const { data, error } = await client().from('diagrams').delete().eq('id', id).select('id');
  if (error) throw fail(error);
  if (!data.length) throw new Error('Das Diagramm gibt es nicht mehr oder du darfst es nicht löschen.');
}
