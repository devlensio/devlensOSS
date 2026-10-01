"""webUI surface, phase B — keyful HOME: real summarize over the API.

Verifies what the JobsPanel actually consumes: SSE events DURING a running
summarize, jobs-panel counters (summarizationTotal/Completed), graph
endpoint serving, and the config GET shape with a configured provider.
Companion to websmoke.py (phase A = keyless out-of-box behavior)."""
import json, os, signal, subprocess, sys, time, urllib.request, urllib.error

REPO = os.environ.get("DEVLENS_OSS_REPO") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = 4175
BASE = f"http://127.0.0.1:{PORT}"
HOME = os.environ.get("DEVLENS_UI_HOME", "/tmp/dlsum-home")
REPO_PATH = "/tmp/dlbar"

fails, checks = [], 0
def check(name, cond, detail=""):
    global checks
    checks += 1
    print(("  PASS  " if cond else "  FAIL  ") + name + ("" if cond else f"  {detail}"))
    if not cond:
        fails.append(name)

def req(method, path, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw) if raw.strip() else None
        except Exception:
            return e.code, {"raw": raw}

log = open("/tmp/dl-websmoke-keyful.log", "w")
srv = subprocess.Popen(["bun", "src/cli/index.ts", "serve", "-p", str(PORT)],
                       cwd=REPO, env={**os.environ, "HOME": HOME}, stdout=log, stderr=log)

def read_sse(seconds, needle_events):
    """Read the SSE stream for N seconds; return which needle events appeared."""
    seen = set()
    try:
        r = urllib.request.Request(BASE + f"/api/job/{job_id}/stream")
        with urllib.request.urlopen(r, timeout=seconds + 10) as resp:
            end = time.time() + seconds
            buf = b""
            while time.time() < end:
                chunk = resp.read(512)
                if not chunk:
                    break
                buf += chunk
                text = buf.decode("utf-8", errors="replace")
                for ev in needle_events:
                    if f"event: {ev}" in text or f'"event":"{ev}"' in text or f'"event": "{ev}"' in text:
                        seen.add(ev)
                if all(e in seen for e in needle_events):
                    break
    except Exception as e:
        return seen, str(e)
    return seen, None

try:
    up = False
    for _ in range(60):
        try:
            if req("GET", "/api/health", timeout=3)[0] == 200:
                up = True
                break
        except Exception:
            pass
        time.sleep(0.5)
    check("server up (keyful HOME)", up)

    st, body = req("GET", "/api/config")
    cfg = (body or {}).get("data") or {}
    check("config GET shape (summarization + embedding + allProviders)",
          st == 200 and "summarization" in cfg and "embedding" in cfg and "allProviders" in cfg,
          str(list(cfg)))
    check("config GET has the configured key", bool(cfg.get("summarization", {}).get("apiKey")), str(cfg.get("summarization"))[:120])
    check("config GET providerName", cfg.get("summarization", {}).get("providerName") == "commandcode",
          str(cfg.get("summarization", {}).get("providerName")))

    st, body = req("POST", "/api/analyze", {"repoPath": REPO_PATH, "skipSummarization": False, "forceSummarize": True})
    data = (body or {}).get("data") or {}
    job_id = data.get("jobId")
    check("analyze(summarize:true, keyful) accepted", st == 200 and bool(job_id), str(body)[:300])
    check("no auto-skip when key present", not data.get("summarizationSkipped"), str(data))

    seen, err = read_sse(90, ["analysis_started", "summarization_started", "summarization_progress"])
    check("SSE: analysis_started", "analysis_started" in seen, f"{seen} err={err}")
    check("SSE: summarization_started", "summarization_started" in seen, f"{seen} err={err}")
    check("SSE: summarization_progress", "summarization_progress" in seen, f"{seen} err={err}")

    status, counters = None, None
    for _ in range(240):
        st, jobs = req("GET", "/api/jobs")
        js = (jobs or {}).get("data") or jobs or []
        job = next((j for j in js if j.get("jobId") == job_id), None)
        if job:
            status = job.get("status")
            counters = (job.get("summarizationTotal"), job.get("summarizationCompleted"))
            if status in ("completed", "failed", "cancelled"):
                break
        time.sleep(0.5)
    check("summarize job completes via API", status == "completed", f"status={status}")
    total, completed = counters or (0, 0)
    check("jobs panel counters populated (total>0, completed>0)",
          (total or 0) > 0 and (completed or 0) > 0, f"total={total} completed={completed}")
    check("counters consistent (completed <= total)", (completed or 0) <= (total or 0), f"{completed}/{total}")

    graph_id = (job or {}).get("graphId")
    st, meta = req("GET", f"/api/graph/{graph_id}/commits")
    m = (meta or {}).get("data") or meta or {}
    commits = m.get("commits") or []
    check("GET /api/graph/:id/commits serves commit list", st == 200 and len(commits) > 0, str(m)[:200])
    commit = commits[0].get("commitHash") if isinstance(commits[0], dict) else commits[0]

    st, graph = req("GET", f"/api/graph/{graph_id}?commitHash={commit}", timeout=60)
    g = (graph or {}).get("data") or graph or {}
    nodes = g.get("nodes") or g.get("allNodes") or []
    check("GET /api/graph/:id?commitHash serves the graph", st == 200 and len(nodes) > 0,
          f"st={st} nodes={len(nodes) if isinstance(nodes, list) else nodes}")

    st, body = req("POST", f"/api/graph/{graph_id}/{commit}/summarize", {})
    check("re-summarize of an already-summarized commit → clean 409", st == 409, f"st={st} {str(body)[:200]}")

finally:
    srv.send_signal(signal.SIGINT)
    try:
        srv.wait(timeout=10)
    except Exception:
        srv.kill()

print(f"\n{checks - len(fails)}/{checks} passed" + (f" — FAILED: {fails}" if fails else ""))
sys.exit(1 if fails else 0)
