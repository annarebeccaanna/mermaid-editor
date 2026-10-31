// Reading and writing diagrams in the cloud (table `diagrams`, protected by row-level security).
import { supabase } from './client';

export interface CloudDiagram {
  id: string;
  name: string;
  content: string;
  version: number;
}

export interface CloudDiagramItem {
  id: string;
  name: string;
  updated_at: string;
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

export async function listDiagrams(): Promise<CloudDiagramItem[]> {
  const { data, error } = await client().from('diagrams').select('id, name, updated_at').order('updated_at', { ascending: false });
  if (error) throw fail(error);
  return data;
}

export async function loadDiagram(id: string): Promise<CloudDiagram> {
  const { data, error } = await client().from('diagrams').select('id, name, content, version').eq('id', id).single();
  if (error) throw fail(error);
  return data;
}

export async function createDiagram(name: string, content: string): Promise<CloudDiagram> {
  const { data, error } = await client().from('diagrams').insert({ name, content }).select('id, name, content, version').single();
  if (error) throw fail(error);
  return data;
}

/**
 * Save changes if the diagram is still at `version`; returns the new version.
 * Throws ConflictError when it has changed (or can no longer be written) in the meantime.
 */
export async function saveDiagram(id: string, version: number, patch: { name?: string; content?: string }): Promise<number> {
  const { data, error } = await client().from('diagrams').update(patch).eq('id', id).eq('version', version).select('version');
  if (error) throw fail(error);
  if (!data.length) throw new ConflictError();
  return data[0].version;
}
