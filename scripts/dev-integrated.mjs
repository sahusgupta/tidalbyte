import concurrently from 'concurrently';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const simulator = fileURLToPath(new URL('../simulator/', import.meta.url));
const python = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
if (!existsSync(`${simulator}/${python}`)) {
  console.error('Set up the flood simulator environment first. See simulator/README.md.');
  process.exit(1);
}

const { result } = concurrently([
  {
    name: 'atlas',
    command: 'pnpm --filter web dev',
    env: { VITE_SIMULATOR_URL: 'http://127.0.0.1:5174/' },
  },
  { name: 'api', command: 'pnpm dev:api' },
  {
    name: 'flood-map',
    cwd: `${simulator}/frontend`,
    command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
    env: { AQUAGRID_API: 'http://127.0.0.1:8001' },
  },
  {
    name: 'flood-api',
    cwd: simulator,
    command: `"${python}" -m uvicorn aquagrid.api:app --app-dir backend --host 127.0.0.1 --port 8001`,
  },
], { killOthersOn: ['failure', 'success'] });

try {
  await result;
} catch {
  process.exitCode = 1;
}
