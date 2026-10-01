"""M8 PTY smoke 1: init stage flow — issues 8, 9, 10, 11, 12."""
import sys, os, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ptydrive import Session

HOME = "/tmp/dlinit-home"
import os, json as _json
os.makedirs(f"{HOME}/.devlens", exist_ok=True)
_json.dump({
    "summarization": {
        "active": "openai:commandcode",
        "providers": {
            "openai:commandcode": {
                "provider": "openai",
                "providerName": "commandcode",
                "model": "stealth/space-bunny-alpha",
                "apiKey": "cc-secret-key-123",
                "baseUrl": "https://api.commandcode.ai/provider/v1",
                "batchSize": 25
            }
        }
    }
}, open(f"{HOME}/.devlens/config.json", "w"), indent=2)
fails = []
def check(name, cond, detail=""):
    print(("  PASS  " if cond else "  FAIL  ") + name + ("" if cond else f"  {detail}"))
    if not cond:
        fails.append(name)

s = Session(["bun", "src/cli/index.ts", "init"], HOME)
check("A: stage0 renders provider list", s.expect("Choose a summarization provider", 30))
check("A: saved commandcode shows in list (issue 12)",
      s.expect("commandcode \u2014 OpenAI-compatible API", 10))
check("A: no ollama in list (issue 13)", b"ollama" not in s.buf.lower())
selected_ds = False
for _ in range(14):
    s.send("\x1b[A")
    if s.expect("\u276f DeepSeek \u2014 OpenAI-compatible API", 2.5):
        selected_ds = True
        break
check("A: DeepSeek selectable with API-type wording (issue 10)", selected_ds,
      s.text()[-300:].replace("\x1b", "ESC"))
s.pump(0.3)
s.send("\r")
check("A: stage1 API type + proper wording (issue 10)",
      s.expect("API type for DeepSeek", 15) and s.expect("Chat Completions API", 5)
      and s.expect("Messages API", 5) and s.expect("← Back", 5))
s.send("\r")
check("A: key prompt names SELECTED provider, no 'keep' from another (issue 8)",
      s.expect("API key for deepseek", 15))
seg = s.text()
keyline = next((l for l in seg.splitlines() if "API key for deepseek" in l), "")
check("A: key prompt has no foreign keep-key text", "keep the saved key" not in keyline, keyline[:120])
s.send("sk-new-123\r")
check("A: URL default is the SELECTED provider's endpoint (issue 9)",
      s.expect("Base URL for DeepSeek (Enter to use https://api.deepseek.com)", 15))
check("A: URL default is NOT the active provider's endpoint", "commandcode" not in s.text().split("Base URL")[-1])
s.send("\r")
check("A: model stage reached", s.expect("Model name", 20), s.text()[-300:].replace("\x1b", "ESC"))
s.send("deepseek-chat\r")
check("A: batch stage reached", s.expect("Batch size", 15))
s.send("\r")
check("A: saved confirmation", s.expect("Config saved", 15))
rc = s.close()
check("A: exit 0", rc == 0, f"rc={rc}")

cfg = json.load(open(f"{HOME}/.devlens/config.json"))
sm = cfg["summarization"]
e = sm["providers"].get("openai:deepseek", {})
check("A: active switched to openai:deepseek", sm["active"] == "openai:deepseek", sm["active"])
check("A: saved baseUrl = deepseek endpoint (issue 9 regression)",
      e.get("baseUrl") == "https://api.deepseek.com", str(e.get("baseUrl")))
check("A: saved apiKey/model correct", e.get("apiKey") == "sk-new-123" and e.get("model") == "deepseek-chat", str(e))
cc = sm["providers"].get("openai:commandcode", {})
check("A: commandcode entry untouched", cc.get("apiKey") == "cc-secret-key-123" and
      cc.get("baseUrl") == "https://api.commandcode.ai/provider/v1", str(cc))

s = Session(["bun", "src/cli/index.ts", "init"], HOME)
check("B: stage0", s.expect("Choose a summarization provider", 30))
s.send("\r")
check("B: stage1", s.expect("API type for", 15))
s.send("\x1b")
check("B: ESC returns to provider select (issue 11)",
      s.expect("Choose a summarization provider", 10), s.text()[-200:].replace("\x1b", "ESC"))
s.send("\x1b")
check("B: ESC at stage0 cancels without touching config",
      s.expect("Setup cancelled", 10), s.text()[-300:].replace("\x1b", "ESC"))
rc = s.close()
check("B: cancel exits 0", rc == 0, f"rc={rc}")
check("B: config still has our saved deepseek entry",
      json.load(open(f"{HOME}/.devlens/config.json"))["summarization"]["providers"]["openai:deepseek"]["apiKey"] == "sk-new-123")

s = Session(["bun", "src/cli/index.ts", "init"], HOME)
check("C: stage0", s.expect("Choose a summarization provider", 30))
s.send("\x03")
cancelled = s.expect("Cancelled.", 10)
out = s.text()
rc = s.close()
check("C: clean 'Cancelled.' line", cancelled, out[-200:].replace("\x1b", "ESC"))
check("C: no stack trace", "    at " not in out and "ExitPromptError" not in out)
check("C: exit 130", rc == 130, f"rc={rc}")

print()
print(("ALL PTY-INIT CHECKS PASSED" if not fails else f"FAILED: {fails}"))
sys.exit(1 if fails else 0)
