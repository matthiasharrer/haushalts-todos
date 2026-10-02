<script lang="ts">
  // Inline SVG icons (24x24, 2px round stroke; geometry after Lucide, paths hand-rolled).
  export type IconName = 'check' | 'plus' | 'x' | 'chevron-down' | 'repeat';

  const icons: Record<IconName, string[]> = {
    check: ['M5 12.5l4.5 4.5L19 7.5'],
    plus: ['M12 5v14', 'M5 12h14'],
    x: ['M6 6l12 12', 'M18 6L6 18'],
    'chevron-down': ['M6 9l6 6 6-6'],
    repeat: ['M17 2l4 4-4 4', 'M3 11V9a3 3 0 0 1 3-3h15', 'M7 22l-4-4 4-4', 'M21 13v2a3 3 0 0 1-3 3H3'],
  };

  let { name, size = 22 }: { name: IconName; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2.25"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#each icons[name] as d}<path {d} />{/each}
</svg>
