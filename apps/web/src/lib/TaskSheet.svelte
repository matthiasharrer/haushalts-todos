<script lang="ts">
  // Bottom-sheet dialog to edit one task (adapted from rezepte's CookLogSheet).
  // Native <dialog>: Escape and the backdrop tap close it. Actions are async
  // callbacks owned by the parent; a rejection shows inline here.
  import { onMount, tick } from 'svelte';
  import { issueHookToken, messageOf, type Mode, type Priority, type Refire, type Task, type TaskPatch, type Unit } from './api';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { MONTHS } from './format';
  import HookTokenDialog from './HookTokenDialog.svelte';
  import Icon from './Icon.svelte';
  import { linkify } from './linkify';
  import { invalidate } from './store.svelte';

  interface Props {
    /** Omit to create a new recurring chore (create mode). */
    task?: Task;
    today: string;
    onclose: () => void;
    onsave: (patch: TaskPatch & { title: string }) => Promise<void>;
    onskip?: () => Promise<void>;
    ondone?: (date: string) => Promise<void>;
    ondelete?: () => Promise<void>;
  }
  let { task, today, onclose, onsave, onskip, ondone, ondelete }: Props = $props();

  // The sheet edits a snapshot: a background refetch must not clobber typing.
  // svelte-ignore state_referenced_locally
  const t = task;
  const creating = t === undefined;
  let title = $state(t?.title ?? '');
  let notes = $state(t?.notes ?? '');
  // Existing notes open readable (full length, clickable links); the pencil switches to the textarea.
  let editingNotes = $state(!t?.notes);
  let notesEl = $state<HTMLTextAreaElement>();
  let priority = $state<Priority>(t?.priority ?? 'NORMAL');
  // svelte-ignore state_referenced_locally
  let dueDate = $state(t ? (t.dueDate ?? '') : today);
  // ADR-0010: one-off, recurring or trigger. Created from Routinen it is never a one-off (ADR-0007).
  type Kind = 'once' | 'recurring' | 'trigger';
  let kind = $state<Kind>(t ? (t.trigger ? 'trigger' : t.recurrence ? 'recurring' : 'once') : 'recurring');
  const repeat = $derived(kind === 'recurring');
  let refire = $state<Refire>(t?.trigger?.refire ?? 'PUSH');
  let hasToken = $state(t?.trigger?.hasToken ?? false);
  let issued = $state<{ url: string; token: string } | null>(null);
  let confirmToken = $state(false);
  let every = $state(t?.recurrence?.every ?? 1);
  let unit = $state<Unit>(t?.recurrence?.unit ?? 'WEEK');
  let mode = $state<Mode>(t?.recurrence?.mode ?? 'AFTER_COMPLETION');
  // ADR-0008: default window März–Oktober when the switch is turned on.
  let notify = $state(t?.notify ?? false);
  let seasonal = $state(!!t?.recurrence?.season);
  let seasonFrom = $state(t?.recurrence?.season?.from ?? 3);
  let seasonTo = $state(t?.recurrence?.season?.to ?? 10);

  let showDone = $state(false);
  let doneDate = $state(yesterday());
  let confirmDelete = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let dialog: HTMLDialogElement;

  const isRecurring = $derived(t?.recurrence != null);
  const isWaiting = $derived(t?.trigger != null && t.dueDate === null);
  const canSkip = $derived(isRecurring || (t?.trigger != null && t.dueDate !== null));
  const everyValid = $derived(Number.isInteger(every) && every >= 1 && every <= 1000);
  const canSave = $derived(
    title.trim() !== '' && !busy && (!repeat || (everyValid && dueDate !== '')),
  );

  function yesterday(): string {
    const [y, m, d] = today.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  }

  onMount(() => {
    dialog.showModal();
    fitNotes();
  });

  // The notes textarea grows with its content (field-sizing isn't in every browser yet).
  function fitNotes() {
    if (!notesEl) return;
    notesEl.style.height = 'auto';
    notesEl.style.height = `${notesEl.scrollHeight + notesEl.offsetHeight - notesEl.clientHeight}px`;
  }
  $effect(() => {
    void notes;
    fitNotes();
  });

  async function editNotes() {
    editingNotes = true;
    await tick();
    notesEl?.focus();
    notesEl?.setSelectionRange(notes.length, notes.length);
  }

  function setKind(k: Kind) {
    kind = k;
    if (k === 'recurring' && dueDate === '') dueDate = today;
    // A new trigger task is about being told: notify starts on (it can be turned off).
    if (k === 'trigger' && creating) notify = true;
  }

  async function newToken() {
    confirmToken = false;
    busy = true;
    error = null;
    try {
      issued = await issueHookToken(t!.id);
      hasToken = true;
      invalidate();
    } catch (e) {
      error = messageOf(e);
    } finally {
      busy = false;
    }
  }

  async function run(action: () => Promise<void>) {
    busy = true;
    error = null;
    try {
      await action();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Das hat nicht geklappt.';
      busy = false;
    }
  }

  const save = (e: Event) => {
    e.preventDefault();
    if (!canSave) return;
    return run(() =>
      onsave({
        title: title.trim(),
        notes: notes.trim() === '' ? null : notes,
        priority,
        notify,
        // A trigger task has no date to send: the server keeps it waiting or fired.
        dueDate: kind === 'trigger' ? undefined : dueDate === '' ? null : dueDate,
        recurrence: repeat
          ? { every, unit, mode, season: seasonal ? { from: seasonFrom, to: seasonTo } : null }
          : null,
        trigger: kind === 'trigger' ? { refire } : null,
      }),
    );
  };

  const priorities: { value: Priority; label: string }[] = [
    { value: 'LOW', label: 'kann warten' },
    { value: 'NORMAL', label: 'normal' },
    { value: 'HIGH', label: 'wichtig' },
  ];
  const kinds: { value: Kind; label: string }[] = [
    { value: 'once', label: 'Einmalig' },
    { value: 'recurring', label: 'Wiederkehrend' },
    { value: 'trigger', label: 'Auslöser' },
  ];
  const kindChoices = $derived(creating ? kinds.filter((k) => k.value !== 'once') : kinds);
  const units: { value: Unit; label: string }[] = [
    { value: 'DAY', label: 'Tage' },
    { value: 'WEEK', label: 'Wochen' },
    { value: 'MONTH', label: 'Monate' },
  ];
</script>

<dialog
  bind:this={dialog}
  class="sheet"
  aria-labelledby="sheet-title"
  oncancel={(e) => {
    e.preventDefault();
    onclose();
  }}
  onclick={(e) => {
    if (e.target === dialog) onclose();
  }}
>
  <form class="sheet-inner" onsubmit={save}>
    <header class="sheet-head">
      <h2 id="sheet-title">
        {creating ? (kind === 'trigger' ? 'Neue Auslöser-Aufgabe' : 'Neue wiederkehrende Aufgabe') : 'Aufgabe bearbeiten'}
      </h2>
      <button type="button" class="icon-btn" aria-label="Schließen" onclick={onclose}>
        <Icon name="x" />
      </button>
    </header>

    <div class="sheet-body">
      <label class="field">
        <span class="label">Titel</span>
        <input type="text" bind:value={title} maxlength="200" autocomplete="off" />
      </label>

      {#if editingNotes}
        <label class="field">
          <span class="label">Notizen</span>
          <textarea class="notes-input" bind:this={notesEl} bind:value={notes} rows="2" maxlength="5000"></textarea>
        </label>
      {:else}
        <div class="field">
          <div class="notes-head">
            <span class="label">Notizen</span>
            <button type="button" class="icon-btn" aria-label="Notizen bearbeiten" onclick={editNotes}>
              <Icon name="pencil" size={18} />
            </button>
          </div>
          <p class="notes-view">{#each linkify(notes) as seg}{#if seg.kind === 'link'}<a href={seg.href} target="_blank" rel="noopener noreferrer">{seg.label}</a>{:else}{seg.text}{/if}{/each}</p>
        </div>
      {/if}

      <fieldset class="field">
        <legend class="label">Priorität</legend>
        <div class="segmented">
          {#each priorities as p}
            <label class:selected={priority === p.value}>
              <input type="radio" name="priority" value={p.value} bind:group={priority} />
              <span>{p.label}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      <label class="switch-row">
        <input type="checkbox" bind:checked={notify} />
        <span>
          Benachrichtigen, wenn fällig
          <small class="switch-hint">Alle bekommen eine Push-Nachricht, sobald die Aufgabe dran ist.</small>
        </span>
      </label>

      <fieldset class="field">
        <legend class="label">Art</legend>
        <div class="segmented" class:two={kindChoices.length === 2}>
          {#each kindChoices as k}
            <label class:selected={kind === k.value}>
              <input type="radio" name="kind" value={k.value} checked={kind === k.value} onchange={() => setKind(k.value)} />
              <span>{k.label}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      {#if kind !== 'trigger'}
        <div class="field">
          <label class="label" for="due">Fällig am</label>
          <div class="date-row">
            <input id="due" type="date" bind:value={dueDate} required={repeat} />
            {#if !repeat && dueDate !== ''}
              <button type="button" class="btn" onclick={() => (dueDate = '')}>Kein Datum</button>
            {/if}
          </div>
          {#if !repeat && dueDate === ''}
            <p class="hint">Ohne Datum steht die Aufgabe unter „Irgendwann“.</p>
          {/if}
        </div>
      {:else}
        <fieldset class="modes">
          <legend class="label">Wenn schon fällig</legend>
          <label class="radio-row">
            <input type="radio" name="refire" value="PUSH" bind:group={refire} />
            <span>
              Erneut benachrichtigen
              <small>Löst Home Assistant nochmal aus, kommt die Push-Nachricht noch einmal.</small>
            </span>
          </label>
          <label class="radio-row">
            <input type="radio" name="refire" value="NONE" bind:group={refire} />
            <span>Nichts tun</span>
          </label>
        </fieldset>
        {#if creating || isWaiting}
          <p class="hint">Die Aufgabe wartet unsichtbar, bis Home Assistant sie auslöst. Dann ist sie fällig.</p>
        {/if}
      {/if}

      {#if kind === 'trigger' && !creating && !t?.trigger}
        <p class="hint">Nach dem Speichern kannst du hier den Token für Home Assistant erzeugen.</p>
      {:else if kind === 'trigger' && !creating}
        <div class="ha-block">
          <span class="label">Home Assistant</span>
          <p class="ha-state">{hasToken ? 'Token aktiv' : 'Kein Token'}</p>
          <button
            type="button"
            class="btn"
            disabled={busy}
            onclick={() => (hasToken ? (confirmToken = true) : newToken())}
          >
            {hasToken ? 'Neuen Token erzeugen' : 'Token erzeugen'}
          </button>
        </div>
      {/if}

      {#if repeat}
        <div class="repeat-box">
          <div class="every-row">
            <span>alle</span>
            <input
              type="number"
              inputmode="numeric"
              min="1"
              max="1000"
              bind:value={every}
              aria-label="Anzahl"
              class="every"
            />
            <select bind:value={unit} aria-label="Einheit">
              {#each units as u}<option value={u.value}>{u.label}</option>{/each}
            </select>
          </div>
          <fieldset class="modes">
            <legend class="sr-only">Art der Wiederholung</legend>
            <label class="radio-row">
              <input type="radio" name="mode" value="AFTER_COMPLETION" bind:group={mode} />
              <span>
                nach Erledigung
                <small>Die nächste Fälligkeit zählt ab dem Tag, an dem es erledigt wurde.</small>
              </span>
            </label>
            <label class="radio-row">
              <input type="radio" name="mode" value="FIXED" bind:group={mode} />
              <span>
                fester Rhythmus
                <small>Bleibt im festen Takt, egal wann es erledigt wird (z. B. Müll).</small>
              </span>
            </label>
          </fieldset>
          <label class="switch-row">
            <input type="checkbox" bind:checked={seasonal} />
            <span>Nur in bestimmten Monaten</span>
          </label>
          {#if seasonal}
            <div class="season-row">
              <label>
                <span class="label">von</span>
                <select bind:value={seasonFrom} aria-label="von">
                  {#each MONTHS as name, i}<option value={i + 1}>{name}</option>{/each}
                </select>
              </label>
              <label>
                <span class="label">bis</span>
                <select bind:value={seasonTo} aria-label="bis">
                  {#each MONTHS as name, i}<option value={i + 1}>{name}</option>{/each}
                </select>
              </label>
            </div>
          {/if}
        </div>
      {/if}

      {#if !creating}
      <div class="actions">
        {#if canSkip && onskip}
          <button type="button" class="btn" disabled={busy} onclick={() => run(onskip!)}>
            Diesmal überspringen
          </button>
        {/if}
        {#if !isWaiting}
        <button type="button" class="btn" aria-expanded={showDone} onclick={() => (showDone = !showDone)}>
          Erledigt am …
        </button>
        {/if}
        {#if showDone && !isWaiting}
          <div class="done-row">
            <input type="date" bind:value={doneDate} max={today} aria-label="Erledigt am" />
            <button
              type="button"
              class="btn primary"
              disabled={busy || doneDate === '' || doneDate > today}
              onclick={() => run(() => ondone!(doneDate))}
            >
              Eintragen
            </button>
          </div>
        {/if}
        <button type="button" class="btn danger-outline" disabled={busy} onclick={() => (confirmDelete = true)}>
          Löschen
        </button>
      </div>
      {/if}

      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </div>

    <footer class="sheet-foot">
      <button type="submit" class="btn primary wide" disabled={!canSave}>Speichern</button>
    </footer>
  </form>
</dialog>

{#if confirmDelete && t}
  <ConfirmDialog
    title={`„${t.title}“ löschen?`}
    message="Die Aufgabe verschwindet aus der Liste."
    confirmLabel="Löschen"
    oncancel={() => (confirmDelete = false)}
    onconfirm={() => {
      confirmDelete = false;
      run(ondelete!);
    }}
  />
{/if}

{#if confirmToken}
  <ConfirmDialog
    title="Neuen Token erzeugen?"
    message="Der alte Token funktioniert danach nicht mehr. Home Assistant muss den neuen bekommen."
    confirmLabel="Neuen Token erzeugen"
    oncancel={() => (confirmToken = false)}
    onconfirm={newToken}
  />
{/if}

{#if issued && t}
  <HookTokenDialog taskId={t.id} title={t.title} url={issued.url} token={issued.token} onclose={() => (issued = null)} />
{/if}
