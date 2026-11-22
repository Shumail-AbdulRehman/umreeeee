# GitHub → Heroku API + Netlify frontend

Both a single repository and two separate repositories are supported.

| Layout | Heroku repository root | Netlify base directory |
| --- | --- | --- |
| This entire project | Project root (root Procfile and requirements wrapper) | `Frontend` (root netlify.toml) |
| Two repositories | Contents of `backend/`, with its Procfile at root | Contents of `Frontend/`, base blank |

Follow [backend deployment](backend/DEPLOYMENT.md) and
[frontend deployment](Frontend/DEPLOYMENT.md). Each guide also works when its directory is
uploaded as a standalone repository.

Create the Netlify site to obtain its URL, enter that origin in Heroku's `FRONTEND_APP_URL`
and `CORS_ORIGINS`, configure the remaining backend secrets/services, and deploy Heroku.
Then set Netlify's `VITE_API_BASE_URL` to the actual Heroku HTTPS URL ending in `/api` and
build the frontend. These values are configured in the hosting dashboards, not committed.

Repository setup is ready for deployment; actual cloud deployment and credentials are not
created by these files. MongoDB, SMTP, detector access and optional RabbitMQ must be configured.
When moving an existing database, preserve its encryption keys.

The Red Team runs the promptfoo CLI pinned in the root `package.json`: Heroku needs the `heroku/nodejs` buildpack first
and `heroku/python` second, plus `PROMPTFOO_API_KEY`. Details: [backend deployment](backend/DEPLOYMENT.md#promptfoo-runtime-red-team-engine).
