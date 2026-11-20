// TypeScript 5.9 rejects side-effect imports of files that have no declaration
// ("Cannot find module or type declarations for side-effect import"), which is
// what `import "@xyflow/react/dist/style.css"` hits. CSS is handled by the
// bundler, so the module just needs to exist for the type checker.

declare module "*.css";
declare module "*.scss";
declare module "*.sass";
declare module "*.less";