/**
 * Prepara build/app: la app de escritorio lista para ejecutarse con Electron o empaquetarse.
 *   build/app/dist        main.cjs, preload.cjs, engine.cjs (esbuild)
 *   build/app/web         interfaz compilada
 *   build/app/migrations  migraciones de la base de datos
 *   build/app/node_modules  solo better-sqlite3: trae binarios N-API precompilados para Windows,
 *                           macOS y Linux que funcionan igual en Node y en Electron (no hay que compilar).
 *
 * Opciones: --skip-web (no recompila la interfaz).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const args = new Set(process.argv.slice(2));
const desktopDir = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const out = path.join(desktopDir, 'build', 'app');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const rootPkg = readJson(path.join(repoRoot, 'package.json'));
const serverPkg = readJson(path.join(repoRoot, 'apps', 'server', 'package.json'));
const electronVersion = readJson(
  path.join(repoRoot, 'node_modules', 'electron', 'package.json'),
).version;
const sqliteVersion = serverPkg.dependencies['better-sqlite3'];

function step(msg) {
  console.log(`\n▶ ${msg}`);
}

if (!args.has('--skip-web')) {
  step('Compilando la interfaz');
  execSync('npm run build -w @l10n/web', { cwd: repoRoot, stdio: 'inherit' });
}
const webDist = path.join(repoRoot, 'apps', 'web', 'dist');
if (!fs.existsSync(path.join(webDist, 'index.html'))) {
  throw new Error('No existe apps/web/dist. Ejecuta antes «npm run build -w @l10n/web».');
}

step('Limpiando build/app');
fs.mkdirSync(out, { recursive: true });
for (const dir of ['dist', 'web', 'migrations'])
  fs.rmSync(path.join(out, dir), { recursive: true, force: true });

step('Empaquetando el proceso principal, el preload y el motor (esbuild)');
const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: 'linked',
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
};
await build({
  ...common,
  entryPoints: [path.join(desktopDir, 'src', 'main.ts')],
  outfile: path.join(out, 'dist', 'main.cjs'),
  external: ['electron'],
});
await build({
  ...common,
  entryPoints: [path.join(desktopDir, 'src', 'preload.ts')],
  outfile: path.join(out, 'dist', 'preload.cjs'),
  external: ['electron'],
  sourcemap: false,
});
await build({
  ...common,
  entryPoints: [path.join(desktopDir, 'src', 'engine.ts')],
  outfile: path.join(out, 'dist', 'engine.cjs'),
  external: ['electron', 'better-sqlite3'],
  // Kiwi (análisis morfológico) es un módulo ESM que usa import.meta.url: en CJS se calcula.
  banner: { js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
  define: { ...common.define, 'import.meta.url': '__importMetaUrl' },
});
// Módulo WebAssembly del analizador morfológico del coreano (Kiwi), junto al motor.
fs.copyFileSync(
  path.join(repoRoot, 'node_modules', 'kiwi-nlp', 'dist', 'kiwi-wasm.wasm'),
  path.join(out, 'dist', 'kiwi-wasm.wasm'),
);

step('Copiando la interfaz y las migraciones');
fs.cpSync(webDist, path.join(out, 'web'), {
  recursive: true,
  filter: (src) => !src.endsWith('.map'),
});
fs.cpSync(path.join(repoRoot, 'apps', 'server', 'drizzle'), path.join(out, 'migrations'), {
  recursive: true,
});

step('Escribiendo package.json de la app');
const appPkg = {
  name: 'l10n-suite',
  productName: 'L10N Suite',
  version: rootPkg.version,
  description: rootPkg.description,
  author: 'L10N Suite',
  license: 'UNLICENSED',
  private: true,
  main: 'dist/main.cjs',
  dependencies: { 'better-sqlite3': sqliteVersion },
};
fs.writeFileSync(path.join(out, 'package.json'), `${JSON.stringify(appPkg, null, 2)}\n`);

const installed = path.join(out, 'node_modules', 'better-sqlite3', 'package.json');
if (!fs.existsSync(installed) || readJson(installed).version !== sqliteVersion) {
  step(`Instalando better-sqlite3 ${sqliteVersion}`);
  execSync('npm install --omit=dev --no-audit --no-fund --no-package-lock --ignore-scripts', {
    cwd: out,
    stdio: 'inherit',
  });
}

// Restos de compilaciones locales: no se usan (se cargan los binarios de prebuilds/).
fs.rmSync(path.join(out, 'node_modules', 'better-sqlite3', 'build'), {
  recursive: true,
  force: true,
});

console.log(
  `\n✔ App preparada en ${path.relative(repoRoot, out)} (versión ${rootPkg.version}, Electron ${electronVersion})`,
);
