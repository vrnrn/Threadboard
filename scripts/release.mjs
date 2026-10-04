import { mkdirSync, rmSync, cpSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const name = `threadboard-${version}`, output = join(root, 'release'), stage = join(output, name);
mkdirSync(output, { recursive: true });
rmSync(stage, { recursive: true, force: true }); mkdirSync(stage);
for (const relative of ['.agents/plugins/marketplace.json','plugins/threadboard','README.md','RELEASE_NOTES.md','PRIVACY.md','LICENSE','THIRD_PARTY_NOTICES.md','docs']) {
  mkdirSync(dirname(join(stage, relative)), { recursive: true }); cpSync(join(root, relative), join(stage, relative), { recursive: true });
}
cpSync(join(root, 'scripts/install.mjs'), join(stage, 'install.mjs'));
function files(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);
}
const sums = Object.fromEntries(files(stage).sort().map(path => [path, createHash('sha256').update(readFileSync(join(stage, path))).digest('hex')]));
writeFileSync(join(stage, 'MANIFEST.json'), JSON.stringify({ format: 'threadboard-release', version, files: sums }, null, 2) + '\n');
const zipPath = join(output, `${name}.zip`);
rmSync(zipPath, { force: true });
const zipped = spawnSync('zip', ['-X','-qr',zipPath,name], { cwd: output, encoding: 'utf8' });
if (zipped.status !== 0) throw new Error(zipped.stderr || 'Install the zip utility to package a release.');
const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
writeFileSync(join(output, 'SHA256SUMS'), `${sha}  ${name}.zip\n`);
const verified = spawnSync(process.execPath, [join(stage, 'install.mjs'),'--verify-only'], { encoding: 'utf8' });
if (verified.status !== 0) throw new Error(verified.stderr);
console.log(verified.stdout.trim()); console.log(`Packaged ${name}.zip (${(readFileSync(zipPath).length / 1024).toFixed(1)} KiB), with SHA256SUMS.`);
