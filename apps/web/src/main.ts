import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { watchForUpdates } from './lib/appUpdate.svelte';
import { watchForChanges } from './lib/store.svelte';

export default mount(App, { target: document.getElementById('app')! });

// Offer a reload when a deploy shipped a newer build (ADR-0012).
watchForUpdates();

// Refetch on return to the foreground and every 30 s while visible.
watchForChanges();

// Service worker for Web Push only (ADR-0009): no caching, no fetch handler.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('service worker registration failed', e));
}
