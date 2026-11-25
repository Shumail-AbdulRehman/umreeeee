# Staff Import scope splits

- Split preview/normalization from persistence so validation is reusable and remains read-only.
- Split invitation delivery from provisioning so SMTP errors cannot leave a partially created batch.
- Split UI states from their Users entry and transport so the states can be verified with simple synthetic fixtures.
- No generic imports platform, role migration, or bulk edit in the initial feature. CSV is the only supported format.
