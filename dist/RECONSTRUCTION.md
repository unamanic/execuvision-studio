# Reconstruction notes

ExecuVision Studio is an independent work-alike built from public product descriptions, reviews, the user-supplied graphics library booklets, and the previously recovered EV raster format. No original executable or original application source was examined or run during this implementation. The existing raster decoder's format conclusions were previously corroborated with Pieter van Mill's MIT-licensed converter; that reference is credited in the license notices. This is a documentation-led reconstruction, not a claim of a formally separated legal clean room.

## Behavioral sources

- [Vincent Puglia, “Pretty Pixels,” PC Magazine, March 6, 1984, pp. 143–146](https://books.google.com/books?id=ZhoP0KRkQe4C&pg=PA143): Create/Prepare/Print/Run tasks, sketch and geometric objects, text, charts, cuts, palettes, and presentation controls.
- [“Cadillac of Presentation Graphics,” PC Magazine, June 11, 1985, pp. 160–161](https://books.google.com/books?id=ZFw924nLBSoC&pg=PA160): text treatments, palette changes, straight-line motion, trails, and slide ordering/playback.
- [Ken Freeze, InfoWorld, October 29, 1984, pp. 62–63 and 66](https://books.google.com/books?id=nS4EAAAAMBAJ&pg=PA63): chart composition and library-image workflows.
- [Jack Bishop, Computers & Electronics, August 1984, pp. 74 and 82](https://www.worldradiohistory.com/Archive-Poptronics/80s/1984/CE-1984-08.pdf): chart shapes/data, cut-and-paste graphics, palette choice and presentation motion.
- Supplied VCN Graphics Library 1, 2 and 6 booklets: Slide and Pix/Pixmix loading, selection and saved fragments, lettering and map composition. The historical artwork is not bundled with this app.

The history video containing an ExecuVision chapter was excluded from behavioral and UI evidence because it intercuts unrelated movie footage. No Computer Chronicles demonstration was verified.

## Implemented behavior and interpretation

PLOT explicitly generates pie, bar, and line graphs from entered numeric data. Multi-column bars may be grouped or stacked, as illustrated by the user-supplied contemporary price-components example. A selected region bounds the generated graph, following the described object-first plotting workflow.

The app implements the review-supported drawing/composition/presentation loop, using a 320×200 four-index bitmap and the 64 conventional CGA palette combinations. Ten geometric text treatments are newly drawn, not copies of the historical fonts. Library alphabet sheets can be cut into fragments. Pointer controls, undo, JSON saving and the visual interface are modern additions. Pixmix skips color index 0; the detailed historical mixing truth table has not been established. Up to 32 rectangular regions per slide can move independently in straight lines at nine speeds, optionally leaving trails. Named motion lists, direct editing and start delays are web additions; the original animation count and native representation have not been verified. Later list entries draw above earlier ones. Source regions are cut from the raster for playback, so vacated pixels reveal the background index rather than an inferred hidden layer. Legacy numeric speed timing is unknown, so this app uses durations from ten seconds to two seconds. Browser printing and PNG replace hardware-specific printer drivers. Local MP4/WebM video recording is a modern addition, using the same raster motion renderer, slide palettes, optional motion-completion timing, and integer scaling. Browser encoders determine available formats; there is no original-format video or audio export being emulated. There is no VisiPlot, DIF, Lotus or dBase data-file parser, plotter driver or original object-editing engine.

## Native formats

EV files are little-endian. Kind at byte 0 is 1 (SLIDE) or 2 (PIX); the outer size is at byte 2. Bytes 4–49 are opaque. Byte 50 contains a word N, byte 52 the height, and compressed raster bytes span [54,51+N). The footer contains width in bits and expanded-byte-count+3. Pixel indices occupy two bits, most significant first, with ceil(width/4) bytes per row.

The writer uses one literal packet and an additive suffix count. This is larger than legacy run compression but decodes exactly. For same-kind/same-dimension imported files, it retains the 54-byte prefix and complete opaque trailer, updates raster fields, and adjusts the outer size by the compressed-size delta. It preserves unused row-padding bits. This works for both observed slide trailer lengths, 519 and 521 bytes. Changed rasters may no longer agree with retained legacy object records. New files use a minimal inferred container with zeroed unknown fields and a DOS EOF marker; original-program acceptance is not verified. Imported pictures and smaller slides are padded to the editor's 320×200 canvas and receive a new slide container when exported; they cannot retain mismatched native metadata.

Palette interpretation is deliberately separate: no guessed palette word is written. Web palettes and motion live in version 2 `.evstudio` projects; version 1 single-motion projects migrate on opening. Native exports do not encode new original-format animation, objects, fonts or palette records.

TOC names use CRLF records after the header; the first 100 slots correspond to SLIDE001 through SLIDE100, or PIX001 through PIX100. Blank and all-9 slots retain their positions. Names are 28 padded characters with a trailing `9`. Input tables are scoped to their archive/directory and duplicate tables disable name matching. Exported TOCs contain a minimal header and name slots. Later native numeric directory metadata is unresolved and is not fabricated. TOC export is useful for this app and has not been validated in DOS ExecuVision.

Raw IMG support validates identical FAT copies and complete, non-crosslinked FAT12 chains for exact 160/320 KiB DOS 1.x layouts. It reads root-directory files only; it does not process SCP, flux, KryoFlux, TeleDisk or IMD data. Limits: 500 input files, 64 MiB input batch, 128 MiB cumulative expansion, 500 decoded graphics, 100 slides, 1 MiB per EV/TOC. Existing ZIP/7z readers impose their additional bounds. 7z uses a disposable worker with a 45-second limit and cancellation.

## Reproducibility

The automated tests compare all 268 supplied graphic bitmaps before and after native encoding, preserve headers/trailers including the 24 extended trailers, and check edited pixel output. An independent Python implementation decodes every generated EV raster. Six disk images yield 280 files matching their ZIP exports exactly. Corpus files are used locally in tests and are not distributed with the Site.

These checks establish raster and extraction compatibility within the supplied corpus; they do not establish original-program compatibility for newly created containers, palettes, animation, or TOC numeric records.


### August 1984 presentation controls, verified against printed page 82

The Computers & Electronics review describes a separate slide-order menu,
manual arrow-key stepping, entering how many slides to skip, and either preset
display timing or manual triggering. The number is a relative skip count, not an
absolute slide destination. Studio already provides Prepare ordering and manual
or timed Run modes. It now adds a labeled relative-forward skip control.

The review does not establish the original numeric-entry syntax, skip direction,
exact timing units/range or whether “skip N” counted intervening versus advanced
positions. Studio explicitly defines its reconstruction as advancing N positions:
from slide 1, entering 2 displays slide 3. Input plus Advance (or Enter in that input),
validation messages and forward-only numeric skipping are modern UI decisions;
Previous/Left Arrow provides backward stepping. The 4-second to 4-minute range is supported by the March 1984 PC Magazine
review (p. 146), which reports seven intervals. Intermediate preset values remain
reconstructed; the August review does not specify timing units or range.

Printed page 74 describes chart-shape selection from a bottom-screen menu, but
supplies no screenshot of that menu. Studio retains its accessible PLOT controls;
no exact menu geometry or historical key protocol is inferred from that sentence.


### Five DOS tasks and the bottom task menu

The 1984 West Coast Computer Faire report (PDF page 39, printed page 19,
[CHM scan](https://archive.computerhistory.org/resources/access/text/2022/06/102725948-05-01-acc.pdf))
names Create, Prepare, Print, Run and Quit. InfoWorld's October 1984 review,
printed page 63, places the task menu at the bottom of the screen and explicitly
exempts Quit from the selections that lead to further menus. DOS mode now gives
those five tasks first-class bottom-menu positions; Quit directly returns to
modern Studio, preserving the document, unsaved changes and undo history. It
leaves fullscreen entered by DOS mode, but never closes the browser or discards
work. This safe browser transition is a modern adaptation, not original DOS exit
emulation.

The sources do not enumerate every submenu label or command assignment. The
current grouping, keyboard shortcuts, scrolling popups, exact geometry and
Studio extras menu are new implementation decisions. Studio extras distinguishes
web project files, undo/redo, browser fullscreen and exports from documented task
names. Native-format exports remain experimental. Original media imports and
all existing drawing/composition/presentation controls remain available.

The Faire report describes the then-current MS-DOS 1.1/128K product and a
forthcoming XT/DOS 2.0 version. Those system requirements are version-specific,
not universal requirements for every ExecuVision release.
