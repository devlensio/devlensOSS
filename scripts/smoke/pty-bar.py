#!/usr/bin/env python3
"""M8 PTY smoke 2: summarization progress bar with p/r/c on a REAL summarize
(issue 17). Each expect is called exactly once and stored (consumed watermark)."""
import sys, os, re, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ptydrive import Session

fails = []
def check(name, cond, detail=""):
    print(("  PASS  " if cond else "  FAIL  ") + name + ("" if cond else f"  {detail}"))
    if not cond:
        fails.append(name)

ARGV = ["bun", "src/cli/index.ts", "analyze", "/tmp/dlbar", "--summarize", "--force-summarize"]
HOME = "/tmp/dlsum-home"
import os
os.environ["DEVLENS_KEY_DEBUG"] = "1"

s = Session(ARGV, HOME)
check("bar: analysis phase starts", s.expect("Analyzing", 60))
got_hint = s.expect("[p] pause", 150)
check("bar: pause/resume/cancel hint shown", got_hint, s.text()[-300:].replace("\x1b", "ESC"))

terminal = None  # what we observed at the end
if got_hint:
    time.sleep(4)
    s.send("p")
    paused = s.expect("paused", 60)
    check("bar: 'p' pauses the job", paused, s.text()[-300:].replace("\x1b", "ESC"))
    s.pump(2)
    s.send("r")
    resumed = s.expect("resumed", 60)
    check("bar: 'r' resumes the job", resumed, s.text()[-300:].replace("\x1b", "ESC"))
    # cancel ASAP after resume — job must end terminal either way
    s.pump(1)
    s.send("c")
    cancelled = s.expect("cancelled at", 90)
    if cancelled:
        terminal = "cancelled"
        check("bar: 'c' cancels the job", True)
        check("bar: cancelled summary line", True)
    else:
        completed = s.buf.find(b"status\": \"completed\"") >= 0 or s.text().find('"status": "completed"') >= 0
        terminal = "completed" if completed else None
        check("bar: 'c' cancels the job", False,
              "job finished before cancel landed" if completed else s.text()[-400:].replace("\x1b", "ESC"))

rc = s.close(timeout=30)
out = s.text()
if terminal == "cancelled":
    check("bar: cancelled run exits 130", rc == 130, f"rc={rc}")
else:
    check("bar: completed run exits 0 (informational)", rc == 0, f"rc={rc}")

check("bar: no stack trace anywhere", "    at " not in out and "ExitPromptError" not in out)
m = re.search(r"(\d+)/(\d+) \((\d+)%\)", out)
check("bar: progress line carried counts + percent", bool(m), out[-300:].replace("\x1b", "ESC"))
check("bar: bar shows node name context", "Summarizing [" in out)

print()
print(("ALL PTY-BAR CHECKS PASSED" if not fails else f"FAILED: {fails}"))
sys.exit(1 if fails else 0)
