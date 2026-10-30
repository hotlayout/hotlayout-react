# Contributing

## Setup

Node.js 20 or newer.

```sh
npm ci
```

`.npmrc` sets `legacy-peer-deps` and `package-lock.json` pins the toolchain, so `npm ci`
gives every contributor the same tree. After changing a dev dependency, run `npm install` and
commit the updated lock file.

## Build, types, tests

```sh
npm run build      # dist/: ES modules, type declarations, styles.css
npm run typecheck  # the package sources and the README examples
npm test           # vitest in jsdom
```

`npm run build` writes one file per source module. Exactly one of them,
`dist/HotlayoutScreen.js`, starts with `"use client"`; keep it that way, or the
plain functions of the public entry stop being callable from server components.

## README examples

Every TypeScript block in `README.md` is a copy of a `#region` in
`examples/`. Edit the file in `examples/` and copy the region into the README;
`npm run typecheck` compiles the examples against the public entry.

## The contract snapshot

`contract/` holds the JSON artifacts the renderer implements (`screen-schema.json`,
`theme.json`, `data-contract.json`, `icons.json`) and the fixtures the tests
read: sample documents and the case tables shared by every HotLayout renderer.

It is a snapshot. The contract is maintained outside this repository, so do not
edit these files here: a change to the contract arrives as a new snapshot together
with the renderer code that implements it. `npm run icons:sync` regenerates
`src/icon-set.ts` from `contract/icons.json`.

## Pull requests

- Keep `npm run typecheck` and `npm test` green.
- Document and theme values come from the network and are untrusted input.
  Anything that ends up in a `style`, a `src` or a URL goes through
  `src/sanitize.ts`.
- The package has no runtime dependencies besides its `react` / `react-dom`
  peers. Please do not add one without discussing it first.
