<script lang="ts">
  // Shows a freshly generated trigger-task token once (ADR-0010), with the URL
  // and a ready-to-paste Home Assistant rest_command. Mounted with {#if}.
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';

  interface Props {
    taskId: number;
    title: string;
    url: string;
    token: string;
    onclose: () => void;
  }
  let { taskId, title, url, token, onclose }: Props = $props();

  let dialog: HTMLDialogElement;
  let pre: HTMLPreElement;
  let copied = $state<'yes' | 'select' | null>(null);
  onMount(() => dialog.showModal());

  /** "Waschmaschine fertig" -> "waschmaschine_fertig" (a valid HA service name part). */
  function slugOf(text: string, fallback: number): string {
    const slug = text
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return slug || String(fallback);
  }

  const snippet = $derived(
    `rest_command:\n  haushalt_${slugOf(title, taskId)}:\n    url: ${url}\n    method: POST\n    headers:\n      Authorization: Bearer ${token}\n`,
  );

  function selectSnippet() {
    const range = document.createRange();
    range.selectNodeContents(pre);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      copied = 'yes';
    } catch {
      // No clipboard access (insecure origin, denied): mark the text so a long-press copies it.
      selectSnippet();
      copied = 'select';
    }
  }
</script>

<dialog
  bind:this={dialog}
  class="confirm token-dialog"
  aria-labelledby="token-title"
  oncancel={(e) => {
    e.preventDefault();
    onclose();
  }}
>
  <h2 id="token-title">Token für „{title}“</h2>
  <p class="token-warn"><strong>Wird nur jetzt angezeigt.</strong> Kopiere es in deine Home-Assistant-Konfiguration.</p>
  <pre bind:this={pre} class="token-snippet" aria-label="Home-Assistant-Konfiguration">{snippet}</pre>
  <button type="button" class="btn wide copy-btn" onclick={copy}>
    <Icon name="copy" size={18} /> Kopieren
  </button>
  {#if copied === 'yes'}
    <p class="hint" role="status">Kopiert.</p>
  {:else if copied === 'select'}
    <p class="hint" role="status">Kopieren ging nicht. Der Text ist markiert, bitte von Hand kopieren.</p>
  {/if}
  <div class="confirm-actions">
    <button type="button" class="btn primary" onclick={onclose}>Fertig</button>
  </div>
</dialog>
