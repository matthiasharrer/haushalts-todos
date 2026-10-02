<script lang="ts">
  import { messageOf } from './api';
  import { clearToast, invalidate, shared, showToast } from './store.svelte';

  async function undo() {
    const fn = shared.toast?.undo;
    if (!fn) return;
    clearToast();
    try {
      await fn();
    } catch (e) {
      showToast(messageOf(e), { error: true });
    } finally {
      invalidate();
    }
  }
</script>

{#if shared.toast}
  {#key shared.toast.id}
    <div class="toast" class:toast-error={shared.toast.error} role={shared.toast.error ? 'alert' : 'status'}>
      <span class="toast-text">{shared.toast.text}</span>
      {#if shared.toast.undo}
        <button type="button" class="toast-action" onclick={undo}>Rückgängig</button>
      {/if}
    </div>
  {/key}
{/if}
