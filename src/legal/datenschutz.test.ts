import { describe, expect, it } from 'vitest';
import { POLICY, policyText } from './datenschutz';
import { findPlaceholders, splitPlaceholders } from './placeholders';

describe('placeholders', () => {
  it('finds each open detail once, in order', () => {
    expect(findPlaceholders('Name: [[NAME]], Mail: [[MAIL]], nochmal [[NAME]]')).toEqual(['NAME', 'MAIL']);
    expect(findPlaceholders('alles ausgefüllt')).toEqual([]);
  });

  it('splits text into plain parts and open details', () => {
    expect(splitPlaceholders('Hallo [[NAME]]!')).toEqual([
      { text: 'Hallo ', open: false },
      { text: 'NAME', open: true },
      { text: '!', open: false },
    ]);
    expect(splitPlaceholders('ohne')).toEqual([{ text: 'ohne', open: false }]);
    expect(splitPlaceholders('[[A]][[B]]').map((p) => p.text)).toEqual(['A', 'B']);
  });
});

describe('privacy text', () => {
  const text = policyText();

  it('names the parts a privacy statement needs', () => {
    const titles = POLICY.map((s) => s.title);
    for (const needed of ['Verantwortlich', 'Empfänger und Dienstleister', 'Wie lange wir Daten speichern', 'Deine Rechte']) {
      expect(titles).toContain(needed);
    }
  });

  it('covers the data the app really handles', () => {
    for (const word of ['E-Mail-Adresse', 'Vercel', 'Supabase', 'lokalen Speicher', 'Freigaben', 'IP-Adresse']) {
      expect(text, word).toContain(word);
    }
  });

  it('keeps open details in capitals and brackets so they stay easy to spot', () => {
    const open = findPlaceholders(text);
    expect(open.length).toBeGreaterThan(0);
    for (const p of open) expect(p, p).toMatch(/[A-ZÄÖÜ]{3}/);
  });

  it('has no empty sections', () => {
    for (const s of POLICY) expect((s.paragraphs?.length ?? 0) + (s.list?.length ?? 0) + (s.after?.length ?? 0), s.title).toBeGreaterThan(0);
  });
});
