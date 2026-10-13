/**
 * Package build: ES modules (one file per source module), type declarations
 * and the stylesheet as a file.
 *
 * Why not a single file. Next.js (App Router) renders on the server in a graph
 * of server components, where `useState` and `createContext` do not exist. A
 * module that needs them must start with the `"use client"` directive. With a
 * single bundle the directive would cover everything, including
 * `checkDocumentVersion` and `loadDocument`, and server code cannot call a
 * function imported from a client module (it becomes a reference). So exactly
 * one file carries the directive, `HotlayoutScreen.js`: everything it imports
 * joins the client graph behind it, and the rest of the public entry stays
 * plain functions.
 *
 * Vite in library mode, because it is already a dependency of the repository.
 * `react` and `react/jsx-runtime` stay external: they are peer dependencies,
 * and a second React instance in the host app breaks hooks.
 *
 * Run: `npm run react:build` from the repository root (or `npm run build` here).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { build } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))

/** The only module that carries `"use client"`: the server/client graph boundary. */
const CLIENT_BOUNDARY = /[\\/]src[\\/]HotlayoutScreen\.tsx$/
const dist = join(here, 'dist')

rmSync(dist, { recursive: true, force: true })

/*
 * The build must not depend on the environment it was started from. Under
 * `NODE_ENV=test` or `development` the JSX transform picks
 * `react/jsx-dev-runtime`: debug calls would ship, and that module, not being
 * marked external, would be bundled together with a copy of React
 * (`dist/node_modules/react`), i.e. a second React in the host app. So the mode
 * is explicit, and everything from `react` and `react-dom` is external rather
 * than a list of three specifiers.
 */
process.env.NODE_ENV = 'production'

await build({
  root: here,
  mode: 'production',
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: dist,
    emptyOutDir: false,
    target: 'es2022',
    // Minified: source comments are not needed in the output, and the sourcemap restores the original code.
    minify: true,
    sourcemap: true,
    lib: { entry: join(here, 'src/index.ts'), formats: ['es'] },
    rollupOptions: {
      external: [/^react(?:-dom)?(?:\/|$)/],
      output: {
        preserveModules: true,
        preserveModulesRoot: join(here, 'src'),
        entryFileNames: '[name].js',
        banner: (chunk) => (CLIENT_BOUNDARY.test(chunk.facadeModuleId ?? '') ? '"use client";' : ''),
      },
    },
  },
  esbuild: { jsx: 'automatic' },
})

// Type declarations come from the same TypeScript that checks the code.
const require = createRequire(import.meta.url)
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', join(here, 'tsconfig.build.json')], { stdio: 'inherit' })

/*
 * Relative imports in declarations carry an extension. Sources are written for
 * `moduleResolution: bundler` (`from './theme'`) and `tsc` copies that into the
 * `.d.ts` as is. A consumer on `node16` / `nodenext` cannot resolve such a path:
 * the package types silently become `any` and the import fails with TS7016.
 * The rewrite walks every sub-directory of `dist` (`render/`, `screen/`).
 */
const declarationFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return declarationFiles(path)
    return entry.name.endsWith('.d.ts') ? [path] : []
  })
for (const file of declarationFiles(dist)) {
  const text = readFileSync(file, 'utf8')
  const fixed = text.replace(/(from\s+|import\(\s*)(['"])(\.\.?\/[^'"]+?)(?<!\.js)\2/g, '$1$2$3.js$2')
  if (fixed !== text) writeFileSync(file, fixed, 'utf8')
}

// The stylesheet as a file, for hosts whose CSP forbids an inline `<style>`.
// The text is read from the BUILT module, so the file and what the component
// injects are the same. `styles.js` rather than the entry: the entry pulls in React.
const { HOTLAYOUT_CSS } = await import(pathToFileURL(join(dist, 'styles.js')).href)
mkdirSync(dist, { recursive: true })
writeFileSync(join(dist, 'styles.css'), `${HOTLAYOUT_CSS}\n`, 'utf8')

console.log('✓ @hotlayout/react built into dist')
