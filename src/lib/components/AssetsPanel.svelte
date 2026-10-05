<script lang="ts">
  import { app } from '../state.svelte';
  import { readAsDataUrl } from '../util';

  let dragging = $state(false);

  async function add(files: FileList | File[] | null) {
    for (const file of Array.from(files ?? [])) {
      if (!file.type.startsWith('image/')) continue;
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      // Drop the top-level folder so "MyPlugin.sdPlugin/imgs/a.png" -> "imgs/a.png".
      const rel = path.includes('/') ? path.split('/').slice(1).join('/') : path;
      // Skip unreadable files rather than stalling the rest of the batch.
      const url = await readAsDataUrl(file).catch(() => null);
      if (url) app.assets[rel] = url;
    }
  }
</script>

<div class="panel">
  <p class="hint">
    Pixmap values like <code>"imgs/icon.png"</code> refer to files in your plugin folder. Add them here (or select your
    <code>.sdPlugin</code> folder) to render them. Images stay in this browser tab and are never uploaded anywhere.
  </p>
  <div
    class="drop"
    class:dragging
    role="region"
    aria-label="Image drop zone"
    ondragover={(e) => {
      e.preventDefault();
      dragging = true;
    }}
    ondragleave={() => (dragging = false)}
    ondrop={(e) => {
      e.preventDefault();
      dragging = false;
      add(e.dataTransfer?.files ?? null);
    }}
  >
    Drop images here
    <span class="row">
      <label class="button">Choose files<input type="file" accept="image/*" multiple hidden onchange={(e) => add(e.currentTarget.files)} /></label>
      <label class="button">Choose folder<input type="file" webkitdirectory multiple hidden onchange={(e) => add(e.currentTarget.files)} /></label>
    </span>
  </div>
  <ul>
    {#each Object.entries(app.assets) as [name, url] (name)}
      <li>
        <img src={url} alt="" />
        <code>{name}</code>
        <button class="icon" title="Remove" onclick={() => delete app.assets[name]}>×</button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .drop {
    border: 1px dashed var(--border-strong);
    border-radius: 8px;
    padding: 16px;
    display: grid;
    gap: 10px;
    justify-items: center;
    color: var(--muted);
    font-size: 13px;
  }
  .drop.dragging {
    border-color: var(--accent);
    background: var(--accent-bg);
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 12px 0 0;
    display: grid;
    gap: 4px;
  }
  li {
    display: grid;
    grid-template-columns: 24px 1fr auto;
    gap: 8px;
    align-items: center;
    font-size: 12px;
  }
  img {
    width: 24px;
    height: 24px;
    object-fit: contain;
    background: #000;
    border-radius: 3px;
  }
</style>
