import mermaid from 'mermaid';
import type { Diagram } from '../model';
import { assetUrl } from '../desktop';
import { generate } from './generate';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'strict',
  // SVG text labels: exportable as PNG (foreignObject would taint the canvas)
  htmlLabels: false,
  flowchart: { htmlLabels: false, curve: 'basis' },
});

let counter = 0;

/** Code used for rendering: local image paths become loadable URLs. */
export function renderCode(d: Diagram, docPath: string | null): string {
  if (!d.nodes.some((n) => n.img)) return generate(d);
  return generate({ ...d, nodes: d.nodes.map((n) => (n.img ? { ...n, img: assetUrl(n.img, docPath) } : n)) });
}

export async function renderSvg(code: string): Promise<string> {
  const id = `mmd-render-${++counter}`;
  try {
    const { svg } = await mermaid.render(id, code);
    return svg;
  } finally {
    // mermaid leaves a temp element behind on errors
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
  }
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

/** Standalone SVG for export: transparent background, images embedded. */
export async function exportSvg(d: Diagram, docPath: string | null): Promise<string> {
  const svg = await renderSvg(renderCode(d, docPath));
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  root.removeAttribute('style'); // drops max-width so the file has a real size
  const vb = root.getAttribute('viewBox')?.split(/\s+/).map(Number);
  if (vb?.length === 4) {
    root.setAttribute('width', String(Math.ceil(vb[2])));
    root.setAttribute('height', String(Math.ceil(vb[3])));
  }
  for (const img of Array.from(doc.querySelectorAll('image'))) {
    const href = img.getAttribute('href') ?? img.getAttribute('xlink:href');
    if (!href || href.startsWith('data:')) continue;
    try {
      const res = await fetch(href);
      img.setAttribute('href', await toDataUrl(await res.blob()));
    } catch {
      /* leave external reference */
    }
  }
  return new XMLSerializer().serializeToString(doc);
}

/** PNG with transparent background at the given scale. */
export async function exportPng(d: Diagram, docPath: string | null, scale = 2): Promise<Blob> {
  const svg = await exportSvg(d, docPath);
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const w = Number(root.getAttribute('width')) || 800;
  const h = Number(root.getAttribute('height')) || 600;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG-Export fehlgeschlagen'))), 'image/png'));
}
