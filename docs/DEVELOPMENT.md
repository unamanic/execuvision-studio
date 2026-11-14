# Source and build guide

Edit `src/`, then run `npm run build`. The complete standalone application is generated in `dist/`. The built JavaScript, HTML, and CSS remain readable; the large embedded decoder bundle is generated only in the output directory.

## Where to make changes

| Source | Responsibility |
| --- | --- |
| [`src/index.html`](../src/index.html) | Editor controls, dialogs, canvas, and script loading order. |
| [`src/style.css`](../src/style.css) | Modern interface layout and appearance. |
| [`src/app.js`](../src/app.js) | Shared project state, undo, drawing controls, library import, slide ordering, motion editing, and presentation UI. |
| [`src/core.js`](../src/core.js) | Pure raster operations, text and charts, EV/PIX writing, disk extraction, motion rendering, project serialization, and synthetic demo. |
| [`src/dos-mode.js`](../src/dos-mode.js) and [`src/dos-mode.css`](../src/dos-mode.css) | DOS menus, keyboard navigation, transient windows, and fullscreen layout. Uses the same editor state and controls as modern mode. |
| [`src/video.js`](../src/video.js) | Video timeline, browser recording, progress, cancellation, and cleanup. |
| [`src/execuvision.js`](../src/execuvision.js) | Native raster decoding, TOC interpretation, CGA palettes, and RGBA conversion. |
| [`src/zip-reader.js`](../src/zip-reader.js) | ZIP parsing, decompression, CRC checks, and extraction bounds. |
| [`src/sevenzip-reader.js`](../src/sevenzip-reader.js) | UI-thread bridge to a disposable offline decoder worker. |
| [`src/workers/`](../src/workers/) | Readable 7z extraction adapter and worker message handler. |
| [`src/guide/`](../src/guide/) and [`src/licenses.html`](../src/licenses.html) | Illustrated user guide and license page. |
| [`public/`](../public/) | Files copied unchanged: guide screenshots, notices, reconstruction notes, and corresponding third-party source archives. |
| [`vendor/7z/`](../vendor/7z/) | Unmodified upstream JavaScript/WASM decoder and provenance hashes. |
| [`tools/`](../tools/) and [`tests/`](../tests/) | Build, preview, release packaging, and validation. |

The app uses classic browser scripts with explicit globals, loaded in dependency order by `index.html`. Core modules also expose CommonJS exports for Node tests. There is no framework, transpiler, or runtime package installation. `app.js` coordinates UI state; reusable drawing and serialization behavior belongs in `core.js`.

## Local workflow

Use Node.js 24 or newer:

```sh
npm run build
npm run preview
```

Preview serves `dist/` on the printed localhost URL. Rebuild after editing source; the preview server serves the latest built files and does not watch or rebuild automatically. For the GitHub Pages project path:

```sh
BASE_PATH=/execuvision-studio/ npm run preview
```

You can also open `dist/index.html` directly after building. Opening `src/index.html` is not a complete app: it does not contain the generated decoder. Treat `dist/` as disposable output; each build replaces it entirely.

## What the build does

[`tools/build.mjs`](../tools/build.mjs) uses only Node's standard library:

1. Removes the previous `dist/` so obsolete assets cannot survive a rebuild.
2. Copies `public/` and the browser-facing files in `src/` into `dist/`, preserving their relative paths.
3. Copies the root MIT `LICENSE` into the distribution.
4. Assembles the 7z worker from the original vendor JavaScript/WASM plus the readable files in `src/workers/`. The WASM is embedded in the generated `dist/sevenzip-assets.js` so the decoder works offline and from a local HTML file.
5. Adds `.nojekyll` for static hosting.

The build never modifies `src/`, `public/`, or `vendor/`. Worker inputs are assembled, not copied as separate public scripts. The source and generated output are separate: Git tracks `src/`, `public/`, and vendor inputs; `dist/` and `release/` are ignored. GitHub Pages uploads `dist/` directly, with no intermediate `site/` directory.

## Formatting and tests

Prettier is pinned in `package-lock.json` as a development-only tool:

```sh
npm ci
npm run format
npm run format:check
npm test
```

Formatting covers first-party JavaScript, HTML, CSS, tests, build tools, and workflow configuration. It excludes original vendor bytes, public source archives, screenshots, and generated output. The formatting check also runs in GitHub Actions. HTML uses CSS-aware whitespace formatting, preserving inline text boundaries. `.editorconfig` supplies matching indentation and line endings for editors.

Keep one variable declaration per statement in application code and use braces for conditionals and loops, including single-line bodies. Separate functions with blank lines. Prefer comments that explain units, ownership, ordering, or an algorithm's constraints over comments that repeat the next statement. `core.js` defines the shared raster, region, palette, motion, and slide data shapes in JSDoc. Public operations document mutation and copy behavior where it matters.

## Maintaining behavior

- **Editing and undo:** `app.js` owns the slide list and current selection. Call `checkpoint()` before modifying a slide, then obtain `current()` again: checkpointing detaches the current slide from the saved history. One pointer gesture gets one checkpoint. `copySlide()` copies mutable pixels, palettes, and motions; original native source bytes remain shared and immutable.
- **Temporary state:** selections, pending placements, drag previews, keyboard cursors, menus, and the media library are separate from saved presentation data. Canvas decorations must never be written into the saved raster. The Run view has its own slide index.
- **Geometry and time:** pixels are row-major indices in `0..3`, not RGB values. Rectangles use pixel counts for width/height and top-left coordinates. CSS scaling does not change the 320 × 200 slide grid. Motion delays and animation clocks use milliseconds; the UI and video duration controls expose seconds. Keep conversions at those boundaries.
- **Animation:** capture all motion regions before removing any source pixels. Composite motions in list order. Trail coverage depends on traversed pixel positions, not the number of frames rendered; seeking backward resets the cached trail layers.
- **Imports:** accumulate an import in memory and publish its accepted library together. The generation token prevents cancelled or superseded requests from publishing stale results. Keep limits across the entire nested import as well as within each archive reader. Scope TOC names to their containing directory/archive.
- **Native files:** `execuvision.js` decodes the first raster; `core.js` writes it. Unknown native records are preserved when possible, not interpreted as verified palette or motion metadata. Consult [reconstruction notes](../public/RECONSTRUCTION.md) before changing offsets or claiming compatibility. Project JSON is the complete editable web save.
- **Both interfaces:** DOS commands forward to existing controls and handlers. Preserve dialog/text-input precedence before shortcuts. `body.dataset.dosPanel` changes transient layout, not presentation data. Fullscreen ownership tracks whether DOS mode should exit browser fullscreen when returning to modern mode.
- **Resource cleanup:** archive workers, Blob URLs, recorder tracks, event listeners, and timers have explicit owners. New cancellation or error paths must release the same resources as successful completion. Recording receives a detached slide snapshot.

When tracing a feature, start with its control ID in `index.html`, find its handler in `app.js`, then follow reusable operations into `core.js`. For import/export issues, follow the relevant codec or archive reader. CSS section comments identify layouts and later overrides; retain cascade order unless intentionally changing appearance.

## Validation

`npm test` rebuilds first, then runs the standalone suites against `dist/`, so the tests exercise what is deployed. It does not require Prettier or historical media. The optional corpus check also builds first and needs locally supplied research samples plus Python:

```sh
EVSTUDIO_CORPUS_DIR=/path/to/samples npm run test:corpus
```

Set `EVSTUDIO_PYTHON` when a different Python executable is needed. Never add those sample graphics or disk images to this repository.

## Packaging and deployment

Stage new source files before running `npm run package`; source archives use Git's tracked-file list. The command builds, tests, and creates a source ZIP, a standalone site ZIP from `dist/`, and SHA-256 checksums under `release/`. A source ZIP contains everything needed to rebuild but excludes `dist/` itself.

Push reviewed source changes to `main` to run formatting, build, tests, and Pages deployment. See [publishing instructions](PUBLISHING.md). For decoder changes, also follow the [source and replacement guide](../public/third_party/README.md) and retain its original notices and corresponding sources.
