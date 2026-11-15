# ExecuVision Studio

Create pixel graphics, compose slides, and present them in a browser. Studio is an independent reconstruction inspired by contemporary ExecuVision marketing materials, reviews, and library booklets.

It includes a modern workspace and a keyboard-operated DOS-style interface. Files are processed on your device, with no uploads, account, analytics, or runtime network dependencies.

## Use Studio

[Open the editor](https://unamanic.github.io/execuvision-studio/) · [Read the illustrated user guide](https://unamanic.github.io/execuvision-studio/guide/)

The guide includes screenshots of the modern workspace and fullscreen DOS mode, plus drawing, chart, animation, presentation, and saving instructions. It is also available through **Field guide → Read the illustrated user guide** in the app.

The opening splash screen takes its cues from the original graphics-library title cards. Press **Enter** for the modern editor or **D** for the DOS interface, or click either button.

## Try it locally

Install Node.js 24 or newer, then build and preview the app:

```sh
npm run build
npm run preview
```

Open the printed localhost address. The four-slide demo includes newly created artwork, charts, and two moving objects. After building, you can also open `dist/index.html` or `dist/guide/index.html` directly. Building and running tests need only Node; `npm ci` installs the optional development formatter.

## Features

- Draw on a 320 × 200 canvas with four indexed colors, geometric tools, text, flood fill, and 64 selectable CGA palette combinations.
- Create pie, line, vertical bar, grouped bar, and stacked bar charts with PLOT.
- Select, copy, cut, paste, and compose pictures with background-skipping Pixmix.
- Import native EV/TOC files, ZIPs, supported 7z archives, and 160/320 KiB DOS disk images.
- Name, duplicate, reorder, and present slides, with manual or timed advance.
- Animate up to 32 rectangular regions per slide using straight-line motion, speed, delay, and optional trails.
- Save complete `.evstudio` projects; export EV/PIX rasters, PNGs, media ZIPs, printed handouts, and silent MP4/WebM video where the browser supports recording.
- Switch to DOS mode for keyboard drawing, menus, and transient tool windows.

Save a project to retain palettes, motion, and source metadata. There is no autosave; closing the tab can discard unsaved work. Native EV export does not encode newly created animation in the original DOS format.

See the [usage guide](docs/USAGE.md) for controls, motion editing, video export, and DOS shortcuts.

## What is reconstructed?

To our knowledge, no copies of the original ExecuVision software are publicly available. The original DOS program is not included or emulated. The browser interface, fonts, undo system, project format, and several motion controls are new implementations.

Studio's graphics format is compatible with the available media libraries: raster interoperability has been checked against 268 historical graphics. However, no finished presentations created with the original software are available to us for testing. Original-program acceptance of new files and the palette, object, animation, and complete directory semantics therefore remain unverified.

Historical graphics, disk images, manuals, magazine scans, and user projects are not bundled. Open your own local files through the media importer.

**Help fill the gaps:** If you have the original ExecuVision software or finished slides or presentations, please [open an issue](https://github.com/unamanic/execuvision-studio/issues/new) to contribute them. These materials would help preserve ExecuVision's history and let us test and improve compatibility with complete presentations.

## Development

```sh
npm test             # Builds and runs standalone tests; no historical samples needed
npm run build        # Builds src/ + public/ into a fresh dist/
npm run preview      # Serves dist/ on localhost
npm run package      # Tests and creates verified source/site ZIPs in release/
```

Edit the readable JavaScript, HTML, and CSS in [`src/`](src/). Static files, screenshots, licenses, and decoder source archives live in [`public/`](public/). `npm run build` copies these into `dist/` and generates the offline 7z worker from `src/workers/` and `vendor/7z/`. The build does not minify application code.

`dist/` and `release/` are generated and ignored by Git; never edit them as source. Tests exercise the built application, including the codec, charts, motion, DOS controls, archive import, and publication files. See the [source map and build guide](docs/DEVELOPMENT.md) for where each feature lives.

For consistent formatting:

```sh
npm ci
npm run format
npm run format:check
```

Prettier is pinned as a development dependency. The application has no runtime npm dependencies.

An optional historical corpus check requires Python 3.10+ and locally supplied graphics libraries:

```sh
EVSTUDIO_CORPUS_DIR=/path/to/samples npm run test:corpus
```

Set `EVSTUDIO_PYTHON` if the Python executable is not named `python3`. The optional corpus is never required by GitHub Actions and is not included in release archives.

## GitHub Pages

The included workflow runs tests for pull requests and publishes `dist/` from `main`. Select **GitHub Actions** as the repository's Pages source. See [publication instructions](docs/PUBLISHING.md) for first-time setup and the expected repository/site addresses.

## License and acknowledgments

Original application code and synthetic demo artwork: [MIT License](LICENSE), copyright © 2026 William Witt.

Thanks to Pieter van Mill for [the ExecuVision raster converter](https://github.com/pcmill/vcn-execuvision-slide-format-converter), which corroborated the recovered raster format. Thanks to OpenAI Codex for collaboration on implementation, research, testing, and documentation.

The offline 7z decoder has separate LGPL and unRAR terms. Notices, corresponding source archives, and replacement instructions are included; see [third-party notices](THIRD_PARTY_NOTICES.md) and the [decoder source guide](public/third_party/README.md).
