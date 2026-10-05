<script lang="ts">
  import type { Diagnostic } from '../layout/types';
  import { app } from '../state.svelte';

  let { onreveal }: { onreveal: (d: Diagnostic) => void } = $props();

  const lineOf = (offset: number) => app.source.slice(0, offset).split('\n').length;
  const ICON = { error: '●', warning: '▲', info: 'ℹ' } as const;
</script>

<div class="panel">
  {#if app.diagnostics.length === 0}
    <p class="empty">No problems. This layout is valid for {app.device.name}.</p>
  {/if}
  <ul>
    {#each app.diagnostics as d, i (i)}
      <li>
        <button
          class="problem {d.severity}"
          onclick={() => onreveal(d)}
          onpointerenter={() => (app.hovered = d.itemIndex ?? null)}
          onpointerleave={() => (app.hovered = null)}
        >
          <span class="sev" aria-label={d.severity}>{ICON[d.severity]}</span>
          <span class="text">{d.message}</span>
          <span class="line">Ln {lineOf(d.from)}</span>
        </button>
      </li>
    {/each}
  </ul>
  <p class="hint schema">
    Validated against <code>{app.schemaInfo.id}</code>
    ({app.schemaInfo.source === 'live' ? 'fetched from schemas.elgato.com' : 'bundled copy'}).
  </p>
</div>

<style>
  .schema {
    margin-top: 12px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .problem {
    display: grid;
    grid-template-columns: 16px 1fr auto;
    gap: 8px;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 12.5px;
    line-height: 1.4;
  }
  .problem:hover {
    background: var(--hover);
  }
  .error .sev {
    color: var(--error);
  }
  .warning .sev {
    color: var(--warning);
  }
  .info .sev {
    color: var(--info);
  }
  .line {
    color: var(--muted);
    font-family: var(--mono);
    font-size: 11px;
  }
</style>
