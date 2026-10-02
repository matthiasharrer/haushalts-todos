<script lang="ts">
  import { getMe, type Me } from './lib/api';
  import Home from './routes/Home.svelte';

  let me = $state<Me | null>(null);
  getMe().then(
    (m) => (me = m),
    () => {},
  );
</script>

<header class="app-bar">
  <h1>Haushalt</h1>
  {#if me}<span class="greeting">Hallo, {me.displayName}</span>{/if}
</header>
<main class="page"><Home /></main>
