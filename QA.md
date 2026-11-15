# Validation record

Validated 2026-11-13 in the supplied macOS workspace.

- `EVSTUDIO_PYTHON=/opt/homebrew/bin/python3 npm test`: passed. Raster operations, suffix count boundaries, native EV/PIX generation, project validation/round trips, PLOT pie/bar/line/grouped/stacked behavior and data validation, TOC holes, ZIP CRC round trips, and corrupt FAT chains.
- Corpus: 268 EV rasters re-encoded and decoded with exact bitmaps and visible pixels; opaque header/trailer bytes retained, including 24 extended slide trailers. Edited pixel variants also round-trip. Python independently decoded all generated files.
- Raw DOS 1.x extraction: six images produce 280 files exactly matching supplied ZIP contents.
- Existing ZIP test suite: stored/deflated/nested input, TOC, malformed data, limits, all six real archives passed (268 graphics).
- Existing 7z test suite: invalid/encrypted/oversized/empty cases and original corpus imports passed. The unchanged offline worker and reader are reused verbatim.
- Local HTTP preview: successful response for index and assets.
- Chrome via native computer UI: layout and pixel rendering inspected; loaded Graphics Library 2 raw IMG and verified 26 named graphics; added its TITLE slide; selected/copied/pasted pixels and undid the placement; reordered slides in Prepare; observed motion playback; downloaded a complete project and independently reopened/validated its four slides and source bytes in the core; created a stacked PLOT in a selected 287×168 region; downloaded the resulting native EV and decoded its 320×200 raster with all four indices; browser print preview produced one correctly titled page; corrected presentation canvas sizing and verified the enlarged stage.

The browser extension host was unavailable, so native Chrome UI was used instead. Automated core tests complement those UI checks. Cross-browser behavior and mobile touch hardware were not exercised. The original DOS application was not run; original palette/object/animation metadata, new-container acceptance, and full native directory metadata remain unverified.

## Multiple-motion update (2026-11-13)

- Added dedicated animation tests for independent positions, speed, start delays, overlapping sources/destinations, deterministic trails across different frame rates, restart, original-raster preservation, all 32 supported motions, project v2 round trips and v1 migration.
- Controller integration tests cover selecting/editing an existing motion without reselecting its region, adding another, independent settings, removal/undo/redo, switching slides, dragging a motion's source region, preview playback and loading an older project through the actual file handler.
- Full existing core and 268-file corpus suites pass.
- HTTP preview serves successfully. Interactive verification of this update was interrupted by repeated native Chrome control timeouts, even after the control session reset. The existing user tab was not deliberately reloaded or replaced; updated controls are covered by controller tests, but the new layout was not visually verified.

## Video export update (2026-11-13)

- Added timeline tests for slide boundaries, palette changes, both motions, delays, fixed versus extended timing, and export limits. Recorder tests cover format negotiation, scaling, progress, final chunks, cancellation, hidden-tab interruption, encoder failures/timeouts, size limits, and stream cleanup.
- Native Microsoft Edge UI: exported the entire four-slide demo as MP4 and the current animation slide as WebM at 960×600. Played both previews and downloaded both files. Selected and updated the red-square motion to leave a trail while the yellow disc moved independently; visually verified the resulting WebM. Verified cancellation restores the controls and offers no partial download.
- FFprobe identified H.264 in the MP4 and VP8 in the WebM, each with one 960×600 video stream and no audio. Both files decoded cleanly with FFmpeg using the source timestamp timebase. The MP4 duration was about 12.50 seconds for a 12.25-second timeline (browser startup overhead); the final WebM packet was at 9.254 seconds for a 9.25-second timeline. Browser WebM output did not include a container duration tag, although playback completed normally.
- Improved frame scheduling after the first MP4 check to avoid skipping requested frame slots; the WebM browser test used the final scheduler. Frame pacing and container metadata remain browser-dependent. Safari, Firefox, and mobile recording were not exercised.
- The existing user's Chrome tab was preserved. Testing used a separate local preview in Edge.

## DOS interface mode (2026-11-14)

- Optional CGA-inspired interface; no changes to raster palettes, project state, persistence or network behavior.
- Keyboard controller tests cover disabled-command skipping, menu arrow navigation, Home/End, focus restoration, Tab dismissal, repeats, modal/text-entry exclusion and modern-mode isolation.
- Local Edge UI verified: entering/leaving DOS mode, F10 menu focus, arrow navigation and executing Erase, disabled Edit commands, F1 help/Escape, F6 Prepare and F7 Create, and F6 remaining inactive in the slide-name field. Desktop layout visually inspected.
- Full core/motion/controller/video/corpus suite passed with EVSTUDIO_PYTHON=/opt/homebrew/bin/python3; 268 graphics and all six disk images retained compatibility. Mobile layout has CSS breakpoints but was not interactively verified.
- No commit or deployment performed.

## Immersive DOS refinement (2026-11-14)

- Replaced the DOS skin's scrolling layout with a viewport-fitted canvas, title/menu/status/function-key bars and transient View windows. Modern layout is retained.
- Edge UI verified the fixed-screen layout, F9 palette window, keyboard close returning focus to the canvas, and Shift+arrow drawing enabling Undo.
- Fullscreen entry was requested by keyboard activation but denied in the automated Edge session. The fallback message appeared and the workspace remained usable. Successful native fullscreen is not claimed verified. Controller tests cover success, rejection, unsupported browsers, fullscreenchange and exit.
- Mouse interaction is disabled in DOS mode, based on the user's conditional request and lack of verified period mouse support. Keyboard-generated activation remains allowed.

## GitHub publication preparation (2026-11-14)

- Prepared a separate source repository from the current Studio working tree. The editor, DOS interface, rendering, and import/export runtime files are byte-identical to that snapshot. The original checkout was preserved.
- `npm test` passed all 12 standalone suites with Node.js 24.14.1, without npm dependencies or historical media. The build includes the offline decoder, MIT license, third-party notices, and both corresponding source archives.
- The HTTP preview passed under `/execuvision-studio/`, including relative application assets, license/source downloads, redirects, HEAD requests, and error responses. All local HTML/Markdown links in the 22-file Pages artifact resolved.
- The optional corpus check passed: 268 graphics, 24 extended trailers, and six DOS disk images yielding 280 files identical to the supplied ZIPs. Python independently verified every emitted raster. Historical files are excluded from the repository and site.
- Source and site ZIPs were decoded again and compared byte-for-byte with their inputs. The source ZIP was extracted into an unrelated temporary directory; its build and all 12 standalone suites passed without the research workspace. A later documentation-only validation-record update does not change that tested runtime or build configuration.
- Git attributes preserve the original vendor bytes, and the staged decoder files match their recorded SHA-256 hashes. Generated output, hosting identity, local media, and user projects are excluded.
- A fresh interactive preview was attempted, but the browser access host was unavailable. The earlier browser checks above remain the visual evidence; no new visual verification is claimed for this packaging pass.
- The GitHub Actions workflow and first-publication instructions are prepared. No remote repository was created, no files were pushed, and no public deployment was performed or verified.

## Illustrated user guide (2026-11-14)

- Added an 11-section guide with modern-interface, fullscreen DOS, and DOS palette screenshots. Capture provenance is recorded in [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md). The screenshots use only the built-in synthetic demo.
- With the user's authorization to use headless Chromium after the standard computer tools were unavailable, captured the published application in Chromium 159.0.8154.6. Verified the real browser Fullscreen API state, the DOS fullscreen class, and the Windowed control before capturing; returning to the modern interface exited fullscreen. No JavaScript page errors occurred.
- Inspected the guide at 1440 px and 390 px widths. Its 11 section anchors, image loading, expandable troubleshooting answers, and body width checks passed. Visually reviewed desktop and mobile captures. The app's Field guide link opened the illustrated guide in a separate tab while retaining the four-slide editor session.
- `npm test` passed all 12 standalone suites. After the final CSS adjustment, rebuilt the site and reran publication checks: all local asset and source links resolve across the 27-file Pages artifact. No drawing, project, codec, or animation behavior changed.

## Readable source and generated distribution (2026-11-14)

- Moved first-party application JavaScript, HTML, and CSS into `src/`, with static files and license/source materials in `public/`. Added readable worker inputs, module notes, a development guide, and pinned formatting tools. `dist/` is now untracked build output; Pages and preview use it directly.
- Prettier's correctness check passed before formatting. Formatting checks and all 13 standalone suites passed afterward, including a new build check for repeatable output, obsolete-file removal, and unchanged source/vendor inputs.
- Headless Chromium comparison against the previously published app produced byte-identical modern and fullscreen DOS screenshots and identical serialized demo projects. Fullscreen entry/exit still worked. A synthetic 7z archive was imported through the actual generated browser worker; its decoded pixels matched the original demo. The illustrated guide opened correctly, and no JavaScript page errors occurred.
- The optional corpus check passed for all 268 graphics, 24 extended trailers, and six DOS disks / 280 files, including independent Python decoding.
- Extracted the source release into a separate temporary directory with no prebuilt `dist/` or research files. `npm ci`, formatting checks, and all 13 standalone suites passed; the build recreated the complete distribution. The archive excludes generated output.

## Source maintainability pass (2026-11-14)

- Expanded application declarations and added braces around conditional/loop bodies. Added JSDoc data shapes and comments explaining undo ownership, coordinate/time units, animation ordering/trails, native record preservation, archive validation, recorder cleanup, and DOS keyboard/fullscreen routing. Added HTML/CSS section notes, editor settings, and maintenance conventions in [the development guide](docs/DEVELOPMENT.md).
- Compared all nine first-party JavaScript files with commit `533d39b` using normalized parser syntax trees. Ignoring comments/locations, declaration splitting, and single-statement control-flow blocks, executable syntax is identical. No application behavior change is intended.
- Formatting checks and all 13 standalone suites passed. Rebuilt after final comment-only refinements and repeated the syntax-equivalence and formatting checks. Vendor bytes and generated-worker provenance remain covered by the existing build/release suites.
- Headless Chromium produced byte-identical modern and actual fullscreen DOS screenshots compared with the published baseline. Serialized demo projects match; fullscreen entry/exit, a synthetic 7z import through the generated worker, and the illustrated-guide link passed without page errors.
- CSS-aware HTML formatting also produced byte-identical guide and license-page screenshots at 1440 px and 390 px widths. Guide anchors, image loading, troubleshooting expansion, and overflow checks passed.

## Period-inspired startup screen (2026-11-14)

- Added new, editable SVG artwork inspired by the supplied graphics-library title card: the four-color palette, stepped EV medallion, oversized V, central rule, and double-framed caption. The artwork identifies Studio as an independent reconstruction and does not bundle the reference image.
- The splash appears while deferred scripts load, then becomes a native modal. Enter/Space/click opens modern mode; D, Tab/Enter, or its button opens DOS mode; Esc opens modern mode. No countdown, persistence, or automatic fullscreen request. Startup keys are captured before editor controllers, including when a Tab cycle temporarily leaves focus on the document body.
- Headless Chromium checks passed at 1600 × 1000, 390 × 844, 844 × 390, and 320 × 568 with no overflow. Desktop, portrait, and landscape captures were visually inspected. Both entry paths and keyboard focus passed; project bytes, dirty state, undo history, tool, and color remained unchanged. Actual fullscreen entry/exit worked after starting in DOS mode. No JavaScript page errors occurred.
- Confirmed visibility with a deferred core script deliberately held pending, promotion to modal after initialization, and direct `file://` startup with local artwork. Updated the usage/development guides and screenshot instructions.
- Formatting and all 13 standalone suites passed. Added an SVG content-type regression check after the preview server initially served the artwork as an undecodable octet stream.
