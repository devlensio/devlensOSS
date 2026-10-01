"""webUI regression smoke (M8): API contracts the webUI depends on."""
import json, os, signal, subprocess, sys, time, urllib.request, urllib.error

REPO = os.environ.get("DEVLENS_OSS_REPO") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = 4173
BASE = f"http://127.0.0.1:{PORT}"

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

fails, checks = [], 0
def check(name, cond, detail=""):
    global checks
    checks += 1
    if cond:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name}  {detail}")
        fails.append(name)

home = "/tmp/dl-websmoke-home"
os.system(f"rm -rf {home} && mkdir -p {home}")

srv_env = dict(os.environ, HOME=home)
log = open("/tmp/dl-websmoke.log", "w")
srv = subprocess.Popen(["bun", "src/cli/index.ts", "serve", "-p", str(PORT)],
                       cwd=REPO, env=srv_env, stdout=log, stderr=log)

try:
    up = False
    for _ in range(60):
        try:
            st, body = req("GET", "/api/health", timeout=3)
            if st == 200:
                up = True
                break
        except Exception:
            pass
        time.sleep(0.5)
    check("server starts on keyless HOME", up)

    time.sleep(0.5)
    logtxt = open("/tmp/dl-websmoke.log").read()
    check("no 'Ollama' in server startup output", "Ollama" not in logtxt, logtxt[:400])
    check("no 'ollama detected' defaults noise", "not detected" not in logtxt)

    st, body = req("GET", "/api/config")
    cfg = (body or {}).get("data") or {}
    check("GET /api/config 200", st == 200)
    check("config has summarization block", "summarization" in cfg, str(cfg)[:200])
    check("config keeps embedding field (API compat)", "embedding" in cfg, str(list(cfg)))
    check("config has allProviders (multi-provider UI)", "allProviders" in cfg, str(list(cfg)))

    st, body = req("PATCH", "/api/config", {"summarization": {"batchSize": 42}})
    check("PATCH /api/config accepted", st == 200, str(body)[:200])

    st, body = req("GET", "/api/providers")
    names = [p.get("name") for p in ((body or {}).get("data") or [])] if isinstance((body or {}).get("data"), list) else []
    if not names and isinstance(body, list):
        names = [p.get("name") for p in body]
    check("GET /api/providers 200", st == 200, str(body)[:200])
    check("catalog has no ollama", "ollama" not in names, str(names))

    st, body = req("POST", "/api/analyze", {"repoPath": "/tmp/dlrepo2", "skipSummarization": False})
    data = (body or {}).get("data") or {}
    job_id = data.get("jobId")
    check("analyze (summarize requested, keyless) returns 200 + jobId", st == 200 and bool(job_id), str(body)[:300])
    check("auto-skip surfaced via summarizationSkipped", data.get("summarizationSkipped") is True, str(data))

    status = None
    for _ in range(120):
        st, jobs = req("GET", "/api/jobs")
        js = (jobs or {}).get("data") or jobs or []
        job = next((j for j in js if j.get("jobId") == job_id), None)
        if job:
            status = job.get("status")
            if status in ("completed", "failed", "cancelled"):
                break
        time.sleep(0.5)
    check("auto-skipped analyze job completes", status == "completed", f"status={status}")

    st, body = req("POST", "/api/analyze", {"repoPath": "/tmp/dlrepo2", "skipSummarization": True})
    check("analyze skipSummarization:true 200", st == 200 and (body or {}).get("data", {}).get("jobId"), str(body)[:200])

    try:
        r = urllib.request.Request(BASE + f"/api/job/{job_id}/stream")
        with urllib.request.urlopen(r, timeout=10) as resp:
            chunk = resp.read(4096).decode(errors="replace")
        check("SSE stream replays analysis events", "analysis_started" in chunk or "event:" in chunk, chunk[:200])
    except Exception as e:
        check("SSE stream reachable", False, str(e))

    st, jobs = req("GET", "/api/jobs")
    js = (jobs or {}).get("data") or jobs or []
    job = next((j for j in js if j.get("jobId") == job_id), None)
    graph_id = (job or {}).get("graphId")
    st2, meta = req("GET", f"/api/graph/{graph_id}/commits")
    m = (meta or {}).get("data") or meta or {}
    commits = m.get("commits") or []
    if commits and isinstance(commits[0], dict):
        commit = commits[0].get("commitHash") or commits[0].get("hash")
    else:
        commit = commits[0] if commits else None
    st3, body3 = req("POST", f"/api/graph/{graph_id}/{commit}/summarize", {})
    err = json.dumps(body3)
    check("summarize endpoint rejects keyless cleanly (500 + message)",
          st3 == 500 and "apiKey" in err and "    at " not in err, f"st={st3} {err[:300]}")

    st, _ = req("POST", f"/api/job/{job_id}/pause")
    check("POST /api/job/:id/pause reachable (200/4xx as designed)", st in (200, 400, 404, 409, 500), f"st={st}")
    st, _ = req("POST", f"/api/job/{job_id}/cancel")
    check("POST /api/job/:id/cancel reachable (200/4xx as designed)", st in (200, 400, 404, 409, 500), f"st={st}")

finally:
    srv.send_signal(signal.SIGINT)
    try:
        srv.wait(timeout=10)
    except Exception:
        srv.kill()

print(f"\n{checks - len(fails)}/{checks} passed" + (f" — FAILED: {fails}" if fails else ""))
sys.exit(1 if fails else 0)
