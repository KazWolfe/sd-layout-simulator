# Stream Deck Layout Simulator

A browser-based inspector for [Stream Deck custom layouts](https://docs.elgato.com/streamdeck/sdk/references/layouts):
edit layout JSON on the left, see it rendered on a Stream Deck + (200×100) or Neo infobar (232×50) on the right,
and simulate `setFeedback` calls against it. Everything runs in the browser; no backend is required.

**Try it: https://kazwolfe.github.io/sd-layout-simulator/**

## Features

- **Live preview** of `text`, `pixmap`, `bar`, and `gbar` items, including zOrder, opacity, `enabled`,
  backgrounds and gradients, text alignment and overflow (`clip` / `ellipsis` / `fade`), and all five bar subtypes.
- **Validation** against the layout schema: unknown properties, bad enums and colors, duplicate or invalid keys,
  and the two conditions that make Stream Deck refuse to render a layout: **items out of bounds** and
  **items overlapping on the same zOrder**. These show as errors with a banner, and the preview still renders best-effort.
- **Type hints** in both editors: context-aware autocompletion (properties for the item's `type`, allowed values,
  named colors, snippets for `rect`/`range`/`font`; item keys and runtime-settable properties in the payload) and
  hover docs on property names.
- **Editor ↔ preview sync**: click an item to jump to it in the JSON; move the cursor in the JSON to select it in the preview.
- **Live feedback**: a `setFeedback` payload editor below the layout JSON, applied as you type. Problems (unknown keys,
  immutable or mistyped properties) are underlined in place. **Copy code** gives you the `ev.action.setFeedback(...)`
  call. Toggle the preview between the layout as defined and with feedback applied.
- **Item inspector**: effective property values, marked as coming from the layout, from feedback, or from documented defaults.
- Built-in Stream Deck + layouts (`$X1`, `$A0`, `$A1`, `$B1`, `$B2`, `$C1`) plus the docs demos for Stream Deck + and Neo; open/download/copy JSON.

## Development

```sh
npm install
npm run dev      # dev server
npm test         # unit tests (validator, feedback, parser, edits)
npm run check    # svelte-check / TypeScript
npm run build    # static build in dist/
```

The build uses relative asset paths (`base: './'`), so `dist/` can be served from any path.
`.github/workflows/deploy.yml` publishes to GitHub Pages on push to `main`. To turn it on, go to
**Settings → Pages → Source: GitHub Actions**.

## Layout schema

Validation, editor hints, the Item panel, renderer defaults, and the device canvas sizes are all derived from
[Elgato's layout schema](https://schemas.elgato.com/streamdeck/plugins/layout.json) (`src/lib/layout/schema.ts`).
A copy is bundled in `src/lib/layout/schema/layout.schema.json`. Refresh it with:

```sh
npm run schema:update
```

At startup the app also tries to fetch the live schema and uses it if that succeeds. Today
`schemas.elgato.com` doesn't send CORS headers, so from a browser this fails (you'll see a CORS error in the
console) and the bundled copy is used; the Problems tab shows which one is active.

Only rules the schema can't express are written in code: canvas bounds (x + width, y + height), overlaps on
the same zOrder, duplicate keys, color syntax, and range ordering. Layouts should declare
`"$schema": "https://schemas.elgato.com/streamdeck/plugins/layout.json"`; anything else is a warning.

## Layout

```
src/lib/layout/     framework-free core: types, parser (with source offsets), validator,
                    setFeedback model, color/gradient parsing, text-preserving JSON edits
src/lib/render/     item renderers (Text, Pixmap, Bar/GBar)
src/lib/components/ editor, device canvas + inspection overlay, side panels
src/lib/state.svelte.ts  app state (Svelte 5 runes), persisted to localStorage
```

The JSON text is the single source of truth. Edits that originate in the UI, such as quick controls writing into the payload, go
through `layout/edit.ts`, which applies minimal text edits with `jsonc-parser` so formatting is preserved.
WYSIWYG editing (drag or resize in the preview, property editing in the Item panel) will use the same path.

## Fidelity notes

Rendering approximates the Stream Deck app; it is not pixel-identical. In particular:

- Bar subtype shapes and the gbar indicator are drawn to match their descriptions, not traced from the device.
- Text uses the system UI font.
- Gradients run left to right.
- 8-digit hex colors are read as Qt-style `#AARRGGBB`.
- Pixmaps are scaled to fit their rect while keeping their aspect ratio.
- **Pixel-perfect** mode rasterizes the screen at native resolution on a canvas and upscales it without smoothing.
  Antialiasing is still the browser's, not Qt's.
