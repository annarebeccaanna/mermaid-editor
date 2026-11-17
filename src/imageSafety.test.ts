import { describe, expect, it, vi } from 'vitest';

// desktop.ts looks at `window` while it is loaded
vi.stubGlobal('window', {});
const { BLOCKED_IMAGE, countExternalImages, imageSrc, isExternalImage } = await import('./imageSafety');

describe('isExternalImage', () => {
  it('knows web addresses, also when disguised', () => {
    for (const img of [
      'https://tracker.example/p.png',
      'HTTP://tracker.example/p.png',
      '//tracker.example/p.png',
      'ht\ttps://tracker.example/p.png', // the browser drops the tab
      'https:\n//tracker.example/p.png',
      '\u0001  https://tracker.example/p.png', // leading control characters are trimmed
      'https:\\\\tracker.example\\p.png', // backslashes count as slashes
      '\\\\tracker.example\\p.png',
    ]) {
      expect(isExternalImage(img), JSON.stringify(img)).toBe(true);
    }
  });

  it('leaves local references alone', () => {
    for (const img of ['logo.png', 'img/a b.png', '/home/me/a.png', 'C:\\bilder\\a.png', 'data:image/png;base64,AAAA', 'blob:http://localhost/abc', 'mmd-asset://local/x']) {
      expect(isExternalImage(img), img).toBe(false);
    }
  });
});

describe('imageSrc', () => {
  it('blocks external images until they are allowed', () => {
    expect(imageSrc('https://tracker.example/p.png', null, false)).toBe(BLOCKED_IMAGE);
    expect(imageSrc('ht\ttps://tracker.example/p.png', null, false)).toBe(BLOCKED_IMAGE);
    expect(imageSrc('https://tracker.example/p.png', null, true)).toBe('https://tracker.example/p.png');
  });

  it('never loads unknown schemes', () => {
    expect(imageSrc('javascript:alert(1)', null, true)).toBe(BLOCKED_IMAGE);
    expect(imageSrc('ftp://example.com/a.png', null, true)).toBe(BLOCKED_IMAGE);
    expect(imageSrc(' JaVaScRiPt:alert(1)', null, true)).toBe(BLOCKED_IMAGE);
  });

  it('passes data images and plain paths through', () => {
    expect(imageSrc('data:image/png;base64,AAAA', null, false)).toBe('data:image/png;base64,AAAA');
    expect(imageSrc('logo.png', null, false)).toBe('logo.png');
  });
});

describe('countExternalImages', () => {
  it('counts only nodes whose image is on another server', () => {
    expect(countExternalImages([{ img: 'https://a.example/x.png' }, { img: 'logo.png' }, {}, { img: '//b.example/y.png' }])).toBe(2);
  });
});
