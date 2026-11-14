# ExecuVision Studio

Create pixel graphics, compose slides, and present them in a browser. Studio is an independent reconstruction of the workflow described in contemporary ExecuVision reviews and library booklets.

It includes a modern workspace and a keyboard-operated DOS-style interface. Files are processed on your device, with no uploads, account, analytics, or runtime network dependencies.

## Try it locally

Open `dist/index.html` in a current desktop browser. The four-slide demonstration uses newly created artwork and includes charts and two independent moving objects.

For an HTTP preview, install Node.js 24 or newer, then run:

```sh
npm run build
npm run preview
```

Open the printed localhost address. There are no npm dependencies to install. The prepared GitHub Pages address is `https://unamanic.github.io/execuvision-studio/`; it becomes available after publication.

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

The original DOS program is not included or emulated. The browser interface, fonts, undo system, project format, and several motion controls are new implementations. Raster interoperability has been checked against 268 historical graphics, but original-program acceptance of new files and the palette, object, animation, and complete directory semantics remain unverified.

The recent slide-trailer palette hypothesis has not been adopted as an automatic color decoder. Choose palettes in Studio explicitly. See [reconstruction notes](dist/RECONSTRUCTION.md) for sources and limits.

Historical graphics, disk images, manuals, magazine scans, and user projects are not bundled. Open your own local files through the media importer.

## Development

```sh
npm test             # Builds and runs standalone tests; no historical samples needed
npm run build        # Rebuilds the offline decoder and writes the Pages artifact to site/
npm run preview      # Serves site/ on localhost
npm run package      # Tests and creates verified source/site ZIPs in release/
```

`dist/` contains the editable application source. `vendor/7z/` and `tools/sevenzip-core.js` supply the offline decoder build inputs. `site/` and `release/` are generated and ignored by Git. Tests cover the codec, editing, charts, motion, video, presentation controls, DOS keyboard interactions, archive import, and publication files.

An optional historical corpus check requires Python 3.10+ and locally supplied graphics libraries:

```sh
EVSTUDIO_CORPUS_DIR=/path/to/samples npm run test:corpus
```

Set `EVSTUDIO_PYTHON` if the Python executable is not named `python3`. The optional corpus is never required by GitHub Actions and is not included in release archives.

## GitHub Pages

The included workflow runs tests for pull requests and publishes `site/` from `main`. Select **GitHub Actions** as the repository's Pages source. See [publication instructions](docs/PUBLISHING.md) for first-time setup and the expected repository/site addresses.

## License and acknowledgments

Original application code and synthetic demo artwork: [MIT License](LICENSE), copyright © 2026 William Witt.

Thanks to Pieter van Mill for [the ExecuVision raster converter](https://github.com/pcmill/vcn-execuvision-slide-format-converter), which corroborated the recovered raster format. Thanks to OpenAI Codex for collaboration on implementation, research, testing, and documentation.

The offline 7z decoder has separate LGPL and unRAR terms. Notices, corresponding source archives, and replacement instructions are included; see [third-party notices](THIRD_PARTY_NOTICES.md) and the [decoder source guide](dist/third_party/README.md).
