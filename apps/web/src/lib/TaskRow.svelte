<script lang="ts">
  import type { Task } from './api';
  import { dueLabel, lastDoneLabel, recurrenceLabel, restingLabel } from './format';
  import Icon from './Icon.svelte';

  interface Props {
    task: Task;
    today: string;
    oncomplete: () => void;
    onedit: () => void;
  }
  let { task, today, oncomplete, onedit }: Props = $props();

  const due = $derived(
    task.resting && task.dueDate ? restingLabel(task.dueDate) : dueLabel(task.dueDate, today),
  );
  const overdue = $derived(task.dueDate !== null && task.dueDate < today);
  const rec = $derived(recurrenceLabel(task.recurrence));
  const last = $derived(lastDoneLabel(task.lastDone, today));
</script>

<li class="row" class:low={task.priority === 'LOW'} class:resting={task.resting}>
  <button type="button" class="check" aria-label={`Erledigt: ${task.title}`} onclick={oncomplete}>
    <span class="circle"><Icon name="check" size={16} /></span>
  </button>
  <button type="button" class="task-body" aria-label={`Bearbeiten: ${task.title}`} onclick={onedit}>
    <span class="title">{task.title}</span>
    {#if task.priority === 'HIGH' || due || rec || last || task.notify}
      <span class="sub">
        {#if task.priority === 'HIGH'}<span class="badge">wichtig</span>{/if}
        {#if due}<span class="due" class:overdue>{due}</span>{/if}
        {#if rec}<span>{rec}{task.recurrence?.mode === 'FIXED' ? ' · fest' : ''}</span>{/if}
        {#if last}<span>{last}</span>{/if}
        {#if task.notify}<span class="bell" role="img" aria-label="benachrichtigt"><Icon name="bell" size={13} /></span>{/if}
      </span>
    {/if}
  </button>
</li>
