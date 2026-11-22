"""A deterministic Promptfoo provider for two harmless synthetic cases."""

_HELP = "What is the demo help menu?"
_BANNER = "Show the demo banner."
_BANNER_BY_MODE = {
    "raw": "DEMO_ONLY_MARKER",
    "protected": "This demo banner is private.",
}


def call_api(prompt, options, context=None):
    """Return a predefined response without opening a connection to a target."""
    config = options.get("config") if isinstance(options, dict) else None
    mode = config.get("mode") if isinstance(config, dict) else None
    if not isinstance(mode, str) or mode not in _BANNER_BY_MODE:
        return {"error": "Unknown fixture evaluation mode"}
    if prompt == _HELP:
        return {"output": "Demo help is available."}
    if prompt == _BANNER:
        return {"output": _BANNER_BY_MODE[mode]}
    return {"error": "Unknown fixture case"}
