/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkify, linkLabel } from './linkify.js';

test('linkLabel keeps host and path, drops www, query and fragment', () => {
  assert.equal(
    linkLabel('https://www.example.de/shop/akku-2600.html?utm_source=x&ref=y#reviews'),
    'example.de/shop/akku-2600.html',
  );
  assert.equal(linkLabel('https://www.kaufland.at/product/497819613/'), 'kaufland.at/product/497819613');
  assert.equal(linkLabel('https://subtel.de/'), 'subtel.de');
  assert.equal(linkLabel('https://example.de/K%C3%BChlschrank'), 'example.de/Kühlschrank');
});

test('linkify splits text and links, href keeps the full URL', () => {
  const href = 'https://shop.de/a?utm_source=x';
  assert.deepEqual(linkify(`Hier: ${href} kaufen`), [
    { kind: 'text', text: 'Hier: ' },
    { kind: 'link', href, label: 'shop.de/a' },
    { kind: 'text', text: ' kaufen' },
  ]);
});

test('linkify leaves sentence punctuation and wrapping parens outside the link', () => {
  const segs = linkify('Siehe https://a.de/x. Oder (https://b.de/y), oder https://c.de/wiki/Foo_(Bar)!');
  const links = segs.filter((s) => s.kind === 'link').map((s) => s.href);
  assert.deepEqual(links, ['https://a.de/x', 'https://b.de/y', 'https://c.de/wiki/Foo_(Bar)']);
  assert.equal(segs.map((s) => (s.kind === 'text' ? s.text : s.href)).join(''), 'Siehe https://a.de/x. Oder (https://b.de/y), oder https://c.de/wiki/Foo_(Bar)!');
});

test('linkify on text without links returns it unchanged', () => {
  assert.deepEqual(linkify('Akku: 18650\n- vhbw'), [{ kind: 'text', text: 'Akku: 18650\n- vhbw' }]);
  assert.deepEqual(linkify(''), []);
});
