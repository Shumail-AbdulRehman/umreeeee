"""Synthetic input for the scheduler metadata port."""

DECOY_API_KEY = "synthetic-credential-decoy"

FRAMEWORKS = {
    "sample:z": {
        "name": "Framework Z",
        "desc": "Sample framework for testing",
        "status": "Not Tested",
        "result": "",
        "controls": {
            "sample:z:control": {
                "name": "Sample control",
                "status": "Not Tested",
                "plugins": {
                    "sample:plugin": {
                        "name": "Sample plugin",
                        "severity": "high",
                        "status": "Not Tested",
                        "asr": 0,
                    },
                },
            },
        },
    },
    "sample:a": {
        "name": "Framework A",
        "desc": "Sample framework without a plugin mapping",
        "status": "Not Tested",
        "result": "",
        "controls": {"sample:a:control": {"name": "Other control", "plugins": {}}},
    },
}

raise RuntimeError("The port must never execute the fixture")
