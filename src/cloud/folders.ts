// Folders in the cloud (table `folders`, protected by row-level security).
import { supabase } from './client';
import type { FolderItem } from './tree';

function client() {
  if (!supabase) throw new Error('Die Cloud ist nicht eingerichtet.');
  return supabase;
}

const fail = (e: { message: string }) => new Error(`Cloud: ${e.message}`);

export async function listFolders(): Promise<FolderItem[]> {
  const { data, error } = await client().from('folders').select('id, name, parent_id');
  if (error) throw fail(error);
  return data;
}

export async function createFolder(name: string, parentId: string | null): Promise<FolderItem> {
  const { data, error } = await client().from('folders').insert({ name, parent_id: parentId }).select('id, name, parent_id').single();
  if (error) throw fail(error);
  return data;
}

export async function updateFolder(id: string, patch: { name?: string; parent_id?: string | null }): Promise<void> {
  const { data, error } = await client().from('folders').update(patch).eq('id', id).select('id');
  if (error) throw fail(error);
  if (!data.length) throw new Error('Den Ordner gibt es nicht mehr oder du darfst ihn nicht ändern.');
}

/** Deletes the folder with everything inside it (subfolders, diagrams, shares). */
export async function deleteFolder(id: string): Promise<void> {
  const { data, error } = await client().from('folders').delete().eq('id', id).select('id');
  if (error) throw fail(error);
  if (!data.length) throw new Error('Den Ordner gibt es nicht mehr oder du darfst ihn nicht löschen.');
}
