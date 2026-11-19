import { describe, expect, it, vi } from 'vitest';

// desktop.ts looks at `window` while it is loaded
vi.stubGlobal('window', {});
const { BLOCKED_IMAGE, MISSING_IMAGE, PENDING_IMAGE, countExternalImages, imageSrc, isExternalImage } = await import('./imageSafety');

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

describe('cloud images', () => {
  const ref = 'cloud:11111111-1111-4111-8111-111111111111/a.png';

  it('are not other servers, so they are never blocked as such', () => {
    expect(isExternalImage(ref)).toBe(false);
    expect(countExternalImages([{ img: ref }])).toBe(0);
  });

  it('show a placeholder until their address is known, then the address', () => {
    expect(imageSrc(ref, null, false)).toBe(PENDING_IMAGE);
    expect(imageSrc(ref, null, false, { [ref]: 'https://s.example/a?t=1' })).toBe('https://s.example/a?t=1');
  });

  it('show another placeholder when the image is not available or the reference is broken', () => {
    expect(imageSrc(ref, null, true, { [ref]: null })).toBe(MISSING_IMAGE);
    expect(imageSrc('cloud:kaputt', null, true)).toBe(MISSING_IMAGE);
    expect(imageSrc('cloud:../../x', null, true, { 'cloud:../../x': 'https://evil.example/x' })).toBe(MISSING_IMAGE);
  });

  it('do not let a disguised reference slip past the checks', () => {
    expect(imageSrc('cl\toud:11111111-1111-4111-8111-111111111111/a.png', null, false, { [ref]: 'https://s.example/a' })).toBe('https://s.example/a');
  });
});
