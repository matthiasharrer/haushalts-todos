/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';

// appUpdate.svelte.ts uses the `$state` rune, which only the Svelte compiler
// provides. Under tsx it's a plain identity function; entryScript doesn't use it.
(globalThis as unknown as { $state: <T>(v: T) => T }).$state = (v) => v;
const { entryScript } = await import('./appUpdate.svelte.js');

test('entryScript: finds the hashed entry script of a Vite build', () => {
  const html = `<!doctype html><html><head><meta charset="UTF-8" />
    <script type="module" crossorigin src="/assets/index-AbC123.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-Zz9.css"></head><body><div id="app"></div></body></html>`;
  assert.equal(entryScript(html), '/assets/index-AbC123.js');
});

test('entryScript: an absolute URL reduces to its pathname', () => {
  const html = '<script type="module" src="https://app.example.de/assets/index-Q1.js"></script>';
  assert.equal(entryScript(html), '/assets/index-Q1.js');
});

test('entryScript: the Vite dev html has no hashed bundle', () => {
  const html = '<script type="module" src="/@vite/client"></script><script type="module" src="/src/main.ts"></script>';
  assert.equal(entryScript(html), null);
});

test('entryScript: a login page without assets is not a build', () => {
  const html = '<html><body><form action="/api/firstfactor"><input name="username"></form><script src="/static/login.js"></script></body></html>';
  assert.equal(entryScript(html), null);
});
