// esbuild has no automatic conversion of `import.meta.url` when bundling to
// the "cjs" format (https://github.com/evanw/esbuild/issues/1921) — it just
// becomes `{}`, so any dependency using it (eg. the `open` package) crashes
// with "The 'path' argument must be of type string or an instance of URL.
// Received undefined" the moment it's require()'d, even if never called.
// Injected + defined in dev.ts/publish.ts so every `import.meta.url` in the
// bundle resolves to the bundled output file's own path instead.
export const import_meta_url = require('url').pathToFileURL(__filename).href;
