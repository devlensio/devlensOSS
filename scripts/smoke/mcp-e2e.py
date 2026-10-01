#!/usr/bin/env python3
"""MCP surface smoke: real JSON-RPC over stdio against `devlens mcp stdio`.

Handshake → tools/list → real tool calls (repo listing, symbol query, repo
overview, context packet) against a fixture graph in an isolated HOME.
Exit 0 = all checks passed."""
import json, os, subprocess, sys, time

REPO = os.environ.get("DEVLENS_OSS_REPO") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HOME = os.environ.get("DEVLENS_MCP_HOME", "/tmp/dlsum-home")  # needs a graph for /tmp/dlbar

fails = []
def check(name, cond, detail=""):
    print(("  PASS  " if cond else "  FAIL  ") + name + ("" if cond else f"  {detail}"))
    if not cond:
        fails.append(name)

proc = subprocess.Popen(
    ["bun", "src/cli/index.ts", "mcp", "stdio"],
    cwd=REPO,
    env={**os.environ, "HOME": HOME},
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    text=True, bufsize=1,
)
pending = {}

def send(obj):
    proc.stdin.write(json.dumps(obj) + "\n")
    proc.stdin.flush()

def recv(msg_id, timeout=45):
    end = time.time() + timeout
    while time.time() < end:
        line = proc.stdout.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        if msg.get("id") == msg_id:
            return msg
    return None

try:
    send({"jsonrpc": "2.0", "id": 1, "method": "initialize",
          "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                     "clientInfo": {"name": "mcp-smoke", "version": "0"}}})
    init = recv(1)
    check("initialize handshake", init is not None and "result" in init,
          str(init)[:300])
    if init:
        check("server identifies as devlens",
              init.get("result", {}).get("serverInfo", {}).get("name") == "devlens",
              str(init.get("result", {}).get("serverInfo")))
    send({"jsonrpc": "2.0", "method": "notifications/initialized"})

    send({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
    tools = recv(2)
    names = [t["name"] for t in tools.get("result", {}).get("tools", [])] if tools else []
    check("tools/list returns the core surface", len(names) >= 6, str(names)[:300])
    for expected in ("list_analyzed_repos", "find_symbols", "resolve_context", "get_repo_overview"):
        check(f"tool present: {expected}", expected in names, ",".join(names[:10]))

    send({"jsonrpc": "2.0", "id": 3, "method": "tools/call",
          "params": {"name": "list_analyzed_repos", "arguments": {}}})
    r3 = recv(3)
    text3 = json.dumps(r3)[:2000] if r3 else ""
    check("list_analyzed_repos returns fixture graph", "dlbar" in text3, text3[:300])
    graph_id = None
    if r3:
        try:
            payload = json.loads(r3["result"]["content"][0]["text"])
            if isinstance(payload, list):
                items = payload
            else:
                data = payload.get("data") or payload
                items = data if isinstance(data, list) else data.get("repos") or data.get("graphs") or []
            if items:
                graph_id = items[0].get("graphId") or items[0].get("graph_id")
        except Exception:
            import re
            m = re.search(r'"graphId"\s*:\s*"([0-9a-f]+)"', text3)
            graph_id = m.group(1) if m else None
    check("graphId discovered from listing", bool(graph_id), text3[:300])

    if graph_id:
        send({"jsonrpc": "2.0", "id": 4, "method": "tools/call",
              "params": {"name": "find_symbols", "arguments": {"graphId": graph_id, "query": "createUser", "limit": 5}}})
        r4 = recv(4)
        t4 = json.dumps(r4) if r4 else ""
        check("find_symbols finds createUser", "createUser" in t4, t4[:400])
        check("find_symbols returns file refs", "index.ts" in t4 or "src/" in t4, t4[:400])

        send({"jsonrpc": "2.0", "id": 5, "method": "tools/call",
              "params": {"name": "get_repo_overview", "arguments": {"graphId": graph_id}}})
        r5 = recv(5)
        t5 = json.dumps(r5) if r5 else ""
        check("get_repo_overview returns fingerprint", r5 and '"result"' in t5 and "error" not in json.dumps(r5).lower()[:120], t5[:400])

        send({"jsonrpc": "2.0", "id": 6, "method": "tools/call",
              "params": {"name": "resolve_context", "arguments": {"graphId": graph_id, "query": "user creation flow"}}})
        r6 = recv(6)
        t6 = json.dumps(r6) if r6 else ""
        check("resolve_context returns a packet", r6 and "result" in r6, t6[:400])
finally:
    try:
        proc.stdin.close()
    except Exception:
        pass
    try:
        proc.wait(timeout=10)
    except Exception:
        proc.kill()

err = proc.stderr.read() if proc.stderr else ""
if err.strip():
    print("  (server stderr, informational):")
    for line in err.strip().splitlines()[:6]:
        print("    " + line)

print()
print(("ALL MCP CHECKS PASSED" if not fails else f"FAILED: {fails}"))
sys.exit(1 if fails else 0)
