"""Cytex detection adapter. Disabled by default; never probes the remote services."""
import json
from time import monotonic

import httpx

from app.core import config

GUARDRAIL_URL = 'https://centurion.cytex.io/api/v1/batch-detect'
DLP_URL = 'https://lambda10.cytex.io/api/v1/detect'


class DetectionError(Exception):
    pass


def catalog_ready(policy):
    """Configuration readiness only; never performs a network probe."""
    return bool(config.REMOTE_DETECTION_ENABLED and
                (policy.get('category') == 'guardrail' or
                 policy.get('category') == 'dlp' and config.DLP_DETECTION_API_KEY))


def build_request(policy, text):
    kind = policy.get('category')
    entries = policy.get('entries', [])
    available = {entry.get('pattern_id') or entry.get('id') for entry in entries}
    selected = policy.get('selected_entry_ids')
    if kind not in {'dlp', 'guardrail'} or not isinstance(selected, list) or not selected:
        raise DetectionError('invalid_detector_selection')
    if any(not isinstance(item, str) or not item for item in selected):
        raise DetectionError('invalid_detector_selection')
    if len(selected) != len(set(selected)) or not set(selected).issubset(available):
        raise DetectionError('invalid_detector_selection')
    if kind == 'dlp':
        return DLP_URL, {'text': text, 'pattern_ids': selected, 'custom_patterns': []}
    return GUARDRAIL_URL, {'output': text,
        'plugins': [{'pluginId': item, 'config': {}} for item in selected], 'includePassing': False}


def parse_response(body, kind, selected):
    """Provisional strict contract: findings-only arrays, each with a selected ID.

    Unknown formats and partial/error results fail closed. No raw matched content
    or remote messages are returned or persisted. Confirm this with API developers.
    """
    key = 'detections' if kind == 'dlp' else 'results'
    id_key = 'pattern_id' if kind == 'dlp' else 'pluginId'
    if not isinstance(body, dict) or body.get('error') or body.get('errors') or body.get('success') is False:
        raise DetectionError('detector_invalid_response')
    if body.get('status') not in (None, 'success', 'completed', 'ok'):
        raise DetectionError('detector_invalid_response')
    if body.get('partial') or body.get('complete') is False or body.get('evaluation_complete') is False:
        raise DetectionError('detector_invalid_response')
    findings = body.get(key)
    if not isinstance(findings, list):
        raise DetectionError('detector_invalid_response')
    if kind == 'guardrail' and 'summary' in body:
        summary = body['summary']
        if not isinstance(summary, dict):
            raise DetectionError('detector_invalid_response')
        total, passed, failed = (summary.get(k) for k in ('total', 'passed', 'failed'))
        if (any(type(n) is not int or n < 0 for n in (total, passed, failed)) or
                total != len(selected) or passed + failed != total or failed != len(findings)):
            raise DetectionError('detector_incomplete_response')
        if body.get('violations') and not findings:
            raise DetectionError('detector_incomplete_response')
    evidence = []
    for finding in findings:
        if not isinstance(finding, dict) or finding.get(id_key) not in selected:
            raise DetectionError('detector_invalid_response')
        if finding.get('error') or finding.get('errors') or finding.get('success') is False:
            raise DetectionError('detector_invalid_response')
        if finding.get('status') not in (None, 'violation', 'detected', 'match'):
            raise DetectionError('detector_invalid_response')
        if 'pass' in finding or 'passed' in finding:
            raise DetectionError('detector_invalid_response')
        evidence.append({'kind': kind, 'entry_id': finding[id_key]})
    return evidence[:20], len(findings)


def post_detection(url, payload, headers, timeout):
    # No retries, redirects, environment proxies, health probes, or response logging.
    deadline = monotonic() + timeout
    with httpx.Client(timeout=timeout, follow_redirects=False, trust_env=False) as client:
        with client.stream('POST', url, json=payload, headers=headers) as response:
            if response.status_code != 200:
                raise DetectionError('detector_http_error')
            data = bytearray()
            for chunk in response.iter_bytes():
                if monotonic() > deadline:
                    raise DetectionError('detector_timeout')
                data.extend(chunk)
                if len(data) > 1_048_576:
                    raise DetectionError('detector_invalid_response')
            return json.loads(data)


def evaluate_catalog(policy, rule, text, field, timeout):
    start = monotonic()
    result = {'rule_id': rule['rule_id'], 'type': 'catalog', 'field': field,
              'outcome': 'error', 'reason_code': None, 'evidence': [], 'duration_ms': 0,
              'implementation_version': 'cytex-provisional-v1'}
    try:
        # Check before constructing a client: off means absolutely no outbound traffic.
        if not config.REMOTE_DETECTION_ENABLED:
            raise DetectionError('remote_detection_disabled')
        url, payload = build_request(policy, text)
        headers = {}
        if policy['category'] == 'dlp':
            if not config.DLP_DETECTION_API_KEY:
                raise DetectionError('detector_key_missing')
            headers['x-api-key'] = config.DLP_DETECTION_API_KEY
        if timeout <= 0:
            raise DetectionError('detector_timeout')
        body = post_detection(url, payload, headers, min(timeout, config.REMOTE_DETECTION_TIMEOUT_SECONDS))
        evidence, count = parse_response(body, policy['category'], policy['selected_entry_ids'])
        names = {entry.get('pattern_id') or entry.get('id'): entry.get('name') or entry.get('title')
                 for entry in policy.get('entries', [])}
        for item in evidence:
            item['entry_name'] = names.get(item['entry_id']) or item['entry_id']
        result.update(outcome='match' if count else 'pass', evidence=evidence, finding_count=count)
    except DetectionError as exc:
        result['reason_code'] = str(exc)
    except httpx.TimeoutException:
        result['reason_code'] = 'detector_timeout'
    except Exception:
        result['reason_code'] = 'detector_unavailable'
    result['duration_ms'] = round((monotonic() - start) * 1000, 3)
    if result['duration_ms'] > timeout * 1000:
        result.update(outcome='error', evidence=[], reason_code='detector_timeout')
    return result
