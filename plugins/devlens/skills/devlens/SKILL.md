---
name: devlens
description: DEPRECATED as a procedural skill. DevLens now works directly through its MCP tools, which describe themselves. Install the DevLens MCP and call its tools without this skill. Kept only as a pointer so old installs do not break.
---

# DevLens skill is deprecated

This skill used to carry 12 command recipes and a tool whitelist. That whole layer is
gone in MCP v2:

- The whitelist silently blocked every new tool the server added. It no longer exists.
- The routing policy ("DevLens decides where and what, file tools make the edit") now
  lives in the MCP server's INSTRUCTIONS, versioned with the code.
- The freshness guard is automatic: every MCP response carries provenance and staleness
  flags, so no recipe step is needed.
- The command recipes (explain, impact, find, changes, security-analysis, ...) are
  replaced by the MCP tools themselves: resolve_context, blast_radius, find_symbols,
  get_node_details, get_node_code, get_neighbors.

If you are reading this, install or update the DevLens MCP and delete this skill
directory. No skill file is required to use DevLens.
