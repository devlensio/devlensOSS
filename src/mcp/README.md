# DevLens MCP Server

The MCP server exposes the DevLens code graph to AI agents. It is bundled inside `@devlensio/cli`, so there is nothing separate to install: `devlens mcp` runs it over stdio and `devlens mcp http -p 7000` runs it over HTTP.

**The full reference lives in [`docs/mcp-reference.md`](../../docs/mcp-reference.md).** That page holds the complete 24 tool catalog with argument schemas, the packet format, provenance and freshness, the search index internals, worked examples, the provisional retirement list, and the contributor notes on architecture and on adding a tool.

The surface in one paragraph: `resolve_context` is the front door and answers most questions in a single call across seven intents. Behind it sit BM25F symbol lookup (`find_symbols`), node reading (`get_node`, `get_node_code`, `get_summaries`, `get_repo_overview`, `find_nodes`), graph traversal and impact (`blast_radius`, `get_blast_radius`, `get_khop`, `get_subgraph`, `get_nodes_in_path`, `list_cycles`), security (`get_security_issues`, `security_brief`), and workflow checks (`check_freshness`, `get_coverage`, `analyze`, `analyze_changes`, `review_pr`, `architecture_brief`, `onboarding_tour`, `get_context`, `list_analyzed_repos`).

For install and setup steps, see the [root README](../../README.md#use-it-with-your-ai-agent-mcp).
