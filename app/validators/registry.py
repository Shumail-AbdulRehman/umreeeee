"""All findings are metadata; matched text never leaves this module."""
from threading import BoundedSemaphore
from time import monotonic
import os

os.environ.setdefault('OTEL_SDK_DISABLED', 'true')
os.environ.setdefault('GUARDRAILS_DISABLE_TRACING', 'true')

import phonenumbers
import regex
from guardrails.validator_base import Validator, PassResult, FailResult, register_validator
from guardrails.settings import settings

from app.core import config

settings.rc.enable_metrics = False
settings.rc.use_remote_inferencing = False
settings.disable_tracing = True
settings.use_server = False

VERSION = 'phase2-deterministic-1'
_EMAIL = regex.compile(r'(?<![\w.])\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', regex.I)
_PHONE = regex.compile(r'(?<!\w)(?:\+?[\d][\d\s().-]{6,}\d)(?!\w)')
_CARD = regex.compile(r'(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)')


def luhn(value):
    digits = [int(char) for char in value if char.isdigit()]
    if not 13 <= len(digits) <= 19:
        return False
    total = 0
    for position, digit in enumerate(reversed(digits)):
        if position % 2:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0


@register_validator('sentinel_local_rule', data_type='string')
class LocalRuleValidator(Validator):
    rail_alias = 'sentinel_local_rule'

    def __init__(self, rule):
        super().__init__(use_local=True)
        self.rule = rule

    def _validate(self, value, metadata):
        kind, options = self.rule['type'], self.rule['config']
        evidence = []
        if kind == 'keyword':
            text = value if options.get('case_sensitive') else value.casefold()
            for term in options['terms']:
                needle = term if options.get('case_sensitive') else term.casefold()
                if options.get('match_mode') == 'whole_word':
                    try:
                        matches = list(regex.finditer(r'(?<!\w)' + regex.escape(term) + r'(?!\w)', value,
                            flags=0 if options.get('case_sensitive') else regex.I, timeout=.025))
                    except TimeoutError:
                        raise RuntimeError('validator_timeout') from None
                    evidence += [{'kind': 'keyword', 'start': m.start(), 'end': m.end()} for m in matches[:20]]
                else:
                    offset = 0
                    while len(evidence) < 20:
                        at = text.find(needle, offset)
                        if at < 0:
                            break
                        # casefold can expand codepoints; avoid inaccurate offsets in that case.
                        evidence.append({'kind': 'keyword', 'start': at, 'end': at + len(needle)} if len(text) == len(value) else {'kind': 'keyword'})
                        offset = at + max(len(needle), 1)
        elif kind == 'regex':
            try:
                matches = regex.finditer(options['pattern'], value,
                    flags=regex.I if options.get('ignore_case') else 0, timeout=.025)
                evidence = [{'kind': 'regex', 'start': m.start(), 'end': m.end()} for _, m in zip(range(20), matches)]
            except TimeoutError:
                raise RuntimeError('validator_timeout') from None
        elif kind == 'pii':
            wanted = set(options['entities'])
            if 'EMAIL_ADDRESS' in wanted:
                evidence += [{'kind': 'EMAIL_ADDRESS', 'start': m.start(), 'end': m.end()}
                             for m in _EMAIL.finditer(value, timeout=.025)]
            if 'PHONE_NUMBER' in wanted:
                for m in _PHONE.finditer(value, timeout=.025):
                    try:
                        parsed = phonenumbers.parse(m.group(), config.PII_PHONE_REGION)
                        if phonenumbers.is_valid_number(parsed):
                            evidence.append({'kind': 'PHONE_NUMBER', 'start': m.start(), 'end': m.end()})
                    except phonenumbers.NumberParseException:
                        continue
            if 'CREDIT_CARD' in wanted:
                evidence += [{'kind': 'CREDIT_CARD', 'start': m.start(), 'end': m.end()}
                             for m in _CARD.finditer(value, timeout=.025) if luhn(m.group())]
            if .99 < options.get('threshold', .8):
                evidence = []
        else:
            raise RuntimeError('validator_unavailable')
        metadata['evidence'] = evidence[:20]
        return FailResult(error_message='Policy rule matched') if evidence else PassResult()


class ValidatorRegistry:
    def __init__(self):
        self.models = {}
        self.load_errors = {}
        self.inference_slots = BoundedSemaphore(2)
        self.inference_waiters = BoundedSemaphore(50)

    def capabilities(self):
        result = {}
        for kind in ['keyword', 'regex', 'pii', 'prompt_injection', 'toxicity']:
            ready = kind in {'keyword', 'regex', 'pii'} or kind in self.models
            version = self.models[kind][2] if kind in self.models else VERSION if kind in {'keyword', 'regex', 'pii'} else None
            result[kind] = {'type': kind, 'configured': True, 'available': ready,
                            'ready': ready, 'implementation_version': version,
                            'supported_stages': ['input', 'output'], 'max_input_size': 24000,
                            'runtime_budget_ms': config.VALIDATION_STAGE_TIMEOUT_MS,
                            'reason': None if ready else self.load_errors.get(kind, 'Local model not installed and warmed')}
        result['catalog'] = {'type': 'catalog', 'configured': config.REMOTE_DETECTION_ENABLED,
            'available': config.REMOTE_DETECTION_ENABLED, 'ready': config.REMOTE_DETECTION_ENABLED,
            'implementation_version': 'cytex-provisional-v1', 'supported_stages': ['input', 'output'],
            'max_input_size': 24000, 'runtime_budget_ms': config.VALIDATION_STAGE_TIMEOUT_MS,
            'reason': None if config.REMOTE_DETECTION_ENABLED else 'External detection is disabled; no requests are sent'}
        return result

    def warm_local_models(self):
        """Explicit startup only; never download while executing a prompt."""
        try:
            import torch
            from transformers import AutoTokenizer, AutoModelForSequenceClassification, pipeline
        except ImportError:
            return
        torch.set_num_threads(min(4, os.cpu_count() or 1))
        for kind, model_id, revision in [('prompt_injection', config.INJECTION_MODEL_ID, config.INJECTION_MODEL_REVISION),
                                         ('toxicity', config.TOXICITY_MODEL_ID, config.TOXICITY_MODEL_REVISION)]:
            if kind in self.models:
                continue
            if not revision:
                continue
            try:
                tokenizer = AutoTokenizer.from_pretrained(model_id, revision=revision, cache_dir=config.VALIDATOR_MODEL_CACHE_DIR, local_files_only=True)
                model = AutoModelForSequenceClassification.from_pretrained(model_id, revision=revision, cache_dir=config.VALIDATOR_MODEL_CACHE_DIR, local_files_only=True)
                clf = pipeline('text-classification', model=model, tokenizer=tokenizer, top_k=None, device=-1)
                clf('Warm-up.')
                self.models[kind] = (clf, tokenizer, revision)
            except Exception as exc:
                self.load_errors[kind] = 'Local model files or dependencies could not be loaded'
                continue

    def evaluate(self, rule, text, field):
        start = monotonic()
        kind = rule['type']
        result = {'rule_id': rule['rule_id'], 'type': kind, 'field': field,
                  'outcome': 'pass', 'score': None, 'threshold': rule['config'].get('threshold'),
                  'reason_code': None, 'evidence': [], 'duration_ms': 0,
                  'implementation_version': VERSION}
        try:
            if kind in {'keyword', 'regex', 'pii'}:
                metadata = {}
                check = LocalRuleValidator(rule).validate(text, metadata)
                result['evidence'] = metadata.get('evidence', [])
                result['outcome'] = 'match' if isinstance(check, FailResult) else 'pass'
                if kind == 'pii':
                    result['score'] = .99 if result['outcome'] == 'match' else 0.0
            elif kind in self.models:
                if not self.inference_waiters.acquire(blocking=False):
                    raise RuntimeError('inference_overloaded')
                try:
                    remaining = config.VALIDATION_STAGE_TIMEOUT_MS / 1000 - (monotonic() - start)
                    if remaining <= 0 or not self.inference_slots.acquire(timeout=remaining):
                        raise RuntimeError('validator_timeout')
                    try:
                        self._evaluate_semantic(kind, rule, text, result)
                    finally:
                        self.inference_slots.release()
                finally:
                    self.inference_waiters.release()
            else:
                raise RuntimeError('model_unavailable')
        except Exception as exc:
            result['outcome'] = 'error'
            result['evidence'] = []
            result['reason_code'] = str(exc) if str(exc) in {'validator_timeout', 'model_unavailable', 'input_too_large', 'validator_unavailable', 'inference_overloaded'} else 'validator_exception'
        result['duration_ms'] = round((monotonic() - start) * 1000, 3)
        if result['duration_ms'] > config.VALIDATION_STAGE_TIMEOUT_MS:
            result.update(outcome='error', evidence=[], reason_code='validator_timeout')
        return result

    def _evaluate_semantic(self, kind, rule, text, result):
                clf, tokenizer, revision = self.models[kind]
                ids = tokenizer.encode(text, add_special_tokens=False)
                size, stride = min(480, tokenizer.model_max_length - 2), 64
                if size <= stride or len(ids) > size + (size - stride) * 31:
                    raise RuntimeError('input_too_large')
                windows = [tokenizer.decode(ids[i:i + size], skip_special_tokens=True)
                           for i in range(0, len(ids), size - stride)] or ['']
                if len(windows) > 32:
                    raise RuntimeError('input_too_large')
                scores = []
                for window in windows:
                    labels = clf(window, truncation=False)
                    labels = labels[0] if labels and isinstance(labels[0], list) else labels
                    harmful = {'LABEL_1', 'INJECTION', 'injection'} if kind == 'prompt_injection' else {
                        'toxic', 'severe_toxic', 'obscene', 'threat', 'insult', 'identity_hate'}
                    scores.append(max((float(item['score']) for item in labels if item['label'] in harmful), default=0.0))
                result['score'] = max(scores)
                result['outcome'] = 'match' if result['score'] >= rule['config']['threshold'] else 'pass'
                result['implementation_version'] = revision
                if result['outcome'] == 'match':
                    result['evidence'] = [{'kind': kind, 'count': 1}]


registry = ValidatorRegistry()
