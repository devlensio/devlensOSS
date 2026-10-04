# DevLens MCP Server

The MCP server exposes the DevLens code graph to AI agents. It is bundled inside `@devlensio/cli`, so there is nothing separate to install: `devlens mcp` runs it over stdio and `devlens mcp http -p 7000` runs it over HTTP.

**The full reference lives in [`docs/mcp-reference.md`](../../docs/mcp-reference.md).** That page holds the complete 5-tool catalog with argument schemas, the plain-text packet format, provenance and freshness, the search index internals, worked examples, and contributor notes on architecture and on adding a tool.

The surface in one paragraph: `resolve_context` is the front door and answers most questions in a single call — a task-shaped plain-text packet with ranked nodes, meanings, call flow, involved files, and an id map, across seven intents, with no `graphId` needed (the repo is resolved from the working folder). Behind it: `find_symbols` (cheap BM25F lookup), `get_node` (one node's summaries, callers, callees, optional source), `impact` (change blast radius, or commit-range diff), and `repo` (list / analyze / freshness / health).

For install and setup steps, see the [root README](../../README.md#use-it-with-your-ai-agent-mcp).
