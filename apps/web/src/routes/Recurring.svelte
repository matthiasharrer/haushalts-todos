<script lang="ts">
  import Spinner from '../lib/Spinner.svelte';
  import {
    completeTask,
    createTask,
    deleteTask,
    listRecurring,
    messageOf,
    skipTask,
    undoTask,
    updateTask,
    type RecurringList,
    type Task,
    type TaskPatch,
  } from '../lib/api';
  import Icon from '../lib/Icon.svelte';
  import { shared, showToast } from '../lib/store.svelte';
  import TaskRow from '../lib/TaskRow.svelte';
  import TaskSheet from '../lib/TaskSheet.svelte';

  let data = $state<RecurringList | null>(null);
  let loadError = $state<string | null>(null);
  let editing = $state<Task | null>(null);
  let creating = $state(false);

  async function refresh() {
    try {
      data = await listRecurring();
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

  // initial load, and again whenever something changed elsewhere (e.g. toast undo)
  $effect(() => {
    void shared.version;
    refresh();
  });

  async function complete(t: Task) {
    try {
      await mutate(() => completeTask(t.id));
      showToast(`„${t.title}“ erledigt`, { undo: () => undoTask(t.id) });
    } catch (e) {
      showToast(messageOf(e), { error: true });
    }
  }

  // Sheet actions: errors propagate to the sheet (inline); on success it closes.
  const sheet = {
    create: async (input: TaskPatch & { title: string }) => {
      await mutate(() => createTask(input));
      creating = false;
    },
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

{#if loadError && !data}
  <p class="error" role="alert">{loadError}</p>
  <button type="button" class="btn" onclick={refresh}>Erneut versuchen</button>
{:else if !data}
  <Spinner />
{:else}
  {#if loadError}
    <p class="error" role="alert">{loadError}</p>
  {/if}
  {#if data.tasks.length === 0}
    <p class="empty-state">
      Noch keine wiederkehrenden Aufgaben. Lege eine an, z. B. „Bettwäsche wechseln“ alle 2 Wochen.
    </p>
  {:else}
    <section class="section" aria-label="Wiederkehrende Aufgaben">
      <h2><span>Nächste Fälligkeit</span><span class="count">{data.tasks.length}</span></h2>
      <ul class="tasks">
        {#each data.tasks as task (task.id)}
          <TaskRow
            {task}
            today={data.today}
            oncomplete={() => complete(task)}
            onedit={() => (editing = task)}
          />
        {/each}
      </ul>
    </section>
  {/if}
  <button type="button" class="btn primary new-recurring" onclick={() => (creating = true)}>
    <Icon name="plus" size={20} /> Neue wiederkehrende Aufgabe
  </button>
{/if}

{#if creating && data}
  <TaskSheet today={data.today} onclose={() => (creating = false)} onsave={sheet.create} />
{/if}

{#if editing && data}
  {#key editing.id}
    <TaskSheet
      task={editing}
      today={data.today}
      onclose={() => (editing = null)}
      onsave={sheet.save(editing)}
      onskip={sheet.skip(editing)}
      ondone={sheet.done(editing)}
      ondelete={sheet.del(editing)}
    />
  {/key}
{/if}
