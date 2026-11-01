import { describe, expect, it } from 'vitest';
import { ancestors, buildTree, filterTree, flattenFolders, folderAndDescendants, type DiagramItem, type FolderItem } from './tree';

const folder = (id: string, name: string, parent_id: string | null = null): FolderItem => ({ id, name, parent_id });
const diagram = (id: string, name: string, folder_id: string | null = null): DiagramItem => ({ id, name, folder_id, updated_at: '2026-11-01' });

const folders = [folder('f2', 'Entwürfe', 'f1'), folder('f1', 'Kunde X'), folder('f3', 'Archiv')];
const diagrams = [diagram('d1', 'Ablauf', 'f2'), diagram('d2', 'Zeitplan'), diagram('d3', 'architektur')];

describe('buildTree', () => {
  it('nests folders and diagrams and sorts by name', () => {
    const t = buildTree(folders, diagrams);
    expect(t.folders.map((n) => n.folder.name)).toEqual(['Archiv', 'Kunde X']);
    expect(t.folders[1].folders[0].folder.name).toBe('Entwürfe');
    expect(t.folders[1].folders[0].diagrams.map((d) => d.name)).toEqual(['Ablauf']);
    expect(t.diagrams.map((d) => d.name)).toEqual(['architektur', 'Zeitplan']);
  });

  it('puts items with an unknown folder at the top level', () => {
    const t = buildTree([folder('x', 'Waise', 'gone')], [diagram('d', 'Lose', 'gone')]);
    expect(t.folders).toHaveLength(1);
    expect(t.diagrams).toHaveLength(1);
  });
});

describe('filterTree', () => {
  const tree = buildTree(folders, diagrams);

  it('returns the tree unchanged without a query', () => {
    expect(filterTree(tree, '  ')).toBe(tree);
  });

  it('keeps matching diagrams with the folders leading to them', () => {
    const t = filterTree(tree, 'ABLAUF');
    expect(t.diagrams).toEqual([]);
    expect(t.folders.map((n) => n.folder.name)).toEqual(['Kunde X']);
    expect(t.folders[0].folders[0].diagrams.map((d) => d.name)).toEqual(['Ablauf']);
  });

  it('keeps the whole content of a matching folder', () => {
    const t = filterTree(tree, 'kunde');
    expect(t.folders[0].folders[0].diagrams).toHaveLength(1);
  });

  it('finds nothing for an unknown name', () => {
    expect(filterTree(tree, 'zzz')).toEqual({ folders: [], diagrams: [] });
  });
});

describe('folder helpers', () => {
  it('collects a folder and everything below it', () => {
    expect([...folderAndDescendants(folders, 'f1')].sort()).toEqual(['f1', 'f2']);
    expect([...folderAndDescendants(folders, 'f3')]).toEqual(['f3']);
  });

  it('flattens with depth and can leave out a subtree', () => {
    const tree = buildTree(folders, []);
    expect(flattenFolders(tree).map((x) => [x.folder.id, x.depth])).toEqual([['f3', 0], ['f1', 0], ['f2', 1]]);
    expect(flattenFolders(tree, new Set(['f1', 'f2'])).map((x) => x.folder.id)).toEqual(['f3']);
  });

  it('lists the ancestors of a folder', () => {
    expect(ancestors(folders, 'f2')).toEqual(['f1']);
    expect(ancestors(folders, 'f1')).toEqual([]);
    expect(ancestors(folders, null)).toEqual([]);
  });
});
