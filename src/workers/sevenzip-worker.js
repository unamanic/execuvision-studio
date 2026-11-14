/*
 * Worker entry point for offline 7z extraction.
 * The build prepends the vendor decoder, extractSevenZip, and EVSevenZipWasm.
 * The embedded WASM and generated worker string belong in dist/, not here.
 */
self.onmessage = async (event) => {
  try {
    const wasmBinary = Uint8Array.from(atob(EVSevenZipWasm), (character) =>
      character.charCodeAt(0),
    );
    const entries = await extractSevenZip(event.data, SevenZip, wasmBinary);
    postMessage(
      { entries },
      entries.map((entry) => entry.bytes.buffer),
    );
  } catch (error) {
    postMessage({ error: error.message || '7z extraction failed' });
  }
};
