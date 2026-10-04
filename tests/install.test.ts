import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('an installer error before activation removes its staging directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'threadboard-install-failure-'));
  try {
    const source = join(root, 'package');
    mkdirSync(join(source, 'plugins/threadboard'), { recursive: true });
    copyFileSync(new URL('../scripts/install.mjs', import.meta.url), join(source, 'install.mjs'));
    // A verified but malformed config fails after staging and before activation.
    const config = '{}';
    writeFileSync(join(source, 'plugins/threadboard/.mcp.json'), config);
    writeFileSync(join(source, 'MANIFEST.json'), JSON.stringify({
      format: 'threadboard-release', version: 'test',
      files: { 'plugins/threadboard/.mcp.json': createHash('sha256').update(config).digest('hex') },
    }));
    const result = spawnSync(process.execPath, [join(source, 'install.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, THREADBOARD_INSTALL_DIR: join(root, 'installed'), THREADBOARD_CODEX_COMMAND: process.execPath },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Installation did not complete/);
    assert.deepEqual(readdirSync(root), ['package']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
