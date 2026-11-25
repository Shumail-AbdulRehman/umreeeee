"""Explicitly populate the shared validator cache using the app's pinned revisions."""
def main():
    try:
        import torch  # noqa: F401 - ensure the image supports local inference
        import transformers  # noqa: F401
        from huggingface_hub import snapshot_download
    except ImportError as error:
        raise SystemExit("Rebuild with INSTALL_LOCAL_ML=true before downloading models.") from error
    from app.core import config

    for model_id, revision in (
        (config.INJECTION_MODEL_ID, config.INJECTION_MODEL_REVISION),
        (config.TOXICITY_MODEL_ID, config.TOXICITY_MODEL_REVISION),
    ):
        snapshot_download(model_id, revision=revision, cache_dir=config.VALIDATOR_MODEL_CACHE_DIR)
    print("Pinned validator models downloaded. Restart the API and worker to warm them.")


if __name__ == "__main__":
    main()
