import concurrently from 'concurrently';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const simulator = join(root, 'simulator');
const { loadEnv } = createRequire(new URL('../apps/web/package.json', import.meta.url))('vite');
const env = loadEnv('development', root, ['VITE_SIMULATOR_URL', 'AQUAGRID_API']);
const externalMap = env.VITE_SIMULATOR_URL?.trim();
const externalApi = env.AQUAGRID_API?.trim();

const services = [
  {
    name: 'web',
    command: 'pnpm --filter web dev',
    env: { VITE_SIMULATOR_URL: externalMap || 'http://127.0.0.1:5174/' },
  },
  { name: 'api', command: 'pnpm dev:api' },
];
if (!externalMap) {
  services.push({
    name: 'flood-map',
    cwd: join(simulator, 'frontend'),
    command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
    env: { AQUAGRID_API: externalApi || 'http://127.0.0.1:8001' },
  });
}
if (!externalMap && !externalApi) {
  const python = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
  if (!existsSync(join(simulator, python))) {
    console.error('Set up the flood simulator environment first. See simulator/README.md.');
    process.exit(1);
  }
  services.push({
    name: 'flood-api',
    cwd: simulator,
    command: `"${python}" -m uvicorn aquagrid.api:app --app-dir backend --host 127.0.0.1 --port 8001`,
  });
}

const { result } = concurrently(services, { cwd: root, killOthersOn: ['failure', 'success'] });
try {
  await result;
} catch {
  process.exitCode = 1;
}
