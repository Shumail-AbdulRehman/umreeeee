"""Operational regressions for Compose setup; no Docker daemon or application DB."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("docker_setup", ROOT / "docker/setup.py")
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / ".env"

    def test_unique_valid_keys_and_private_permissions(self):
        setup.create(self.path)
        values = setup.validate(self.path)
        other = Path(self.directory.name) / "second.env"
        setup.create(other)
        second = setup.validate(other)
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
        for name in setup.REQUIRED:
            self.assertNotEqual(values[name], second[name])
        self.assertNotEqual(values["CONTENT_ENCRYPTION_KEY"], values["INTEGRATION_ENCRYPTION_KEY"])
        self.assertEqual(len(base64.urlsafe_b64decode(values["CONTENT_ENCRYPTION_KEY"])), 32)

    def test_refuses_to_overwrite_existing_credentials(self):
        setup.create(self.path)
        before = self.path.read_bytes()
        with self.assertRaises(FileExistsError):
            setup.create(self.path)
        self.assertEqual(self.path.read_bytes(), before)

    def test_refuses_symlink_destination_without_modifying_target(self):
        target = Path(self.directory.name) / "keep.txt"
        target.write_text("preserve me")
        self.path.symlink_to(target)
        with self.assertRaises(FileExistsError):
            setup.create(self.path)
        self.assertEqual(target.read_text(), "preserve me")

    def test_invalid_and_reused_keys_are_rejected_without_echoing_values(self):
        setup.create(self.path)
        original = self.path.read_text()
        values = setup.read_values(self.path)
        duplicate = original.replace(
            "CONTENT_ENCRYPTION_KEY=" + values["CONTENT_ENCRYPTION_KEY"],
            "CONTENT_ENCRYPTION_KEY=" + values["INTEGRATION_ENCRYPTION_KEY"],
        )
        self.path.write_text(duplicate)
        with self.assertRaisesRegex(ValueError, "different"):
            setup.validate(self.path)
        self.path.write_text(original.replace(values["CONTENT_ENCRYPTION_KEY"], "not-a-key"))
        with self.assertRaises(ValueError) as error:
            setup.validate(self.path)
        self.assertNotIn("not-a-key", str(error.exception))

    def test_missing_credentials_fail_before_compose_startup(self):
        self.path.write_text("SECRET_KEY=\n")
        with self.assertRaisesRegex(ValueError, "Missing required settings"):
            setup.validate(self.path)

    def test_cli_check_does_not_print_credentials_or_modify_file(self):
        setup.create(self.path)
        before = self.path.read_bytes()
        result = subprocess.run(
            ["python3", str(ROOT / "docker/setup.py"), "--output", str(self.path), "--check"],
            capture_output=True, text=True, check=True,
        )
        for secret in setup.validate(self.path).values():
            if len(secret) >= 32:
                self.assertNotIn(secret, result.stdout + result.stderr)
        self.assertEqual(self.path.read_bytes(), before)


class ComposeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.directory.cleanup)
        cls.path = Path(cls.directory.name) / ".env"
        setup.create(cls.path)
        # env_file is intentionally root .env; override only the file path in a
        # temporary Compose document, preserving the actual repository context.
        text = (ROOT / "compose.yaml").read_text().replace("env_file: .env", "env_file: " + str(cls.path))
        cls.compose = Path(cls.directory.name) / "compose.yaml"
        cls.compose.write_text(text)
        result = subprocess.run(
            ["docker", "compose", "--project-directory", str(ROOT), "--env-file", str(cls.path),
             "-f", str(cls.compose), "--profile", "models", "config", "--format", "json"],
            capture_output=True, text=True, check=True,
            env={key: value for key, value in os.environ.items()
                 if key not in set(setup.read_values(cls.path)) | {"MONGODB_URL", "RABBITMQ_URL"}},
        )
        cls.config = json.loads(result.stdout)

    def test_all_processes_share_isolated_db_broker_and_encryption_keys(self):
        services = self.config["services"]
        expected = setup.validate(self.path)
        for name in ("api", "worker", "dispatcher", "recovery"):
            environment = services[name]["environment"]
            self.assertEqual(environment["MONGODB_URL"], "mongodb://mongo:27017/?replicaSet=rs0")
            self.assertIn("@rabbitmq:5672/", environment["RABBITMQ_URL"])
            self.assertEqual(environment["SMTP_HOST"], "mailpit")
            for key in setup.REQUIRED[:3]:
                self.assertEqual(environment[key], expected[key])

    def test_startup_waits_for_replica_set_and_api_liveness(self):
        services = self.config["services"]
        self.assertEqual(services["api"]["depends_on"]["mongo-init"]["condition"], "service_completed_successfully")
        for name in ("frontend", "worker", "dispatcher", "recovery"):
            self.assertEqual(services[name]["depends_on"]["api"]["condition"], "service_healthy")
        self.assertEqual(services["mongo-init"]["restart"], "no")
        self.assertNotIn("ports", services["mongo"])

    def test_public_ports_are_loopback_only_and_models_are_opt_in(self):
        for service in self.config["services"].values():
            for port in service.get("ports", []):
                self.assertEqual(port["host_ip"], "127.0.0.1")
        model = self.config["services"]["model-download"]
        self.assertEqual(model["profiles"], ["models"])
        self.assertEqual(model.get("depends_on", {}), {})

    def test_build_arguments_never_receive_runtime_secrets(self):
        for service in self.config["services"].values():
            arguments = service.get("build", {}).get("args", {})
            for name in setup.REQUIRED + ("PROMPTFOO_API_KEY", "MONGODB_URL"):
                self.assertNotIn(name, arguments)


if __name__ == "__main__":
    unittest.main()
