<script lang="ts">
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

  const total = $derived(
    list ? SECTIONS.reduce((n, s) => n + list!.sections[s.key].length, 0) : 0,
  );

  async function refresh() {
    try {
      list = await listTasks();
      loadError = null;
    } catch (e) {
      loadError = messageOf(e);
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
      await mutate(() => createTask(title));
      newTitle = '';
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
  <p class="empty">Lädt …</p>
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

<form class="quick-add" onsubmit={quickAdd}>
  <input
    bind:this={addInput}
    bind:value={newTitle}
    type="text"
    placeholder="Neue Aufgabe…"
    aria-label="Neue Aufgabe"
    enterkeyhint="done"
    autocomplete="off"
    maxlength="200"
  />
  <button type="submit" class="add-btn" aria-label="Hinzufügen"><Icon name="plus" /></button>
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
