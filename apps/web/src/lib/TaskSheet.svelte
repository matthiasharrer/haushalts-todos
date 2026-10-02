<script lang="ts">
  // Bottom-sheet dialog to edit one task (adapted from rezepte's CookLogSheet).
  // Native <dialog>: Escape and the backdrop tap close it. Actions are async
  // callbacks owned by the parent; a rejection shows inline here.
  import { onMount } from 'svelte';
  import type { Mode, Priority, Task, TaskPatch, Unit } from './api';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    task: Task;
    today: string;
    onclose: () => void;
    onsave: (patch: TaskPatch) => Promise<void>;
    onskip: () => Promise<void>;
    ondone: (date: string) => Promise<void>;
    ondelete: () => Promise<void>;
  }
  let { task, today, onclose, onsave, onskip, ondone, ondelete }: Props = $props();

  // The sheet edits a snapshot: a background refetch must not clobber typing.
  // svelte-ignore state_referenced_locally
  const t = task;
  let title = $state(t.title);
  let notes = $state(t.notes ?? '');
  let priority = $state<Priority>(t.priority);
  let dueDate = $state(t.dueDate ?? '');
  let repeat = $state(t.recurrence !== null);
  let every = $state(t.recurrence?.every ?? 1);
  let unit = $state<Unit>(t.recurrence?.unit ?? 'WEEK');
  let mode = $state<Mode>(t.recurrence?.mode ?? 'AFTER_COMPLETION');

  let showDone = $state(false);
  let doneDate = $state(yesterday());
  let confirmDelete = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let dialog: HTMLDialogElement;

  const isRecurring = $derived(t.recurrence !== null);
  const everyValid = $derived(Number.isInteger(every) && every >= 1 && every <= 1000);
  const canSave = $derived(
    title.trim() !== '' && !busy && (!repeat || (everyValid && dueDate !== '')),
  );

  function yesterday(): string {
    const [y, m, d] = today.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  }

  onMount(() => dialog.showModal());

  function toggleRepeat() {
    if (repeat && dueDate === '') dueDate = today;
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
        dueDate: dueDate === '' ? null : dueDate,
        recurrence: repeat ? { every, unit, mode } : null,
      }),
    );
  };

  const priorities: { value: Priority; label: string }[] = [
    { value: 'LOW', label: 'kann warten' },
    { value: 'NORMAL', label: 'normal' },
    { value: 'HIGH', label: 'wichtig' },
  ];
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
      <h2 id="sheet-title">Aufgabe bearbeiten</h2>
      <button type="button" class="icon-btn" aria-label="Schließen" onclick={onclose}>
        <Icon name="x" />
      </button>
    </header>

    <div class="sheet-body">
      <label class="field">
        <span class="label">Titel</span>
        <input type="text" bind:value={title} maxlength="200" autocomplete="off" />
      </label>

      <label class="field">
        <span class="label">Notizen</span>
        <textarea bind:value={notes} rows="2" maxlength="5000"></textarea>
      </label>

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

      <label class="switch-row">
        <input type="checkbox" bind:checked={repeat} onchange={toggleRepeat} />
        <span>Wiederholung</span>
      </label>

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
        </div>
      {/if}

      <div class="actions">
        {#if isRecurring}
          <button type="button" class="btn" disabled={busy} onclick={() => run(onskip)}>
            Diesmal überspringen
          </button>
        {/if}
        <button type="button" class="btn" aria-expanded={showDone} onclick={() => (showDone = !showDone)}>
          Erledigt am …
        </button>
        {#if showDone}
          <div class="done-row">
            <input type="date" bind:value={doneDate} max={today} aria-label="Erledigt am" />
            <button
              type="button"
              class="btn primary"
              disabled={busy || doneDate === '' || doneDate > today}
              onclick={() => run(() => ondone(doneDate))}
            >
              Eintragen
            </button>
          </div>
        {/if}
        <button type="button" class="btn danger-outline" disabled={busy} onclick={() => (confirmDelete = true)}>
          Löschen
        </button>
      </div>

      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </div>

    <footer class="sheet-foot">
      <button type="submit" class="btn primary wide" disabled={!canSave}>Speichern</button>
    </footer>
  </form>
</dialog>

{#if confirmDelete}
  <ConfirmDialog
    title={`„${t.title}“ löschen?`}
    message="Die Aufgabe verschwindet aus der Liste."
    confirmLabel="Löschen"
    oncancel={() => (confirmDelete = false)}
    onconfirm={() => {
      confirmDelete = false;
      run(ondelete);
    }}
  />
{/if}
