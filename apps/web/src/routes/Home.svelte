<script lang="ts">
  import Spinner from '../lib/Spinner.svelte';
  import {
    completeTask,
    createTask,
    deleteTask,
    listTasks,
    messageOf,
    skipTask,
    undoTask,
    updateTask,
    type SectionName,
    type Task,
    type TaskList,
    type TaskPatch,
  } from '../lib/api';
  import { addDays, berlinToday, weekdayDate, weekendDate } from '../lib/format';
  import Icon from '../lib/Icon.svelte';
  import { shared, showToast } from '../lib/store.svelte';
  import TaskRow from '../lib/TaskRow.svelte';
  import TaskSheet from '../lib/TaskSheet.svelte';

  const SECTIONS: { key: SectionName; label: string }[] = [
    { key: 'faellig', label: 'Fällig' },
    { key: 'irgendwann', label: 'Irgendwann' },
    { key: 'demnaechst', label: 'Demnächst' },
    { key: 'spaeter', label: 'Später' },
  ];

  let list = $state<TaskList | null>(null);
  let loadError = $state<string | null>(null);
  let spaeterOpen = $state(false);
  let editing = $state<Task | null>(null);
  let newTitle = $state('');
  let addInput: HTMLInputElement;
  let addForm: HTMLFormElement;

  // Quick-add options: due "Heute" by default, removable with one tap. The
  // chip row shows only while the bar has focus; the choice survives a blur
  // as long as there is text, and resets once the field is empty again.
  type DueChoice = 'today' | 'tomorrow' | 'weekend' | 'date' | 'none';
  const DUE_OPTIONS: { key: DueChoice; label: string }[] = [
    { key: 'today', label: 'Heute' },
    { key: 'tomorrow', label: 'Morgen' },
    { key: 'weekend', label: 'Wochenende' },
  ];
  let addDue = $state<DueChoice>('today');
  let addDate = $state('');
  let addHigh = $state(false);
  let addOpen = $state(false);
  let savedScroll = 0;

  const today = $derived(list?.today ?? berlinToday());
  const addHint = $derived(
    [
      addDue === 'none' && 'ohne Datum',
      addDue === 'tomorrow' && 'morgen',
      addDue === 'weekend' && 'Wochenende',
      addDue === 'date' && weekdayDate(addDate),
    ].find(Boolean) || null,
  );

  function dueDateFor(): string | undefined {
    if (addDue === 'today') return today;
    if (addDue === 'tomorrow') return addDays(today, 1);
    if (addDue === 'weekend') return weekendDate(today);
    if (addDue === 'date') return addDate || undefined;
    return undefined;
  }

  function resetAddOptions() {
    addDue = 'today';
    addDate = '';
    addHigh = false;
  }

  /** Tapping a chip or + must not blur the field (keyboard stays, row stays). */
  const keepFocus = (e: MouseEvent) => e.preventDefault();

  const pickDue = (key: DueChoice) => (addDue = addDue === key ? 'none' : key);

  function pickDate(e: Event) {
    addDate = (e.currentTarget as HTMLInputElement).value;
    addDue = addDate ? 'date' : 'none';
  }

  function openPicker(e: Event) {
    try {
      (e.currentTarget as HTMLInputElement).showPicker();
    } catch {
      // not supported or not allowed: the native tap behaviour opens it anyway
    }
  }

  function onAddFocusIn() {
    if (addOpen) return;
    savedScroll = window.scrollY;
    addOpen = true;
  }

  function onAddFocusOut(e: FocusEvent) {
    if (addForm.contains(e.relatedTarget as Node | null)) return;
    addOpen = false;
    if (!newTitle.trim()) resetAddOptions();
    // Phone browsers scroll the page when the keyboard opens for a fixed bar;
    // put the list back where it was once the keyboard is gone.
    const y = savedScroll;
    const restore = () => {
      if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    };
    window.visualViewport?.addEventListener('resize', restore, { once: true });
    setTimeout(restore, 400);
  }

  const total = $derived(
    list ? SECTIONS.reduce((n, s) => n + list!.sections[s.key].length, 0) : 0,
  );

  // Background refetches can overlap a mutation's; only the latest may land,
  // or an older response would put back a state from before the change.
  let latest = 0;
  async function refresh() {
    const seq = ++latest;
    try {
      const next = await listTasks();
      if (seq !== latest) return;
      list = next;
      loadError = null;
    } catch (e) {
      if (seq === latest) loadError = messageOf(e);
    }
  }

  /** Run a mutation, then always refetch so the list is truthful. Rethrows. */
  async function mutate<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } finally {
      await refresh();
    }
  }

  /** Mutation from the list itself: failures go to an error toast. */
  async function mutateWithToast(action: () => Promise<unknown>, onok?: () => void) {
    try {
      await mutate(action);
      onok?.();
    } catch (e) {
      showToast(messageOf(e), { error: true });
    }
  }

  // initial load, and again whenever something changed elsewhere (e.g. toast undo)
  $effect(() => {
    void shared.version;
    refresh();
  });

  const complete = (t: Task) =>
    mutateWithToast(
      () => completeTask(t.id),
      () => showToast(`„${t.title}“ erledigt`, { undo: () => undoTask(t.id) }),
    );

  async function quickAdd(e: Event) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    try {
      const dueDate = dueDateFor();
      await mutate(() =>
        createTask({ title, ...(dueDate && { dueDate }), ...(addHigh && { priority: 'HIGH' as const }) }),
      );
      newTitle = '';
      resetAddOptions();
    } catch (err) {
      showToast(messageOf(err), { error: true });
    }
    addInput.focus();
  }

  // Sheet actions: errors propagate to the sheet (inline); on success it closes.
  const sheet = {
    save: (t: Task) => async (patch: TaskPatch) => {
      await mutate(() => updateTask(t.id, patch));
      editing = null;
    },
    skip: (t: Task) => async () => {
      await mutate(() => skipTask(t.id));
      editing = null;
      showToast(`„${t.title}“ übersprungen`, { undo: () => undoTask(t.id) });
    },
    done: (t: Task) => async (date: string) => {
      await mutate(() => completeTask(t.id, date));
      editing = null;
      showToast(`„${t.title}“ erledigt`, { undo: () => undoTask(t.id) });
    },
    del: (t: Task) => async () => {
      await mutate(() => deleteTask(t.id));
      editing = null;
    },
  };
</script>

{#if loadError && !list}
  <p class="error" role="alert">{loadError}</p>
  <button type="button" class="btn" onclick={refresh}>Erneut versuchen</button>
{:else if !list}
  <Spinner />
{:else}
  {#if loadError}
    <p class="error" role="alert">{loadError}</p>
  {/if}
  {#if total === 0}
    <p class="empty-state">Alles erledigt. Neue Aufgaben kannst du unten eintragen.</p>
  {/if}
  {#each SECTIONS as s (s.key)}
    {@const tasks = list.sections[s.key]}
    {#if tasks.length > 0}
      <section class="section" class:quiet={s.key === 'demnaechst'} aria-label={s.label}>
        {#if s.key === 'spaeter'}
          <h2>
            <button
              type="button"
              class="section-toggle"
              aria-expanded={spaeterOpen}
              onclick={() => (spaeterOpen = !spaeterOpen)}
            >
              <span>{s.label}</span><span class="count">{tasks.length}</span>
              <span class="chev" class:open={spaeterOpen}><Icon name="chevron-down" size={20} /></span>
            </button>
          </h2>
        {:else}
          <h2><span>{s.label}</span><span class="count">{tasks.length}</span></h2>
        {/if}
        {#if s.key !== 'spaeter' || spaeterOpen}
          <ul class="tasks">
            {#each tasks as task (task.id)}
              <TaskRow
                {task}
                today={list.today}
                oncomplete={() => complete(task)}
                onedit={() => (editing = task)}
              />
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  {/each}
{/if}

<form
  class="quick-add"
  bind:this={addForm}
  onsubmit={quickAdd}
  onfocusin={onAddFocusIn}
  onfocusout={onAddFocusOut}
>
  {#if addOpen}
    <div class="add-opts" role="group" aria-label="Fälligkeit und Wichtigkeit">
      <button
        type="button"
        class="opt"
        aria-pressed={addHigh}
        onmousedown={keepFocus}
        onclick={() => (addHigh = !addHigh)}
      >
        <Icon name="flag" size={16} />Wichtig
      </button>
      <span class="opt-sep" aria-hidden="true"></span>
      {#each DUE_OPTIONS as o (o.key)}
        <button
          type="button"
          class="opt"
          aria-pressed={addDue === o.key}
          onmousedown={keepFocus}
          onclick={() => pickDue(o.key)}
        >
          {o.label}{#if addDue === o.key}<Icon name="x" size={14} />{/if}
        </button>
      {/each}
      <label class="opt" class:on={addDue === 'date'}>
        <Icon name="calendar" size={16} />{addDue === 'date' ? weekdayDate(addDate) : 'Datum …'}
        <input
          type="date"
          class="date-overlay"
          aria-label="Datum wählen"
          min={today}
          value={addDate}
          onchange={pickDate}
          onclick={openPicker}
        />
      </label>
    </div>
  {/if}
  <div class="add-row">
    <div class="add-field">
      <input
        bind:this={addInput}
        bind:value={newTitle}
        oninput={() => newTitle === '' && resetAddOptions()}
        type="text"
        placeholder="Neue Aufgabe…"
        aria-label="Neue Aufgabe"
        enterkeyhint="done"
        autocomplete="off"
        maxlength="200"
      />
      {#if !addOpen && newTitle && (addHint || addHigh)}
        <span class="add-hint" data-testid="add-hint">
          {#if addHint}<span>{addHint}</span>{/if}
          {#if addHigh}<span class="add-hint-flag" title="wichtig"><Icon name="flag" size={14} /></span>{/if}
        </span>
      {/if}
    </div>
    <button type="submit" class="add-btn" aria-label="Hinzufügen" onmousedown={keepFocus}><Icon name="plus" /></button>
  </div>
</form>

{#if editing && list}
  {#key editing.id}
    <TaskSheet
      task={editing}
      today={list.today}
      onclose={() => (editing = null)}
      onsave={sheet.save(editing)}
      onskip={sheet.skip(editing)}
      ondone={sheet.done(editing)}
      ondelete={sheet.del(editing)}
    />
  {/key}
{/if}
