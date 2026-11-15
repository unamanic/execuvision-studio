const assert = require('node:assert/strict'),
  path = require('node:path'),
  { spawn } = require('node:child_process');
(async () => {
  const child = spawn(process.execPath, [path.join(__dirname, '../tools/preview.mjs')], {
    env: { ...process.env, PORT: '0', BASE_PATH: '/execuvision-studio/' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const url = await new Promise((resolve, reject) => {
      let text = '';
      const timeout = setTimeout(() => reject(Error('Preview startup timed out')), 10000);
      child.stdout.on('data', (chunk) => {
        text += chunk;
        const match = text.match(/Preview: (http:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(Error('Preview exited ' + code));
      });
    });
    for (const name of [
      '',
      'app.js',
      'dos-mode.js',
      'style.css',
      'licenses.html',
      'LICENSE',
      'third_party/sources/7z-wasm-1.2.0.tar.gz',
    ]) {
      const r = await fetch(url + name);
      assert.equal(r.status, 200, name);
      assert.ok((await r.arrayBuffer()).byteLength > 0);
    }
    const head = await fetch(url + 'app.js', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.ok(Number(head.headers.get('content-length')) > 0);
    // SVG must be served as an image; browsers cannot decode octet-stream SVGs.
    const splash = await fetch(url + 'splash.svg');
    assert.equal(splash.status, 200);
    assert.equal(splash.headers.get('content-type'), 'image/svg+xml');
    assert.match(await splash.text(), /<svg\b/);
    assert.equal((await fetch(url + 'missing')).status, 404);
    assert.equal((await fetch(url, { method: 'POST' })).status, 405);
    assert.equal((await fetch(url + '%')).status, 400);
    assert.equal((await fetch(url + '..%2Fpackage.json')).status, 403);
    const redirect = await fetch(new URL('/', url), { redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), '/execuvision-studio/');
    console.log(
      'Pages preview checks passed: project subpath, assets, decoder source download, HEAD, redirects and error responses.',
    );
  } finally {
    child.kill('SIGTERM');
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
