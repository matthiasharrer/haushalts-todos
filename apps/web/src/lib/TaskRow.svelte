<script lang="ts">
  import type { Task } from './api';
  import { dueLabel, lastDoneLabel, recurrenceLabel, restingLabel, triggerLabel } from './format';
  import Icon from './Icon.svelte';

  interface Props {
    task: Task;
    today: string;
    /** Routinen list: a trigger task shows its state ("wartet", "ausgelöst …") instead of the date. */
    showTrigger?: boolean;
    oncomplete: () => void;
    onedit: () => void;
  }
  let { task, today, showTrigger = false, oncomplete, onedit }: Props = $props();

  const waiting = $derived(task.trigger !== null && task.dueDate === null);
  const due = $derived(
    showTrigger && task.trigger
      ? null
      : task.resting && task.dueDate
        ? restingLabel(task.dueDate)
        : dueLabel(task.dueDate, today),
  );
  const state = $derived(showTrigger && task.trigger ? triggerLabel(task.trigger, task.dueDate, today) : null);
  const overdue = $derived(task.dueDate !== null && task.dueDate < today);
  const rec = $derived(recurrenceLabel(task.recurrence));
  const last = $derived(lastDoneLabel(task.lastDone, today));
</script>

<li class="row" class:low={task.priority === 'LOW'} class:resting={task.resting || waiting}>
  <button
    type="button"
    class="check"
    aria-label={`Erledigt: ${task.title}`}
    disabled={waiting}
    onclick={oncomplete}
  >
    <span class="circle"><Icon name="check" size={16} /></span>
  </button>
  <button type="button" class="task-body" aria-label={`Bearbeiten: ${task.title}`} onclick={onedit}>
    <span class="title">
      {#if task.trigger}<span class="bolt" role="img" aria-label="Auslöser"><Icon name="bolt" size={14} /></span>{/if}{task.title}
    </span>
    {#if task.priority === 'HIGH' || due || state || rec || last || task.notify || task.notes}
      <span class="sub">
        {#if task.priority === 'HIGH'}<span class="badge">wichtig</span>{/if}
        {#if due}<span class="due" class:overdue>{due}</span>{/if}
        {#if state}<span class="due">{state}</span>{/if}
        {#if rec}<span>{rec}{task.recurrence?.mode === 'FIXED' ? ' · fest' : ''}</span>{/if}
        {#if last}<span>{last}</span>{/if}
        {#if task.notify}<span class="sub-icon" role="img" aria-label="benachrichtigt"><Icon name="bell" size={13} /></span>{/if}
        {#if task.notes}<span class="sub-icon" role="img" aria-label="hat Notizen"><Icon name="note" size={13} /></span>{/if}
      </span>
    {/if}
  </button>
</li>
