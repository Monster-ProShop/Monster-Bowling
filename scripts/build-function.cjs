const esbuild = require('esbuild');
esbuild.build({
  entryPoints: ['functions/portal.js'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  outfile: 'dist/index.mjs'
}).catch(error => { console.error(error); process.exitCode = 1; });
