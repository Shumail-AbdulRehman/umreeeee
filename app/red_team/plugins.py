"""Red Team v3 catalog: plugins, strategies and controls. Pure: no database, network or clock."""
import json
import re
from pathlib import Path
from types import MappingProxyType

CATALOG_PATH = Path(__file__).parent / 'catalog_v3.json'
SEVERITIES = ('critical', 'high', 'medium', 'low')
GROUPS = ('Data leakage', 'Injection', 'Behaviour')
EVIDENCE_TYPES = ('marker', 'pii', 'tool_call', 'off_topic', 'safe_summary', 'control')
STRATEGY_GROUPS = ('Baseline', 'Encodings', 'Framing')
EFFORTS = ('low', 'medium', 'high')
PLACEHOLDERS = ('marker', 'refusal', 'answer')
MIN_TEMPLATES, MAX_TEMPLATES = 4, 6
_TOKEN = re.compile(r'\{([a-z_]+)\}')


class CatalogError(ValueError):
    """Raised when catalog data is invalid; the message names the offending field."""


def _need(condition, message):
    if not condition:
        raise CatalogError(message)


def _text(item, key, where):
    value = item.get(key) if isinstance(item, dict) else None
    _need(isinstance(value, str) and value.strip(), f'{where}.{key} must be non-empty text')
    return value


def _tokens(text, where):
    for name in _TOKEN.findall(text):
        _need(name in PLACEHOLDERS, f'{where} uses unknown placeholder {{{name}}}')


def validate(data):
    """Validate raw catalog data and return it unchanged; raise CatalogError otherwise."""
    _need(isinstance(data, dict), 'catalog must be an object')
    _text(data, 'version', 'catalog')
    _text(data, 'source', 'catalog')
    plugins = data.get('plugins')
    _need(isinstance(plugins, list) and plugins, 'catalog.plugins must be a non-empty list')
    seen, template_ids = set(), set()
    for plugin in plugins:
        pid = _text(plugin, 'id', 'plugin')
        where = f'plugin {pid}'
        _need(pid not in seen, f'plugins.id duplicate: {pid}')
        seen.add(pid)
        _text(plugin, 'name', where)
        _text(plugin, 'description', where)
        _tokens(_text(plugin, 'scenario', where), f'{where}.scenario')
        _need(plugin.get('group') in GROUPS, f'{where}.group {plugin.get("group")!r} is not one of {GROUPS}')
        _need(plugin.get('severity') in SEVERITIES, f'{where}.severity {plugin.get("severity")!r} is not one of {SEVERITIES}')
        _need(plugin.get('evidence_type') in EVIDENCE_TYPES and plugin.get('evidence_type') != 'control',
              f'{where}.evidence_type {plugin.get("evidence_type")!r} is not one of {EVIDENCE_TYPES[:-1]}')
        templates = plugin.get('templates')
        _need(isinstance(templates, list) and MIN_TEMPLATES <= len(templates) <= MAX_TEMPLATES,
              f'{where}.templates must hold {MIN_TEMPLATES}-{MAX_TEMPLATES} templates')
        for template in templates:
            tid = _text(template, 'id', f'{where}.templates')
            _need(tid not in template_ids, f'templates.id duplicate: {tid}')
            template_ids.add(tid)
            _text(template, 'description', f'template {tid}')
            _tokens(_text(template, 'prompt', f'template {tid}'), f'template {tid}.prompt')
    strategies = data.get('strategies')
    _need(isinstance(strategies, list) and strategies, 'catalog.strategies must be a non-empty list')
    seen = set()
    for item in strategies:
        sid = _text(item, 'id', 'strategy')
        _need(sid not in seen, f'strategies.id duplicate: {sid}')
        seen.add(sid)
        _text(item, 'name', f'strategy {sid}')
        _text(item, 'description', f'strategy {sid}')
        _need(item.get('group') in STRATEGY_GROUPS, f'strategy {sid}.group {item.get("group")!r} is not one of {STRATEGY_GROUPS}')
        _need(item.get('effort') in EFFORTS, f'strategy {sid}.effort {item.get("effort")!r} is not one of {EFFORTS}')
    _need('basic' in seen, 'strategies must include basic')
    controls = data.get('controls')
    _need(isinstance(controls, list) and controls, 'catalog.controls must be a non-empty list')
    seen = set()
    for item in controls:
        cid = _text(item, 'id', 'control')
        _need(cid not in seen and cid not in template_ids, f'controls.id duplicate: {cid}')
        seen.add(cid)
        _tokens(_text(item, 'prompt', f'control {cid}'), f'control {cid}.prompt')
    return data


def _freeze(value):
    if isinstance(value, dict):
        return MappingProxyType({k: _freeze(v) for k, v in value.items()})
    if isinstance(value, list):
        return tuple(_freeze(v) for v in value)
    return value


def load(path=CATALOG_PATH):
    """Read, validate and freeze a catalog file; returns (version, source, plugins, strategies, controls)."""
    try:
        data = json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise CatalogError(f'catalog file {path} cannot be read: {error}') from error
    validate(data)
    by_id = lambda key: MappingProxyType({i['id']: _freeze(i) for i in data[key]})
    return data['version'], data['source'], by_id('plugins'), by_id('strategies'), by_id('controls')


CATALOG_VERSION, CATALOG_SOURCE, PLUGINS, STRATEGIES, CONTROLS = load()
PLUGIN_IDS = tuple(PLUGINS)
STRATEGY_IDS = tuple(STRATEGIES)
CONTROL_IDS = tuple(CONTROLS)


def get_plugin(plugin_id):
    try:
        return PLUGINS[plugin_id]
    except KeyError:
        raise CatalogError(f'Unknown plugin: {plugin_id}') from None


def get_strategy(strategy_id):
    try:
        return STRATEGIES[strategy_id]
    except KeyError:
        raise CatalogError(f'Unknown strategy: {strategy_id}') from None


def fill(text, values):
    """Replace only the known {marker}/{refusal}/{answer} placeholders; other braces stay untouched."""
    return _TOKEN.sub(lambda m: str(values[m.group(1)]) if m.group(1) in values else m.group(0), text)
