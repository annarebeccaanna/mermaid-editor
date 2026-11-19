import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(new URL(`../../supabase/templates/${name}`, import.meta.url), 'utf8');

describe.each(['magic-link.html', 'invite.html'])('mail template %s', (name) => {
  const html = read(name);

  it('puts the link in as a button and as plain text', () => {
    expect(html.match(/\{\{ \.ConfirmationURL \}\}/g)).toHaveLength(2);
    expect(html).toMatch(/href="\{\{ \.ConfirmationURL \}\}"/);
  });

  it('uses no variables Supabase does not know', () => {
    const used = [...html.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]);
    for (const v of used) expect(['.ConfirmationURL', '.SiteURL', '.Email', '.Token', '.TokenHash'], v).toContain(v);
  });

  it('names its subject and place in the comment on the first line', () => {
    expect(html.split('\n')[0]).toMatch(/Supabase: Authentication/);
    expect(html).toMatch(/Betreff: .+/);
  });

  it('loads nothing from other servers (no images, no scripts, no tracking)', () => {
    expect(html).not.toMatch(/<(img|script|link|iframe)\b/i);
    expect(html).not.toMatch(/https?:\/\//);
  });
});
