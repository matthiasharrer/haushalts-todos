<script lang="ts">
  import Spinner from '../lib/Spinner.svelte';
  import {
    getMcpConfig,
    listMcpClients,
    messageOf,
    renameMcpClient,
    revokeMcpClient,
    type McpClient,
    type McpConfig,
  } from '../lib/api';
  import ConfirmDialog from '../lib/ConfirmDialog.svelte';
  import { showToast } from '../lib/store.svelte';

  let config = $state<McpConfig | null>(null);
  let clients = $state<McpClient[]>([]);
  let loaded = $state(false);
  let loadError = $state<string | null>(null);

  let renamingId = $state<number | null>(null);
  let draft = $state('');
  let revoking = $state<McpClient | null>(null);
  let copied = $state(false);
  let urlInput: HTMLInputElement | undefined = $state();

  const endpointUrl = $derived(`${location.origin}${config?.endpoint ?? '/mcp'}`);

  async function load() {
    try {
      config = await getMcpConfig();
      clients = config.configured ? await listMcpClients() : [];
      loadError = null;
    } catch (e) {
      loadError = messageOf(e);
    } finally {
      loaded = true;
    }
  }
  load();

  async function copy() {
    try {
      await navigator.clipboard.writeText(endpointUrl);
    } catch {
      urlInput?.select(); // clipboard unavailable: leave it selected for a manual copy
      return;
    }
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  function startRename(c: McpClient) {
    renamingId = c.id;
    draft = c.name;
  }

  async function saveRename(c: McpClient) {
    const name = draft.trim();
    if (renamingId !== c.id) return;
    renamingId = null;
    if (name === '' || name === c.name) return;
    try {
      await renameMcpClient(c.id, name);
    } catch (e) {
      showToast(messageOf(e), { error: true });
    }
    await load();
  }

  async function revoke(c: McpClient) {
    revoking = null;
    try {
      await revokeMcpClient(c.id);
      showToast(`„${c.name}“ getrennt`);
    } catch (e) {
      showToast(messageOf(e), { error: true });
    }
    await load();
  }

  const date = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });
  const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<div class="settings">
  <section aria-labelledby="mcp-title">
    <h2 id="mcp-title">Claude verbinden</h2>
    {#if !loaded}
      <Spinner />
    {:else if loadError && !config}
      <p class="error" role="alert">{loadError}</p>
      <button type="button" class="btn" onclick={load}>Erneut versuchen</button>
    {:else if config && !config.configured}
      <div class="card">
        <p>
          Die Claude-Anbindung ist auf diesem Server nicht eingerichtet. Sie wird aktiv, sobald
          die Umgebungsvariable <code>MCP_TOKEN</code> gesetzt ist.
        </p>
      </div>
    {:else}
      <div class="card">
        <p>Adresse für Claude:</p>
        <div class="endpoint">
          <input
            type="text"
            readonly
            value={endpointUrl}
            aria-label="MCP-Adresse"
            bind:this={urlInput}
            onfocus={(e) => e.currentTarget.select()}
          />
          <button type="button" class="btn" onclick={copy}>{copied ? 'Kopiert' : 'Kopieren'}</button>
        </div>
        <ol class="howto">
          <li>In Claude: Einstellungen → Konnektoren → eigenen Konnektor hinzufügen.</li>
          <li>Die Adresse oben einfügen und bestätigen.</li>
          <li>Hier erscheint eine Freigabeseite: dort „Erlauben“ wählen.</li>
        </ol>
        <p class="hint">
          Alles, was Claude abhakt oder anlegt, wird dir zugeschrieben. Jede Person verbindet ihr
          eigenes Claude.
        </p>
      </div>
    {/if}
  </section>

  {#if config?.configured}
    <section aria-labelledby="clients-title">
      <h2 id="clients-title">Verbundene Clients</h2>
      {#if clients.length === 0}
        <p class="empty">Noch kein Client verbunden.</p>
      {:else}
        <ul class="clients">
          {#each clients as c (c.id)}
            <li class="client">
              {#if renamingId === c.id}
                <form
                  class="rename-row"
                  onsubmit={(e) => {
                    e.preventDefault();
                    saveRename(c);
                  }}
                >
                  <!-- svelte-ignore a11y_autofocus -->
                  <input
                    type="text"
                    aria-label="Name des Clients"
                    maxlength="100"
                    bind:value={draft}
                    autofocus
                    onkeydown={(e) => e.key === 'Escape' && (renamingId = null)}
                  />
                  <button type="submit" class="btn primary">Speichern</button>
                </form>
              {:else}
                <div class="client-name">{c.name}</div>
                <div class="sub">
                  <span>verbunden seit {date.format(new Date(c.createdAt))}</span>
                  <span>
                    {c.lastUsedAt
                      ? `zuletzt benutzt ${dateTime.format(new Date(c.lastUsedAt))}`
                      : 'noch nie benutzt'}
                  </span>
                </div>
                <div class="client-actions">
                  <button type="button" class="btn" onclick={() => startRename(c)}>Umbenennen</button>
                  <button type="button" class="btn danger-outline" onclick={() => (revoking = c)}>
                    Trennen
                  </button>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

{#if revoking}
  {@const target = revoking}
  <ConfirmDialog
    title={`„${target.name}“ trennen?`}
    message="Dieser Client verliert sofort den Zugriff. Du kannst ihn jederzeit neu verbinden."
    confirmLabel="Trennen"
    onconfirm={() => revoke(target)}
    oncancel={() => (revoking = null)}
  />
{/if}
