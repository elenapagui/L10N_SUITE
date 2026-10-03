/**
 * Compila el motor en modo web (`npm run build` y `npm start` de la raíz): dist/index.js.
 * Las dependencias se cargan de node_modules; solo se empaqueta el código propio y @l10n/shared
 * (que se publica como TypeScript).
 */
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const serverDir = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(serverDir, 'package.json'), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => d !== '@l10n/shared');

fs.rmSync(path.join(serverDir, 'dist'), { recursive: true, force: true });
await build({
  entryPoints: [path.join(serverDir, 'src', 'index.ts')],
  outfile: path.join(serverDir, 'dist', 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: 'linked',
  logLevel: 'warning',
  // Algunas dependencias son CommonJS: require() dentro del módulo ESM.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  external: [...external, ...external.map((d) => `${d}/*`)],
});
console.log(
  `✔ Motor compilado en ${path.relative(process.cwd(), path.join(serverDir, 'dist', 'index.js'))}`,
);
