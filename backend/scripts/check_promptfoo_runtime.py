"""Report whether the pinned promptfoo CLI can run the red team on this machine.

Run: python -m scripts.check_promptfoo_runtime   (from backend/)
`runtime_status()` is also used by the Red Team API (capabilities, launch) and the worker.
It never prints the promptfoo Cloud key: only whether it is configured.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

PINNED_VERSION = '0.126.0'
MIN_NODE_MAJOR = 22  # promptfoo 0.126.0 declares engines.node >=22.22.0; the repo pins 24.x
DEFAULT_CLOUD_HOST = 'https://www.promptfoo.app'
REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / 'backend'
_SEMVER = re.compile(r'(\d+)\.(\d+)\.(\d+)')
_PROBE_ENV = {'PROMPTFOO_DISABLE_TELEMETRY': '1', 'PROMPTFOO_DISABLE_UPDATE': '1', 'FORCE_COLOR': '0'}


def default_binary():
    return REPO_ROOT / 'node_modules' / '.bin' / 'promptfoo'


def _probe(run, command, timeout):
    """Run a version command; return the first x.y.z found in stdout, else None. Never raises."""
    env = {key: os.environ[key] for key in ('PATH', 'HOME', 'LANG') if key in os.environ}
    env.update(_PROBE_ENV)
    try:
        result = run(command, capture_output=True, text=True, timeout=timeout, env=env, stdin=subprocess.DEVNULL)
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    match = _SEMVER.search(result.stdout or '')
    return match.group(0) if match else None


def runtime_status(binary=None, env=None, run=subprocess.run, timeout=20):
    """Return a JSON-safe readiness report for the promptfoo red-team runtime."""
    env = os.environ if env is None else env
    binary = Path(binary) if binary else default_binary()
    key = (env.get('PROMPTFOO_API_KEY') or '').strip()
    status = {
        'binary_present': binary.is_file() and os.access(binary, os.X_OK),
        'expected_version': PINNED_VERSION,
        'version': None,
        'version_ok': False,
        'node_major': None,
        'node_ok': False,
        'cloud_key_configured': bool(key),
        'cloud_host': (env.get('PROMPTFOO_CLOUD_HOST') or '').strip() or DEFAULT_CLOUD_HOST,
        'available': False,
        'error': None,
    }
    node = _probe(run, ['node', '--version'], timeout)
    if node:
        status['node_major'] = int(node.split('.')[0])
        status['node_ok'] = status['node_major'] >= MIN_NODE_MAJOR
    if not status['binary_present']:
        status['error'] = 'binary_missing'
    else:
        status['version'] = _probe(run, [str(binary), '--version'], timeout)
        status['version_ok'] = status['version'] == PINNED_VERSION
        if status['version'] is None:
            status['error'] = 'version_unreadable'
        elif not status['version_ok']:
            status['error'] = 'version_mismatch'
    if status['error'] is None and not status['node_ok']:
        status['error'] = 'node_unsupported'
    status['available'] = status['error'] is None
    return status


def main():
    try:
        from dotenv import load_dotenv
        load_dotenv(BACKEND_ROOT / '.env')
    except ImportError:
        pass
    status = runtime_status()
    print(json.dumps(status, indent=2))
    if not status['available']:
        print(f'promptfoo runtime unavailable: {status["error"]}. Run `npm ci` in the repository root.', file=sys.stderr)
    elif not status['cloud_key_configured']:
        print('PROMPTFOO_API_KEY is not set; hosted attack generation will fail.', file=sys.stderr)
    return 0 if status['available'] and status['cloud_key_configured'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
