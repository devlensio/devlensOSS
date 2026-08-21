// Ambient type declarations for statically-imported extractor binaries.
//
// The wrapper modules under `src/cli/embedded/**` do:
//
//   import bin from "/abs/path/to/<devlens_*_extractor | devlens_java_extractor.jar>";
//   export default bin;
//
// Those imports resolve to real binary/JAR *files* (non-JS, no extension or
// `.exe`/`.jar`). TypeScript would otherwise error with TS2307 ("Cannot find
// module … or its corresponding type declarations"). These wildcard ambient
// module declarations give the imports a `string` type so `tsc` is happy.
//
// At build time `bun build --compile` embeds the referenced file's bytes as a
// virtual `/$bunfs/root/<…>` asset and rewrites the imported binding to that
// virtual path; at runtime `fs.readFileSync(src)` reads the embedded bytes
// straight out of the compiled binary (no filesystem file required). The
// imported value is always a `string` (an on-disk path in source/dev runs, a
// `/$bunfs/...` virtual path in a compiled binary), which is what these
// declarations assert.

declare module "*devlens_go_extractor" {
  const path: string;
  export default path;
}
declare module "*devlens_go_extractor.exe" {
  const path: string;
  export default path;
}
declare module "*devlens_rust_extractor" {
  const path: string;
  export default path;
}
declare module "*devlens_rust_extractor.exe" {
  const path: string;
  export default path;
}
declare module "*devlens_java_extractor.jar" {
  const path: string;
  export default path;
}
declare module "*devlens_python.zip" {
  const path: string;
  export default path;
}
