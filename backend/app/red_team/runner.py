"""Promptfoo subprocess lifecycle for one Red Team run.

The runner owns only the private workspace and process group. Database state,
result interpretation and persistence remain in the worker.
"""

from dataclasses import dataclass
import os
from pathlib import Path
import shutil
import signal
import subprocess
from tempfile import mkdtemp
import threading
import time

from app.red_team.config_builder import cloud_login_args, to_yaml
from app.red_team.results_parser import (
    ArtifactParseError,
    SuiteSecretError,
    count_progress,
    count_suite_tests,
    sanitize_suite,
)


_REPO_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_BINARY = _REPO_ROOT / "node_modules" / ".bin" / "promptfoo"
_TAIL_BYTES = 4096


@dataclass(frozen=True)
class RunEvent:
    type: str
    phase: str | None = None
    suite: dict | None = None
    test_count: int | None = None
    executed: int | None = None
    status: str | None = None
    exit_code: int | None = None
    error_code: str | None = None
    output_tail: str = ""
    results_path: Path | None = None


def _event(kind, **values):
    return RunEvent(type=kind, **values)


def _secret_values(config):
    found = set()

    def walk(value):
        if isinstance(value, dict):
            for child_key, child in value.items():
                normalized = "".join(c for c in child_key.lower() if c.isalnum())
                if normalized in {"apikey", "token", "secret", "password", "accesskeyid", "secretaccesskey"}:
                    if isinstance(child, str) and child:
                        found.add(child)
                else:
                    walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(config)
    return found


class PromptfooRun:
    def __init__(
        self,
        binary=None,
        workspace_root=None,
        config=None,
        *,
        cloud_host="https://www.promptfoo.app",
        cloud_api_key="",
        env=None,
        suite=None,
        concurrency=2,
        timeout_seconds=7200,
        clock=time.monotonic,
        sleep=time.sleep,
        keep_workspace=False,
    ):
        self.binary = Path(binary) if binary is not None else _DEFAULT_BINARY
        self.workspace_root = Path(workspace_root or Path.cwd())
        self.config = dict(config or {})
        self.cloud_host = cloud_host
        self.cloud_api_key = cloud_api_key
        self.env = dict(env or {})
        self.suite = suite
        self.concurrency = max(1, int(concurrency))
        self.timeout_seconds = timeout_seconds
        self.clock = clock
        self.sleep = sleep
        self.keep_workspace = keep_workspace
        self.workspace = None
        self._cancel_requested = threading.Event()
        self._process = None
        self._process_lock = threading.Lock()
        self._secrets = _secret_values(self.config) | ({cloud_api_key} if cloud_api_key else set())

    def cancel(self):
        self._cancel_requested.set()
        with self._process_lock:
            process = self._process
        if process is not None and process.poll() is None:
            self._terminate(process)

    def _redact(self, text):
        text = text or ""
        for secret in sorted(self._secrets, key=len, reverse=True):
            if secret:
                text = text.replace(secret, "[redacted]")
        return text

    def _tail(self, log_path):
        chunks = []
        try:
            with log_path.open("rb") as handle:
                handle.seek(0, os.SEEK_END)
                handle.seek(max(0, handle.tell() - _TAIL_BYTES))
                chunks.append(handle.read().decode("utf-8", errors="replace"))
        except OSError:
            pass
        logs = self.workspace / "home" / "logs"
        if logs.is_dir():
            error_logs = sorted(logs.glob("promptfoo-error-*.log"), key=lambda path: path.stat().st_mtime)
            if error_logs:
                try:
                    with error_logs[-1].open("rb") as handle:
                        handle.seek(0, os.SEEK_END)
                        handle.seek(max(0, handle.tell() - _TAIL_BYTES))
                        chunks.append(handle.read().decode("utf-8", errors="replace"))
                except OSError:
                    pass
        return self._redact("\n".join(chunks))[-_TAIL_BYTES:]

    def _spawn(self, args, log_path):
        log = log_path.open("ab", buffering=0)
        try:
            process = subprocess.Popen(
                [str(self.binary), *args],
                cwd=self.workspace,
                env=self.env,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        except Exception:
            log.close()
            raise
        process._promptfoo_log = log
        with self._process_lock:
            self._process = process
        return process

    def _waited(self, process):
        with self._process_lock:
            if self._process is process:
                self._process = None
        log = getattr(process, "_promptfoo_log", None)
        if log is not None:
            log.close()

    @staticmethod
    def _signal_group(process, signum):
        try:
            os.killpg(process.pid, signum)
        except ProcessLookupError:
            pass

    def _terminate(self, process):
        if process.poll() is not None:
            return
        self._signal_group(process, signal.SIGTERM)
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self._signal_group(process, signal.SIGKILL)
            process.wait(timeout=5)

    def _prepare_workspace(self):
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        self.workspace = Path(mkdtemp(prefix="promptfoo-", dir=self.workspace_root))
        self.workspace.chmod(0o700)
        (self.workspace / "home").mkdir(mode=0o700)
        self.env["PROMPTFOO_CONFIG_DIR"] = str(self.workspace / "home")
        self.config["outputPath"] = [
            str(self.workspace / "results.jsonl"),
            str(self.workspace / "results.json"),
        ]

    def _login(self, log_path):
        process = self._spawn(cloud_login_args(self.cloud_host, self.cloud_api_key), log_path)
        started = self.clock()
        try:
            while process.poll() is None:
                if self._cancel_requested.is_set():
                    self._terminate(process)
                    return "cancelled", process.returncode
                if self.clock() - started >= self.timeout_seconds:
                    self._terminate(process)
                    return "timeout", process.returncode
                self.sleep(0.05)
            return "done", process.returncode
        finally:
            self._waited(process)

    @staticmethod
    def _read_suite(path):
        suite = sanitize_suite(path.read_text(encoding="utf-8"))
        return suite, count_suite_tests(suite)

    def events(self):
        log_path = None
        try:
            if not self.cloud_api_key:
                yield _event("finished", status="failed", error_code="promptfoo_api_key_missing")
                return
            if not self.binary.is_file() or not os.access(self.binary, os.X_OK):
                yield _event("finished", status="failed", error_code="promptfoo_unavailable")
                return

            self._prepare_workspace()
            log_path = self.workspace / "promptfoo.log"
            yield _event("phase", phase="logging_in")
            try:
                login_state, login_code = self._login(log_path)
            except OSError:
                yield _event("finished", status="failed", error_code="promptfoo_unavailable")
                return
            if login_state == "cancelled":
                yield _event("finished", status="cancelled", exit_code=login_code,
                             output_tail=self._tail(log_path))
                return
            if login_state == "timeout":
                yield _event("finished", status="failed", exit_code=login_code, error_code="timeout",
                             output_tail=self._tail(log_path))
                return
            login_output = self._tail(log_path)
            if login_code != 0 or "successfully logged in" not in login_output.lower():
                yield _event("finished", status="failed", exit_code=login_code,
                             error_code="promptfoo_auth_failed", output_tail=login_output)
                return

            if self.suite is None:
                config_path = self.workspace / "promptfooconfig.yaml"
                config_path.write_text(to_yaml(self.config), encoding="utf-8")
                args = ["redteam", "run", "-c", config_path.name, "--no-progress-bar", "-j", str(self.concurrency)]
                suite_path = self.workspace / "redteam.yaml"
                suite_emitted = False
                yield _event("phase", phase="generating")
            else:
                config_path = self.workspace / "redteam.yaml"
                config_path.write_text(to_yaml(self.config), encoding="utf-8")
                args = ["redteam", "eval", "-c", config_path.name, "--no-table", "--no-progress-bar",
                        "-j", str(self.concurrency)]
                suite_path = config_path
                suite_emitted = True
                yield _event("phase", phase="evaluating")

            try:
                process = self._spawn(args, log_path)
            except OSError:
                yield _event("finished", status="failed", error_code="promptfoo_unavailable")
                return
            started = self.clock()
            last_progress = 0
            forced_status = forced_error = None
            try:
                while process.poll() is None:
                    if self._cancel_requested.is_set():
                        self._terminate(process)
                        forced_status = "cancelled"
                        break
                    if self.clock() - started >= self.timeout_seconds:
                        self._terminate(process)
                        forced_status, forced_error = "failed", "timeout"
                        break
                    if not suite_emitted and suite_path.is_file():
                        try:
                            sanitized, test_count = self._read_suite(suite_path)
                        except SuiteSecretError:
                            self._terminate(process)
                            forced_status, forced_error = "failed", "suite_contains_secret"
                            break
                        except (OSError, UnicodeError, ArtifactParseError):
                            pass
                        else:
                            suite_emitted = True
                            yield _event("suite_ready", suite=sanitized, test_count=test_count)
                            yield _event("phase", phase="evaluating")
                    jsonl = self.workspace / "results.jsonl"
                    if suite_emitted and jsonl.is_file():
                        try:
                            current = count_progress(jsonl.read_text(encoding="utf-8"))
                        except (OSError, UnicodeError):
                            current = last_progress
                        if current > last_progress:
                            last_progress = current
                            yield _event("progress", executed=current)
                    self.sleep(0.1)
                exit_code = process.wait()
            finally:
                self._waited(process)

            if self._cancel_requested.is_set() and forced_status is None:
                forced_status = "cancelled"

            if forced_status:
                yield _event("finished", status=forced_status, exit_code=exit_code,
                             error_code=forced_error, output_tail=self._tail(log_path))
                return

            if not suite_emitted and suite_path.is_file():
                try:
                    sanitized, test_count = self._read_suite(suite_path)
                except SuiteSecretError:
                    yield _event("finished", status="failed", exit_code=exit_code,
                                 error_code="suite_contains_secret", output_tail=self._tail(log_path))
                    return
                except (OSError, UnicodeError, ArtifactParseError):
                    sanitized = None
                if sanitized is not None:
                    suite_emitted = True
                    yield _event("suite_ready", suite=sanitized, test_count=test_count)
                    yield _event("phase", phase="evaluating")

            jsonl = self.workspace / "results.jsonl"
            if jsonl.is_file():
                try:
                    current = count_progress(jsonl.read_text(encoding="utf-8"))
                except (OSError, UnicodeError):
                    current = last_progress
                if current > last_progress:
                    yield _event("progress", executed=current)

            results_path = self.workspace / "results.json"
            output_tail = self._tail(log_path)
            accepted = exit_code in {0, 100}
            no_tests = "no test cases generated" in output_tail.lower()
            if accepted and results_path.is_file() and not no_tests:
                yield _event("phase", phase="importing")
                yield _event("finished", status="completed", exit_code=exit_code,
                             output_tail=output_tail, results_path=results_path)
            elif accepted:
                yield _event("finished", status="failed", exit_code=exit_code,
                             error_code="no_tests_generated", output_tail=output_tail)
            else:
                yield _event("finished", status="failed", exit_code=exit_code,
                             error_code="promptfoo_failed", output_tail=output_tail)
        finally:
            with self._process_lock:
                process = self._process
            if process is not None and process.poll() is None:
                self._terminate(process)
                self._waited(process)
            if self.workspace is not None and not self.keep_workspace:
                shutil.rmtree(self.workspace, ignore_errors=True)
