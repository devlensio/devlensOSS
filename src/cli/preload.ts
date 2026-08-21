// DevLens CLI — extractor preload.
//
// MUST be imported FIRST in src/cli/index.ts, BEFORE any module that imports
// `devlensio`. The devlensio engine resolves its subprocess-extractor paths
// (python venv, java jar, go/rust binaries) at MODULE-LOAD time, not lazily.
// So we must materialise the embedded extractors and set DEVLENS_EXTRACTORS_DIR
// before devlensio is ever evaluated. This module does exactly that, as a
// synchronous import side-effect.
import { ensureExtractorsReady } from "./extractors.js";

ensureExtractorsReady();
