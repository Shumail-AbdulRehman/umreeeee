"""Opt-in warmed, validator-only CPU load check. No provider or database access."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from time import perf_counter

from app.services.analytics_service import percentile
from app.validators.registry import registry


def run():
    registry.warm_local_models()
    sample = 'Please summarize our project meeting, list the action items, and explain the next steps to the team.'
    report = {'cpu_count': os.cpu_count(), 'policy_mix': 'one input-stage injection classifier',
              'prompt_length': len(sample), 'models_ready': registry.capabilities()['prompt_injection']['ready'],
              'results': {}}
    if not report['models_ready']:
        raise RuntimeError('Install and warm the pinned injection model before measuring')
    rule = {'rule_id': 'semantic-benchmark', 'type': 'prompt_injection', 'config': {'threshold': .8}}
    registry.evaluate(rule, sample, 'user_prompt')
    for concurrency in (1, 10, 50):
        samples = []

        def submit(_):
            begin = perf_counter()
            result = registry.evaluate(rule, sample, 'user_prompt')
            return (perf_counter() - begin) * 1000, result['outcome'], result['reason_code']

        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            for future in as_completed([pool.submit(submit, i) for i in range(50)]):
                samples.append(future.result())
        report['results'][concurrency] = {'requests': len(samples),
            'latency_ms': percentile([sample[0] for sample in samples]),
            'errors': sum(sample[1] == 'error' for sample in samples),
            'error_codes': {code: sum(sample[2] == code for sample in samples)
                            for code in sorted({sample[2] for sample in samples if sample[2]})}}
    return report


if __name__ == '__main__':
    print(json.dumps(run(), indent=2))
