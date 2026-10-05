<script lang="ts">
  import { itemDefaults, itemModel } from '../layout/schema';
  import { app } from '../state.svelte';

  const SOURCES = {
    layout: { label: 'JSON', meaning: 'Set in the layout JSON.' },
    feedback: { label: 'setFeedback', meaning: 'Set at runtime by setFeedback; overrides the JSON. Shown in "With Feedback" mode.' },
    default: { label: 'default', meaning: 'Not set anywhere, so Stream Deck uses its documented default.' },
  } as const;

  const renderIndex = $derived(app.renderIndexOf(app.selected));
  const defined = $derived(renderIndex >= 0 ? app.layoutItems[renderIndex] : null);
  const effective = $derived(renderIndex >= 0 ? app.renderedItems[renderIndex] : null);
  const patch = $derived(defined ? app.feedbackState[defined.key] : undefined);

  const rows = $derived.by(() => {
    if (!defined || !effective) return [];
    void app.schemaVersion;
    // Documented defaults from the schema.
    const defaults = itemDefaults(defined.type);
    const keys = [...new Set([...Object.keys(defined), ...Object.keys(effective), ...Object.keys(defaults)])];
    return keys.map((k) => {
      const eff = (effective as unknown as Record<string, unknown>)[k];
      const source: 'feedback' | 'layout' | 'default' =
        patch && k in patch && app.mode === 'feedback' ? 'feedback' : k in defined ? 'layout' : 'default';
      const value = eff !== undefined ? eff : defaults[k];
      return { k, value, source };
    });
  });

  function show(k: string, v: unknown): string {
    if (typeof v === 'string' && v.length > 60) return JSON.stringify(v.slice(0, 57) + '…');
    const s = JSON.stringify(v);
    const name = defined && itemModel(defined.type).properties[k]?.optionNames.get(v);
    return name ? `${s} (${name})` : (s ?? 'undefined');
  }
</script>

<div class="panel">
  {#if !defined}
    <p class="empty">Select an item in the preview or place the cursor inside it in the editor.</p>
  {:else}
    <table>
      <tbody>
        {#each rows as r (r.k)}
          <tr class={r.source}>
            <th>{r.k}</th>
            <td><code>{show(r.k, r.value)}</code></td>
            <td class="src"><span class="badge {r.source}">{SOURCES[r.source].label}</span></td>
          </tr>
        {/each}
      </tbody>
    </table>
    <dl class="legend" aria-label="Where each value comes from">
      {#each Object.entries(SOURCES) as [key, s] (key)}
        <dt><span class="badge {key}">{s.label}</span></dt>
        <dd>{s.meaning}</dd>
      {/each}
    </dl>
  {/if}
</div>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
  }
  th {
    text-align: left;
    font-weight: 500;
    font-family: var(--mono);
    padding: 3px 8px 3px 0;
    white-space: nowrap;
    width: 1%;
  }
  td {
    padding: 3px 0;
    word-break: break-all;
  }
  td.src {
    text-align: right;
    width: 1%;
    padding-left: 8px;
    white-space: nowrap;
    word-break: normal;
  }
  tr.default th,
  tr.default code {
    color: var(--muted);
  }
  tr.feedback code {
    color: var(--feedback);
  }
  .badge {
    display: inline-block;
    padding: 0 6px;
    border-radius: 4px;
    border: 1px solid transparent;
    font: 10.5px/16px var(--mono);
  }
  .badge.layout {
    background: var(--accent-bg);
    color: var(--accent);
  }
  .badge.feedback {
    background: #d59cff1f;
    color: var(--feedback);
  }
  .badge.default {
    border-color: var(--border-strong);
    color: var(--muted);
  }
  .legend {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 10px;
    align-items: baseline;
    margin: 14px 0 0;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--muted);
  }
  .legend dt {
    justify-self: end;
  }
  .legend dd {
    margin: 0;
  }
</style>
