# Screenshot record

Captured November 14, 2026 from the published [ExecuVision Studio](https://unamanic.github.io/execuvision-studio/), application commit `135342540a598af54727789af85d0225525a9ea3`.

The images are actual application captures made with headless Chromium 159.0.8154.6 through Playwright. They contain the built-in synthetic demo artwork, with no imported historical media or user project. No UI elements, colors, or artwork were composited or changed for the screenshots.

| Image | Capture |
| --- | --- |
| [Modern interface](../dist/guide/images/modern-interface.png) | Complete scrollable Create workspace, 1600 × 1428 pixels. |
| [Fullscreen DOS mode](../dist/guide/images/dos-fullscreen.png) | 1600 × 1000 viewport after activating the real Enter full screen control with Enter. |
| [DOS palette](../dist/guide/images/dos-palette.png) | 360 × 324 element capture of the palette window opened with F9 while in fullscreen DOS mode. |

Before the DOS captures, browser checks confirmed `document.fullscreenElement === document.documentElement`, the `dos-fullscreen` body class, and the visible **Windowed** control. The application reported “Full screen.” Returning to Modern interface cleared fullscreen and retained the four demo slides. There were no JavaScript page errors during capture.

The fullscreen screenshot verifies the browser Fullscreen API in headless Chromium. It does not imply every desktop browser or embedded frame will allow fullscreen. The modern image is a full-page capture; the DOS image is a fullscreen viewport capture. Images are saved directly as PNGs and can be opened at their original resolution from the guide.

To refresh them, use the same built-in title slide in a fresh browser context, capture the modern page, enter DOS mode, activate Enter full screen with the keyboard, verify fullscreen state, and capture the viewport. Press F9 for the palette detail. Keep screenshot tooling outside the app's runtime dependencies.
