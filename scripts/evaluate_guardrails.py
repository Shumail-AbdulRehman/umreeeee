"""Evaluate the local detector registry on the fixed synthetic dataset; no provider calls."""
import json
from pathlib import Path
from time import perf_counter

from app.validators.registry import registry

DATASET = Path(__file__).resolve().parents[1] / 'tests' / 'fixtures' / 'enforcement_cases.json'


def evaluate():
    registry.warm_local_models()
    dataset = json.loads(DATASET.read_text(encoding='utf-8'))
    specs = {
        'pii': {'rule_id': 'pii', 'type': 'pii', 'config': {
            'entities': ['EMAIL_ADDRESS', 'PHONE_NUMBER', 'CREDIT_CARD'], 'threshold': .8}},
        'prompt_injection': {'rule_id': 'injection', 'type': 'prompt_injection', 'config': {'threshold': .8}},
        'toxicity': {'rule_id': 'toxicity', 'type': 'toxicity', 'config': {'threshold': .8}},
    }
    expected = {'pii': {'pii'}, 'prompt_injection': {'direct_injection', 'jailbreak'},
                'toxicity': {'harmful_content'}}
    report = {'dataset_version': dataset['version'], 'source': dataset['source'],
              'counts': {category: len(cases) for category, cases in dataset['cases'].items()},
              'capabilities': registry.capabilities(), 'detectors': {}}
    for kind, rule in specs.items():
        confusion = {category: {'tp': 0, 'fn': 0, 'fp': 0, 'tn': 0, 'error': 0}
                     for category in dataset['cases']}
        durations = []
        for category, cases in dataset['cases'].items():
            for text in cases:
                start = perf_counter()
                value = registry.evaluate(rule, text, 'sample')
                durations.append((perf_counter() - start) * 1000)
                if value['outcome'] == 'error':
                    confusion[category]['error'] += 1
                else:
                    positive = category in expected[kind]
                    matched = value['outcome'] == 'match'
                    confusion[category]['tp' if positive and matched else
                                        'fn' if positive else 'fp' if matched else 'tn'] += 1
        tp = sum(item['tp'] for item in confusion.values())
        fn = sum(item['fn'] for item in confusion.values())
        fp = sum(item['fp'] for item in confusion.values())
        tn = sum(item['tn'] for item in confusion.values())
        report['detectors'][kind] = {'threshold': rule['config']['threshold'], 'per_category': confusion,
            'precision': tp / (tp + fp) if tp + fp else None, 'recall': tp / (tp + fn) if tp + fn else None,
            'accuracy': (tp + tn) / (tp + fp + tn + fn) if tp + fp + tn + fn else None,
            'errors': sum(item['error'] for item in confusion.values()),
            'mean_latency_ms': round(sum(durations) / len(durations), 3)}
    report['output_cases'] = {'counts': {name: len(cases) for name, cases in dataset['output_cases'].items()},
                              'toxicity': {}}
    for category, cases in dataset['output_cases'].items():
        outcomes = [registry.evaluate(specs['toxicity'], value, 'response_text')['outcome'] for value in cases]
        report['output_cases']['toxicity'][category] = {
            'match': outcomes.count('match'), 'pass': outcomes.count('pass'), 'error': outcomes.count('error')}
    return report


if __name__ == '__main__':
    print(json.dumps(evaluate(), indent=2))
