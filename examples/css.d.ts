/*
 * What a real application gets from its bundler (`vite/client`, Next types): a stylesheet import is
 * a side effect with no values. Without this declaration TypeScript 6 rejects `import '….css'`
 * (TS2882), both in the example and in an application without a bundler.
 */
declare module '*.css'
