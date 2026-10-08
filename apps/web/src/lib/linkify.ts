// Splits plain-text notes into text and link segments for rendering. No HTML is
// produced here: the component renders each segment as text or <a>, so notes
// written by anyone (including an LLM via MCP) can't inject markup.

export type Segment = { kind: 'text'; text: string } | { kind: 'link'; href: string; label: string };

const URL_RE = /https?:\/\/[^\s<>"']+/g;
// Punctuation that usually ends the sentence, not the URL.
const TRAILING = /[.,;:!?'"»“”]+$/;

/** Trims sentence punctuation and an unbalanced closing paren off a matched URL. */
function trimUrl(raw: string): string {
  let url = raw.replace(TRAILING, '');
  while (url.endsWith(')') && count(url, '(') < count(url, ')')) {
    url = url.slice(0, -1).replace(TRAILING, '');
  }
  return url;
}

function count(s: string, ch: string): number {
  return s.split(ch).length - 1;
}

/**
 * What a link shows: host (without "www.") and path, without query and
 * fragment (tracking noise). The href keeps the full URL.
 */
export function linkLabel(href: string): string {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return href;
  }
  const host = u.hostname.replace(/^www\./, '');
  let path = u.pathname;
  try {
    path = decodeURI(path);
  } catch {
    // keep it encoded
  }
  return host + (path === '/' ? '' : path.replace(/\/$/, ''));
}

export function linkify(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const href = trimUrl(m[0]);
    const start = m.index;
    if (start > last) out.push({ kind: 'text', text: text.slice(last, start) });
    out.push({ kind: 'link', href, label: linkLabel(href) });
    last = start + href.length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}
