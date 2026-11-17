import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = {
  upload: vi.fn(),
  createSignedUrls: vi.fn(),
  download: vi.fn(),
  copy: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
};
vi.mock('./client', () => ({ supabase: { storage: { from: () => storage } } }));

const D1 = '11111111-1111-4111-8111-111111111111';
const D2 = '22222222-2222-4222-8222-222222222222';

const { cloneImages, cloudImagesAsData, cloudPath, refsIn, removeDiagramImages, uploadImage, useCloudImages, validateImage } = await import('./images');

beforeEach(() => {
  Object.values(storage).forEach((f) => f.mockReset());
  useCloudImages.getState().clear();
});

describe('references', () => {
  it('turns a reference into a bucket path and rejects anything else', () => {
    expect(cloudPath(`cloud:${D1}/a.png`)).toBe(`${D1}/a.png`);
    expect(cloudPath(`  CLOUD:${D1.toUpperCase()}/a.png `)).toBe(`${D1}/a.png`);
    for (const bad of ['cloud:', 'cloud:x/a.png', `cloud:${D1}/../${D2}/a.png`, `cloud:${D1}/a/b.png`, `cloud:${D1}/`, 'https://x.example/a.png']) {
      expect(cloudPath(bad), bad).toBeNull();
    }
  });

  it('finds the distinct references in code', () => {
    const code = `A@{ img: "cloud:${D1}/a.png" }\nB@{ img: "cloud:${D1}/a.png" }\nC@{ img: "cloud:${D2}/b.jpg", label: "x" }`;
    expect(refsIn(code)).toEqual([`cloud:${D1}/a.png`, `cloud:${D2}/b.jpg`]);
    expect(refsIn('nichts')).toEqual([]);
  });
});

describe('validateImage', () => {
  it('accepts the usual picture types within the size limit', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) expect(validateImage({ type, size: 1000 })).toBeNull();
  });

  it('refuses SVG, other types, empty and oversized files', () => {
    expect(validateImage({ type: 'image/svg+xml', size: 1000 })).toMatch(/PNG, JPEG, GIF oder WebP/);
    expect(validateImage({ type: 'application/pdf', size: 1000 })).toMatch(/PNG/);
    expect(validateImage({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toMatch(/größer als 5 MB/);
    expect(validateImage({ type: 'image/png', size: 0 })).toMatch(/leer/);
  });
});

describe('uploadImage', () => {
  it('stores the file under the diagram and returns the reference', async () => {
    storage.upload.mockResolvedValue({ data: {}, error: null });
    const file = new File([new Uint8Array(10)], 'Foto.PNG', { type: 'image/png' });
    const ref = await uploadImage(D1, file);
    expect(ref).toMatch(new RegExp(`^cloud:${D1}/[0-9a-f-]{36}\\.png$`));
    const [path, sent, options] = storage.upload.mock.calls[0];
    expect(path).toBe(ref.slice('cloud:'.length));
    expect(sent).toBe(file);
    expect(options).toMatchObject({ contentType: 'image/png', upsert: false });
  });

  it('checks the file before sending it', async () => {
    await expect(uploadImage(D1, new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }))).rejects.toThrow(/PNG/);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('explains a refused upload', async () => {
    storage.upload.mockResolvedValue({ data: null, error: { message: 'new row violates row-level security policy' } });
    await expect(uploadImage(D1, new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }))).rejects.toThrow('Berechtigung');
  });
});

describe('signed addresses', () => {
  const ref = `cloud:${D1}/a.png`;

  it('fetches addresses once and remembers them', async () => {
    storage.createSignedUrls.mockResolvedValue({ data: [{ path: `${D1}/a.png`, signedUrl: 'https://s.example/a?t=1', error: null }], error: null });
    await useCloudImages.getState().ensure([ref, ref]);
    await useCloudImages.getState().ensure([ref]);
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(storage.createSignedUrls).toHaveBeenCalledWith([`${D1}/a.png`], 3600);
    expect(useCloudImages.getState().urls[ref]).toBe('https://s.example/a?t=1');
  });

  it('marks images that are not available instead of asking again and again', async () => {
    storage.createSignedUrls.mockResolvedValue({ data: [{ path: `${D1}/a.png`, signedUrl: null, error: 'Object not found' }], error: null });
    await useCloudImages.getState().ensure([ref]);
    await useCloudImages.getState().ensure([ref]);
    expect(useCloudImages.getState().urls[ref]).toBeNull();
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(1);
  });

  it('ignores references that are not well formed', async () => {
    await useCloudImages.getState().ensure(['cloud:kaputt']);
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });

  it('asks for a new address shortly before the old one runs out', async () => {
    storage.createSignedUrls.mockResolvedValue({ data: [{ path: `${D1}/a.png`, signedUrl: 'https://s.example/a?t=1', error: null }], error: null });
    await useCloudImages.getState().ensure([ref]);
    useCloudImages.setState({ expires: { [ref]: Date.now() + 60_000 } });
    await useCloudImages.getState().ensure([ref]);
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(2);
  });
});

describe('cloudImagesAsData', () => {
  it('reads the files as data addresses and flags missing ones', async () => {
    storage.download.mockResolvedValueOnce({ data: new Blob(['x'], { type: 'image/png' }), error: null }).mockResolvedValueOnce({ data: null, error: { message: 'gone' } });
    const out = await cloudImagesAsData([`cloud:${D1}/a.png`, `cloud:${D1}/b.png`, 'cloud:kaputt']);
    expect(out[`cloud:${D1}/a.png`]).toMatch(/^data:/);
    expect(out[`cloud:${D1}/b.png`]).toBeNull();
    expect(out['cloud:kaputt']).toBeNull();
  });
});

describe('cloneImages', () => {
  it('copies each file for the new diagram and rewrites the references', async () => {
    storage.copy.mockResolvedValue({ data: {}, error: null });
    const code = `A@{ img: "cloud:${D1}/a.png" }\nB@{ img: "cloud:${D1}/a.png" }\nC@{ img: "cloud:${D1}/b.jpg" }`;
    const out = await cloneImages(code, D2);
    expect(storage.copy).toHaveBeenCalledTimes(2);
    expect(storage.copy.mock.calls[0][0]).toBe(`${D1}/a.png`);
    expect(storage.copy.mock.calls[0][1]).toMatch(new RegExp(`^${D2}/[0-9a-f-]{36}\\.png$`));
    expect(out).not.toContain(D1);
    expect(refsIn(out)).toHaveLength(2); // both uses of a.png point at the same new file
  });

  it('leaves code without cloud images alone', async () => {
    expect(await cloneImages('flowchart TD\n A-->B', D2)).toBe('flowchart TD\n A-->B');
    expect(storage.copy).not.toHaveBeenCalled();
  });

  it('stops when a file cannot be copied', async () => {
    storage.copy.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
    await expect(cloneImages(`A@{ img: "cloud:${D1}/a.png" }`, D2)).rejects.toThrow();
  });
});

describe('removeDiagramImages', () => {
  it('removes every file of the diagram', async () => {
    storage.list.mockResolvedValue({ data: [{ name: 'a.png', id: '1' }, { name: 'b.jpg', id: '2' }], error: null });
    storage.remove.mockResolvedValue({ data: [], error: null });
    await removeDiagramImages(D1);
    expect(storage.list).toHaveBeenCalledWith(D1, { limit: 1000 });
    expect(storage.remove).toHaveBeenCalledWith([`${D1}/a.png`, `${D1}/b.jpg`]);
  });

  it('does nothing when there are no files', async () => {
    storage.list.mockResolvedValue({ data: [], error: null });
    await removeDiagramImages(D1);
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
