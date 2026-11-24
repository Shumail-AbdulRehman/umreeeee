import json
from pathlib import Path
import shutil
import stat
import subprocess
import sys

import pytest

from scripts import check_promptfoo_runtime as checker

SECRET = 'sk-test-secret-value-1234567890'


def fake_binary(tmp_path, version='0.126.0', exit_code=0):
    path = tmp_path / 'promptfoo'
    path.write_text(f'#!/bin/sh\necho "{version}"\nexit {exit_code}\n')
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return path


def node_runner(node_version='v24.14.1'):
    """Real subprocess for the fake promptfoo binary; canned answer for `node --version`."""
    def run(command, **kwargs):
        if command[0] == 'node':
            return subprocess.CompletedProcess(command, 0, stdout=node_version + '\n', stderr='')
        return subprocess.run(command, **kwargs)
    return run


def test_matching_version_is_available(tmp_path):
    status = checker.runtime_status(fake_binary(tmp_path), env={'PROMPTFOO_API_KEY': SECRET}, run=node_runner())
    assert status['available'] is True
    assert status['version'] == '0.126.0' and status['version_ok'] is True
    assert status['node_major'] == 24 and status['node_ok'] is True
    assert status['cloud_key_configured'] is True
    assert status['cloud_host'] == checker.DEFAULT_CLOUD_HOST
    assert status['error'] is None


def test_wrong_version_is_reported(tmp_path):
    status = checker.runtime_status(fake_binary(tmp_path, '0.125.1'), env={}, run=node_runner())
    assert status['available'] is False
    assert status['error'] == 'version_mismatch'
    assert status['version'] == '0.125.1'


def test_missing_binary_is_reported_separately(tmp_path):
    status = checker.runtime_status(tmp_path / 'absent', env={}, run=node_runner())
    assert status['binary_present'] is False
    assert status['error'] == 'binary_missing'
    assert status['available'] is False


def test_unreadable_version_is_reported(tmp_path):
    status = checker.runtime_status(fake_binary(tmp_path, 'garbage', exit_code=3), env={}, run=node_runner())
    assert status['error'] == 'version_unreadable'


def test_old_node_major_is_unsupported(tmp_path):
    status = checker.runtime_status(fake_binary(tmp_path), env={}, run=node_runner('v20.11.0'))
    assert status['node_major'] == 20
    assert status['error'] == 'node_unsupported'
    assert status['available'] is False


def test_missing_node_is_unsupported(tmp_path):
    def run(command, **kwargs):
        if command[0] == 'node':
            raise FileNotFoundError('node')
        return subprocess.run(command, **kwargs)
    status = checker.runtime_status(fake_binary(tmp_path), env={}, run=run)
    assert status['node_major'] is None and status['error'] == 'node_unsupported'


def test_api_key_is_masked_everywhere(tmp_path):
    env = {'PROMPTFOO_API_KEY': SECRET, 'PROMPTFOO_CLOUD_HOST': 'https://cloud.example.test'}
    for binary in (fake_binary(tmp_path), tmp_path / 'absent'):
        status = checker.runtime_status(binary, env=env, run=node_runner())
        assert SECRET not in json.dumps(status)
        assert status['cloud_key_configured'] is True
        assert status['cloud_host'] == 'https://cloud.example.test'
    assert checker.runtime_status(fake_binary(tmp_path), env={'PROMPTFOO_API_KEY': '  '}, run=node_runner())['cloud_key_configured'] is False


def test_main_prints_no_secret(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv('PROMPTFOO_API_KEY', SECRET)
    monkeypatch.setattr(checker, 'default_binary', lambda: tmp_path / 'absent')
    assert checker.main() == 1
    output = capsys.readouterr()
    assert SECRET not in output.out + output.err
    assert 'binary_missing' in output.err


@pytest.mark.parametrize('standalone', [False, True])
def test_runtime_paths_follow_the_deployed_layout(tmp_path, standalone):
    source = Path(__file__).resolve().parents[2]
    deploy = tmp_path / 'deploy'
    backend = tmp_path / 'backend' if standalone else deploy / 'backend'
    if standalone:
        deploy = backend
    shutil.copytree(source / 'app' / 'red_team', backend / 'app' / 'red_team',
                    ignore=shutil.ignore_patterns('__pycache__'))
    (backend / 'scripts').mkdir()
    script = backend / 'scripts' / 'check_promptfoo_runtime.py'
    shutil.copyfile(checker.__file__, script)
    (backend / 'promptfoo_bridge').mkdir()
    shutil.copyfile(source / 'promptfoo_bridge' / 'provider.py', backend / 'promptfoo_bridge' / 'provider.py')
    (deploy / 'package.json').write_text('{}')
    binary_dir = deploy / 'node_modules' / '.bin'
    binary_dir.mkdir(parents=True)
    binary = fake_binary(binary_dir)

    result = subprocess.run([sys.executable, '-I', str(script)], cwd=tmp_path,
                            capture_output=True, text=True, timeout=25)
    status = json.loads(result.stdout)
    assert status['binary_present'] and status['version'] == '0.126.0'

    program = """
import json
import sys
sys.path.insert(0, sys.argv[1])
from app.red_team.config_builder import BRIDGE_PROVIDER
from app.red_team.runner import PromptfooRun
print(json.dumps([str(PromptfooRun().binary), str(BRIDGE_PROVIDER)]))
"""
    result = subprocess.run([sys.executable, '-I', '-c', program, str(backend)], cwd=tmp_path,
                            capture_output=True, text=True, check=True, timeout=25)
    assert json.loads(result.stdout) == [str(binary), str(backend / 'promptfoo_bridge' / 'provider.py')]
