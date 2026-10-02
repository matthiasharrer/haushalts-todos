<script lang="ts">
  import { getMe, type Me } from '../lib/api';

  let me = $state<Me | null>(null);
  let error = $state<string | null>(null);

  getMe().then(
    (m) => (me = m),
    () => (error = 'Konnte Benutzer nicht laden.'),
  );
</script>

{#if error}
  <p class="error" role="alert">{error}</p>
{:else if me}
  <h2 class="greeting">Hallo, {me.displayName}</h2>
  <p class="empty">Noch keine Aufgaben.</p>
{:else}
  <p class="empty">Lädt …</p>
{/if}
