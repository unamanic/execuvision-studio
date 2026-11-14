# Third-party notices

Original ExecuVision Studio code and synthetic demo artwork are covered by the [MIT License](LICENSE), copyright © 2026 William Witt. Historical ExecuVision artwork, application disks, manuals, and screenshots are not included and are not licensed by this repository.

## ExecuVision raster-format reference

Pieter van Mill's [vcn-execuvision-slide-format-converter](https://github.com/pcmill/vcn-execuvision-slide-format-converter), reviewed at commit `f423ed4a812463e79f3ae464895969159b8d4b84`, corroborated the raster layout independently inferred in this project. Its indexed-PNG approach also informed earlier research tooling. The full [MIT notice](public/pcmill-MIT.txt), copyright © 2026 Pieter van Mill, is retained.

## Offline 7z decoder

The browser worker embeds unmodified `7zz.umd.js` and `7zz.wasm` from **7z-wasm 1.2.0**, based on **7-Zip 24.09**. Copyright Igor Pavlov and wrapper author Alexandru Ciuca. The original files and provenance hashes are in `vendor/7z/`.

License notices distributed with the site:

- [7-Zip license](public/7z-License.txt)
- [LGPL 2.1](public/LGPL-2.1.txt)
- [unRAR restriction](public/unRarLicense.txt)

Corresponding wrapper and 7-Zip source archives are included in `public/third_party/sources/`. See the [source and replacement guide](public/third_party/README.md). `npm run build` regenerates the worker from the replaceable vendor files; no signing key, hosted service, or remote download is needed.
