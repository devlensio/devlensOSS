"""Tiny PTY driver: spawn a CLI under a real TTY, send keys on schedule,
assert on accumulated output. Replaces expect (whose timeout clause proved
unreliable here)."""
import os, pty, select, sys, time

REPO = os.environ.get("DEVLENS_OSS_REPO") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

class Session:
    def __init__(self, argv, home, cwd=REPO):
        pid, fd = pty.fork()
        if pid == 0:
            os.environ["HOME"] = home
            os.environ["TERM"] = "xterm-256color"
            for k in ("DEVLENS_LLM_KEY", "DEVLENS_LLM_MODEL", "DEVLENS_LLM_PROVIDER",
                      "DEVLENS_LLM_PROVIDER_NAME", "DEVLENS_LLM_BASE_URL"):
                os.environ.pop(k, None)
            os.chdir(cwd)
            os.execvp(argv[0], argv)
        self.pid, self.fd = pid, fd
        self.buf = bytearray()
        self.pos = 0
        os.set_blocking(fd, False)

    def pump(self, seconds):
        end = time.time() + seconds
        while time.time() < end:
            r, _, _ = select.select([self.fd], [], [], min(0.1, max(0, end - time.time())))
            if r:
                try:
                    data = os.read(self.fd, 65536)
                except OSError:
                    return False
                if not data:
                    return False
                self.buf += data
        return True

    def expect(self, pattern, timeout=30, poll=0.1):
        """Wait until `pattern` (str, decoded latin-1 so ANSI won't split it... we
        search the RAW buffer as latin-1) appears. Returns matched index."""
        if isinstance(pattern, str):
            needle = pattern.encode()
        else:
            needle = pattern
        end = time.time() + timeout
        while time.time() < end:
            idx = self.buf.find(needle, self.pos)
            if idx >= 0:
                self.pos = idx + len(needle)
                return True
            r, _, _ = select.select([self.fd], [], [], poll)
            if r:
                try:
                    data = os.read(self.fd, 65536)
                except OSError:
                    break
                if not data:
                    break
                self.buf += data
        return False

    def send(self, data):
        if isinstance(data, str):
            data = data.encode()
        os.write(self.fd, data)

    def close(self, timeout=15):
        end = time.time() + timeout
        status = None
        while time.time() < end:
            pid, st = os.waitpid(self.pid, os.WNOHANG)
            if pid:
                status = st
                break
            self.pump(0.2)
        if status is None:
            try:
                os.kill(self.pid, 9)
            except ProcessLookupError:
                pass
            _, status = os.waitpid(self.pid, 0)
        try:
            os.close(self.fd)
        except OSError:
            pass
        if os.WIFEXITED(status):
            return os.WEXITSTATUS(status)
        if os.WIFSIGNALED(status):
            return -os.WTERMSIG(status)
        return status

    def text(self):
        return self.buf.decode("utf-8", errors="replace")
