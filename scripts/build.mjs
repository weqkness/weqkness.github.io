import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
const indexFile = new URL('index.html', root);
const sourceIndexFile = new URL('index.source.html', root);

function run(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: rootPath,
      shell: true,
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

const originalIndex = await readFile(indexFile, 'utf8');

try {
  await copyFile(sourceIndexFile, indexFile);
  await run('tsc -b');
  await run('vite build');
} finally {
  await writeFile(indexFile, originalIndex);
}
