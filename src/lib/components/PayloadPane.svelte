<script lang="ts">
  import { feedbackSnippet } from '../layout/feedback';
  import { app } from '../state.svelte';
  import { payloadHints, typeHints } from '../editor/hints';
  import Editor from './Editor.svelte';

  const hints = typeHints(payloadHints(() => app.layoutItems));

  const counts = $derived({
    error: app.payloadDiagnostics.filter((d) => d.severity === 'error').length,
    warning: app.payloadDiagnostics.filter((d) => d.severity === 'warning').length,
  });

  let copied = $state(false);
  async function copy() {
    if (!app.payload) return;
    await navigator.clipboard.writeText(feedbackSnippet(app.payload));
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }
</script>

<div class="pane-header">
  <span class="title">
    Live feedback <code>setFeedback(…)</code>
    {#if counts.error}<span class="error">● invalid JSON</span>{:else if counts.warning}<span class="warning">▲ {counts.warning}</span>{/if}
  </span>
  <span class="actions">
    <label title="Apply the payload on every edit"><input type="checkbox" checked={app.live} onchange={(e) => app.setLive(e.currentTarget.checked)} /> Live</label>
    <button onclick={() => app.resetPayloadToSample()} title="Replace with a sample payload for this layout">Sample</button>
    <button onclick={copy} disabled={!app.payload} title="Copy as plugin code">{copied ? 'Copied ✓' : 'Copy code'}</button>
    <button onclick={() => app.resetFeedback()} disabled={app.events.length === 0} title="Clear all feedback and show the layout as defined"
      >Reset</button
    >
    <button class="primary" onclick={() => app.sendPayload()} disabled={!app.payload} title="Send (⌘↵ / Ctrl+↵)">Send</button>
  </span>
</div>
<div class="editor-wrap">
  <Editor
    label="setFeedback payload"
    extensions={hints}
    value={app.payloadText}
    diagnostics={app.payloadDiagnostics}
    onchange={(v) => app.setPayloadText(v)}
    onsubmit={() => app.sendPayload()}
  />
</div>

<style>
  .title {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .title code {
    color: var(--muted);
    font-size: 11px;
  }
  .actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .actions label {
    display: flex;
    gap: 4px;
    align-items: center;
    margin-right: 4px;
  }
  .actions button {
    padding: 2px 8px;
    font-size: 12px;
  }
  .error {
    color: var(--error);
  }
  .warning {
    color: var(--warning);
  }
  .editor-wrap {
    flex: 1;
    min-height: 0;
  }
</style>
