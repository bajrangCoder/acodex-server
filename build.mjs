import * as esbuild from 'esbuild'

let res = await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  minify: true,
  outfile: 'dist/index.js',
  format: 'esm',
  logLevel: 'info',
  color: true,
  loader: {
    '.ts': 'ts',
    '.js': 'js',
    '.node': 'binary',
  },
})