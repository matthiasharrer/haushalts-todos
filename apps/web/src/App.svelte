<script lang="ts">
  import { getMe, type Me } from './lib/api';
  import Icon from './lib/Icon.svelte';
  import Toast from './lib/Toast.svelte';
  import Home from './routes/Home.svelte';
  import Recurring from './routes/Recurring.svelte';
  import Settings from './routes/Settings.svelte';

  let me = $state<Me | null>(null);
  getMe().then(
    (m) => (me = m),
    () => {},
  );

  // Two views, in the URL hash so reload and browser-back keep working.
  type View = 'home' | 'recurring' | 'settings';
  const viewOf = (hash: string): View =>
    hash === '#/routinen' || hash === '#/wiederkehrend' ? 'recurring' : hash === '#/einstellungen' ? 'settings' : 'home';
  let view = $state<View>(viewOf(location.hash));
</script>

<svelte:window onhashchange={() => (view = viewOf(location.hash))} />

<div class="app" class:with-add={view === 'home'}>
  <header class="app-bar">
    <h1><a class="home-link" href="#/">Haushalt</a></h1>
    <a
      class="me-link"
      href="#/einstellungen"
      aria-label="Einstellungen"
      aria-current={view === 'settings' ? 'page' : undefined}
    >
      {#if me}<span class="greeting">Hallo, {me.displayName}</span>{/if}
      <Icon name="settings" size={20} />
    </a>
  </header>
  <main class="page">
    {#if view === 'home'}<Home />{:else if view === 'recurring'}<Recurring />{:else}<Settings />{/if}
  </main>
  <Toast />
  <nav class="tab-bar" aria-label="Ansicht">
    <a href="#/" aria-current={view === 'home' ? 'page' : undefined}>
      <Icon name="list" /><span>Aufgaben</span>
    </a>
    <a href="#/routinen" aria-current={view === 'recurring' ? 'page' : undefined}>
      <Icon name="repeat" /><span>Routinen</span>
    </a>
  </nav>
</div>
