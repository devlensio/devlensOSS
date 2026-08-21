// Bundled go extractor binary for darwin-amd64 (embedded as a bunfs asset).
//
// The DIRECT static `import` below makes `bun build --compile` embed this
// file's bytes into the compiled CLI as a virtual /$bunfs/root/<…> asset; the
// imported binding becomes that virtual path at runtime, and
// fs.readFileSync(src) reads the bytes straight out of the compiled binary.
//
// A wrapper that merely `export default "<path>"` (a plain string) does NOT
// embed — it ships the literal path, which only works on THIS machine (the
// previous false positive). Importing the binary FILE directly is what
// actually bundles it.
//
// The relative path below is a BUILD-TIME reference only: it must exist when
// `bun build` runs, but is never read at runtime in a compiled binary, so the
// binary stays self-contained on machines where that path does not exist.
import bin from "../../../../node_modules/devlensio/extractors/go/bin/darwin-amd64/devlens_go_extractor";
export default bin;
