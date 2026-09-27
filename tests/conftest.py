import os

os.environ.setdefault('SECRET_KEY', 'phase1-test-secret-do-not-use-in-real-app-123456')
os.environ.setdefault('INTEGRATION_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')
os.environ.setdefault('CONTENT_ENCRYPTION_KEY', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=')
os.environ.setdefault('VALIDATOR_MODEL_CACHE_DIR', '/tmp/sentinel-phase2-empty-model-cache')
# Never let a developer's .env turn on live detector calls during the test suite.
os.environ['REMOTE_DETECTION_ENABLED'] = 'false'

# Pricing tests use the installed catalog, never a network-fetched rate map.
os.environ['LITELLM_LOCAL_MODEL_COST_MAP'] = 'True'
