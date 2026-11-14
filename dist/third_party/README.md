# 7z decoder source and replacement

The unmodified browser decoder is 7z-wasm 1.2.0, based on 7-Zip 24.09. Its original JavaScript and WASM files are in `vendor/7z/` in the source repository, with hashes in `PROVENANCE.json`.

Corresponding sources distributed alongside the site:

- [7z-wasm v1.2.0](sources/7z-wasm-1.2.0.tar.gz), upstream commit `10ae71a413a5589a48d11a75ed61f83d90d256db`, from https://github.com/use-strict/7z-wasm/tree/v1.2.0
- [7-Zip 24.09](sources/7zip-24.09.tar.xz), from https://github.com/ip7z/7zip/releases/tag/24.09

Extract the wrapper source and follow its README and `build` script. It contains the Emscripten patch, Dockerfile, environment files, and compilation commands. The Dockerfile's old 7-zip.org source URL was unavailable during preparation; use the supplied 7-Zip archive, extracted into `/7z-src`, or the official release. The original Dockerfile records the upstream toolchain setup.

To replace the decoder in Studio:

1. Build the original or modified wrapper/WASM using the corresponding sources.
2. Replace `vendor/7z/7zz.umd.js` and `vendor/7z/7zz.wasm` in the source checkout.
3. Update the provenance hashes and attribution to describe your replacement.
4. Run `npm run build`. `tools/build-sevenzip.mjs` embeds the replacement plus `tools/sevenzip-core.js` into `dist/sevenzip-assets.js`; the build copies the site to `site/`.
5. Run `npm test` and distribute the corresponding source and notices for your version.

No application signing key or secret is required. The library's license terms apply to modifications and distribution. The running app uses the bundled decoder and does not fetch it from a CDN.
