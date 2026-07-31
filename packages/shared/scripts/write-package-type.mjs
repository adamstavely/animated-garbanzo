/**
 * Stamps a `package.json` beside a build output so Node resolves the folder with
 * the right module system. Without it, the CommonJS build would be interpreted
 * as ESM (the root package has no "type" field, but tooling is happier explicit).
 *
 * Usage: node scripts/write-package-type.mjs <dist-subdir> <module|commonjs>
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [subdir, type] = process.argv.slice(2);

if (!subdir || !['module', 'commonjs'].includes(type ?? '')) {
  console.error('Usage: write-package-type.mjs <dist-subdir> <module|commonjs>');
  process.exit(1);
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(packageRoot, 'dist', subdir);

await mkdir(target, { recursive: true });
await writeFile(join(target, 'package.json'), `${JSON.stringify({ type }, null, 2)}\n`, 'utf8');
