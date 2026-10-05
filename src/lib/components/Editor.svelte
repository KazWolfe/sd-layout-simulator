<script lang="ts">
  import { json } from '@codemirror/lang-json';
  import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
  import { Annotation, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
  import { basicSetup } from 'codemirror';
  import { onMount } from 'svelte';
  import type { Diagnostic } from '../layout/types';

  let {
    value,
    diagnostics = [],
    highlight = null,
    onchange,
    oncursor,
    label,
    extensions = [],
  }: {
    value: string;
    diagnostics?: Diagnostic[];
    /** Source range to highlight (the selected layout item). */
    highlight?: { from: number; to: number } | null;
    onchange: (value: string) => void;
    oncursor?: (offset: number) => void;
    /** Accessible name for the editor. */
    label?: string;
    /** Extra CodeMirror extensions (read once, at mount). */
    extensions?: Extension;
  } = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;

  // Marks transactions that sync in an external value change (not user edits).
  const external = Annotation.define<boolean>();

  // Highlight decoration for the selected item's source range.
  const setHighlight = StateEffect.define<{ from: number; to: number } | null>();
  const highlightField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      deco = deco.map(tr.changes);
      for (const e of tr.effects) {
        if (e.is(setHighlight)) {
          deco = e.value && e.value.to <= tr.state.doc.length
            ? Decoration.set([Decoration.mark({ class: 'cm-item-highlight' }).range(e.value.from, e.value.to)])
            : Decoration.none;
        }
      }
      return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  const theme: Extension = EditorView.theme({
    '&': { height: '100%', fontSize: '13px', backgroundColor: 'var(--panel)' },
    '.cm-scroller': { fontFamily: 'var(--mono)' },
    '.cm-gutters': { backgroundColor: 'var(--panel)', border: 'none' },
    '.cm-item-highlight': { backgroundColor: '#6b8cff1f' },
  });

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          json(),
          lintGutter(),
          oneDark,
          theme,
          highlightField,
          ...(label ? [EditorView.contentAttributes.of({ 'aria-label': label })] : []),
          extensions,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              const text = u.state.doc.toString();
              if (text !== value) onchange(text);
            }
            if ((u.selectionSet || u.docChanged) && u.transactions.some((t) => !t.annotation(external) && (t.isUserEvent('select') || t.docChanged))) {
              oncursor?.(u.state.selection.main.head);
            }
          }),
        ],
      }),
    });
    return () => view?.destroy();
  });

  // External value changes (templates, edits from the preview).
  $effect(() => {
    const v = value;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== v) {
      // Replace only the differing middle so the cursor and scroll position survive.
      const max = Math.min(current.length, v.length);
      let start = 0;
      while (start < max && current.charCodeAt(start) === v.charCodeAt(start)) start++;
      let end = 0;
      while (end < max - start && current.charCodeAt(current.length - 1 - end) === v.charCodeAt(v.length - 1 - end)) end++;
      view.dispatch({
        changes: { from: start, to: current.length - end, insert: v.slice(start, v.length - end) },
        annotations: external.of(true),
      });
    }
  });

  $effect(() => {
    const ds: CmDiagnostic[] = diagnostics.map((d) => ({
      from: Math.min(d.from, value.length),
      to: Math.min(d.to, value.length),
      severity: d.severity,
      message: d.message,
    }));
    view?.dispatch(setDiagnostics(view.state, ds));
  });

  $effect(() => {
    view?.dispatch({ effects: setHighlight.of(highlight) });
  });

  /** Moves the cursor to `from` (selecting through `to`) and scrolls it into view. */
  export function reveal(from: number, to = from, focus = false) {
    if (!view) return;
    const len = view.state.doc.length;
    view.dispatch({
      selection: { anchor: Math.min(from, len), head: Math.min(to, len) },
      effects: EditorView.scrollIntoView(Math.min(from, len), { y: 'nearest', yMargin: 48 }),
    });
    if (focus) view.focus();
  }
</script>

<div class="editor" bind:this={host}></div>

<style>
  .editor {
    height: 100%;
    overflow: hidden;
  }
  .editor :global(.cm-editor) {
    height: 100%;
  }
  .editor :global(.cm-editor.cm-focused) {
    outline: none;
  }
</style>
