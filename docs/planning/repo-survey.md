# Repository survey

Recorded 2026-11-04. Read-only inspection; existing working-tree changes are preserved.

## git log --oneline -15

```text
2d25058 first commit
```

## git status --short

```text
 M Frontend/.gitignore
 M Frontend/README.md
 M Frontend/eslint.config.js
 M Frontend/index.html
 M Frontend/package-lock.json
 M Frontend/package.json
 M Frontend/public/favicon.svg
 M Frontend/src/App.jsx
 M Frontend/src/components/DataState.jsx
 M Frontend/src/components/Modal.jsx
 M Frontend/src/components/NotificationPanel.jsx
 M Frontend/src/components/PageTitle.jsx
 M Frontend/src/components/PolicyCheckPicker.jsx
 M Frontend/src/components/Sidebar.jsx
 M Frontend/src/components/Topbar.jsx
 M Frontend/src/config/navigation.js
 M Frontend/src/index.css
 M Frontend/src/main.jsx
 M Frontend/src/pages/ActivityLogPage.jsx
 M Frontend/src/pages/CatalogPage.jsx
 M Frontend/src/pages/InsightsPage.jsx
 M Frontend/src/pages/IntegrationsPage.jsx
 M Frontend/src/pages/InventoryPage.jsx
 M Frontend/src/pages/LatencyPage.jsx
 M Frontend/src/pages/PoliciesPage.jsx
 M Frontend/src/pages/PromptStudioPage.jsx
 M Frontend/src/pages/RedTeamPage.jsx
 M Frontend/src/pages/SettingsPage.jsx
 M Frontend/src/pages/SpendPage.jsx
 M Frontend/src/pages/UsersPage.jsx
 M Frontend/src/pages/ViolationsPage.jsx
 M Frontend/src/pages/auth/AcceptInvitePage.jsx
 M Frontend/src/pages/auth/AuthShell.jsx
 M Frontend/src/pages/auth/ForgotPasswordPage.jsx
 M Frontend/src/pages/auth/LoginPage.jsx
 M Frontend/src/pages/auth/SignupPage.jsx
 M Frontend/src/pages/auth/VerifyEmailPage.jsx
 M Frontend/src/pages/pageRegistry.jsx
 M Frontend/src/pages/policies.css
 M Frontend/src/services/api/client.js
 M Frontend/src/services/promptWorkspace/promptWorkspaceService.js
 M Frontend/src/services/redTeam/redTeamService.js
 M Frontend/src/services/users/userManagementService.js
 M Frontend/tests/policy-pages.browser.cjs
 M Frontend/vite.config.js
 M backend/.gitignore
 M backend/README.md
 M backend/app/api/routes/administration.py
 M backend/app/api/routes/health.py
 M backend/app/api/routes/prompts.py
 M backend/app/api/routes/users.py
 M backend/app/db/indexes.py
 M backend/app/db/mongo.py
 M backend/app/main.py
 M backend/app/schemas/prompts.py
 M backend/app/schemas/users.py
 M backend/app/services/dashboard_service.py
 M backend/app/services/enforcement_service.py
 M backend/app/services/policy_catalog.py
 M backend/app/services/protected_prompt_service.py
 M backend/app/services/provider_service.py
 M backend/app/services/remote_detection.py
 M backend/app/services/user_management_service.py
 M backend/tests/integration/test_phase1_http.py
 M backend/tests/integration/test_phase2_enforcement.py
 M backend/tests/integration/test_policy_catalogs.py
 M backend/tests/unit/test_phase1_contracts.py
 M backend/tests/unit/test_remote_detection.py
 M docs/API_CONTRACTS.md
 M docs/POLICY_CATALOGS.md
 M docs/REMOTE_DETECTION.md
?? .agents/
?? .ai/
?? .gitignore
?? .python-version
?? .slugignore
?? AGENTS.md
?? DEPLOYMENT.md
?? DESIGN.md
?? Frontend/.env.example
?? Frontend/.node-version
?? Frontend/DEPLOYMENT.md
?? Frontend/components.json
?? Frontend/jsconfig.json
?? Frontend/netlify.toml
?? Frontend/scripts/
?? Frontend/src/assets/providers/
?? Frontend/src/components/AnalyticsChart.jsx
?? Frontend/src/components/BrandMark.jsx
?? Frontend/src/components/DataTable.jsx
?? Frontend/src/components/LoadingSurface.jsx
?? Frontend/src/components/PageLoadingBoundary.jsx
?? Frontend/src/components/PageSkeleton.jsx
?? Frontend/src/components/StatusBadge.jsx
?? Frontend/src/components/Surface.jsx
?? Frontend/src/components/ViolationContext.jsx
?? Frontend/src/components/loading-surface.css
?? Frontend/src/components/page-loading.css
?? Frontend/src/components/ui/
?? Frontend/src/lib/
?? Frontend/src/pages/IntegrationsPage.css
?? Frontend/src/pages/UserInsightsPage.jsx
?? Frontend/src/pages/insights.css
?? Frontend/src/pages/red-team.css
?? Frontend/src/pages/user-insights-data.js
?? Frontend/src/pages/user-insights.css
?? Frontend/src/pages/violations.css
?? Frontend/src/pages/workspace.css
?? Frontend/src/services/api/requestActivity.js
?? Frontend/tests/admin-policy-groups.browser.cjs
?? Frontend/tests/api-contract.test.mjs
?? Frontend/tests/conversations.browser.cjs
?? Frontend/tests/integrations.browser.cjs
?? Frontend/tests/redesign.browser.cjs
?? Frontend/tests/user-insights-data.test.mjs
?? Frontend/tests/user-insights.browser.cjs
?? Frontend/tests/violations.browser.cjs
?? Procfile
?? backend/.env.production.example
?? backend/.python-version
?? backend/.slugignore
?? backend/DEPLOYMENT.md
?? backend/Procfile
?? backend/app/db/diagnostics.py
?? backend/app/services/policy_sets.py
?? backend/scripts/check_database.py
?? backend/tests/unit/test_conversation_providers.py
?? backend/tests/unit/test_db_diagnostics.py
?? docs/DEEP_PROJECT_REVIEW_2026-10-11.md
?? docs/PROJECT_ANALYSIS_2026-10-11.md
?? docs/UI_REDESIGN.md
?? netlify.toml
?? requirements.txt
```

## find . -maxdepth 3 -type d -not -path */node_modules/* -not -path */.git/*

```text
.
./.pytest_cache
./.pytest_cache/v
./.pytest_cache/v/cache
./Frontend
./Frontend/scripts
./Frontend/public
./Frontend/tests
./Frontend/node_modules
./Frontend/src
./Frontend/src/config
./Frontend/src/pages
./Frontend/src/utils
./Frontend/src/lib
./Frontend/src/hooks
./Frontend/src/services
./Frontend/src/assets
./Frontend/src/components
./Frontend/dist
./Frontend/dist/assets
./Frontend/.git
./docs
./docs/research
./docs/planning
./docs/implementation
./.ai
./.ai/plan-project
./.ai/plan-project/scripts
./.ai/plan-project/companions
./.ai/plan-project/templates
./.ai/plan-project/references
./.ai/plan-project/assets
./backend
./backend/.venv
./backend/.venv/lib
./backend/.venv/include
./backend/.venv/bin
./backend/.venv/share
./backend/.pytest_cache
./backend/.pytest_cache/v
./backend/scripts
./backend/scripts/__pycache__
./backend/.model-cache
./backend/.model-cache/models--unitary--toxic-bert
./backend/.model-cache/.locks
./backend/.model-cache/models--protectai--deberta-v3-base-prompt-injection-v2
./backend/tests
./backend/tests/integration
./backend/tests/benchmarks
./backend/tests/unit
./backend/tests/fixtures
./backend/tests/__pycache__
./backend/app
./backend/app/queue
./backend/app/api
./backend/app/schemas
./backend/app/core
./backend/app/repositories
./backend/app/utils
./backend/app/workers
./backend/app/red_team
./backend/app/db
./backend/app/models
./backend/app/services
./backend/app/__pycache__
./backend/app/validators
./backend/.git
./.agents
./.agents/skills
./.git
```

## ls -d .claude AGENTS.md CLAUDE.md .kiro specs context design docs orchestro

```text
AGENTS.md
docs
ls: cannot access '.claude': No such file or directory
ls: cannot access 'CLAUDE.md': No such file or directory
ls: cannot access '.kiro': No such file or directory
ls: cannot access 'specs': No such file or directory
ls: cannot access 'context': No such file or directory
ls: cannot access 'design': No such file or directory
ls: cannot access 'orchestro': No such file or directory
```

## Frontend/package.json

```text
{
  "name": "frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "node --test tests/*.test.mjs",
    "test:ui": "node tests/redesign.browser.cjs",
    "test:workflows": "node tests/conversations.browser.cjs && node tests/admin-policy-groups.browser.cjs && node tests/policy-pages.browser.cjs",
    "test:user-insights": "node tests/user-insights.browser.cjs",
    "test:integrations": "node tests/integrations.browser.cjs",
    "test:violations": "node tests/violations.browser.cjs"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.2.4",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.55.0",
    "radix-ui": "^1.7.0",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "recharts": "^3.10.1",
    "tailwind-merge": "^3.7.0",
    "tailwindcss": "^4.2.4"
  },
  "devDependencies": {
    "@axe-core/playwright": "^4.13.0",
    "@babel/core": "^7.29.0",
    "@eslint/js": "^10.0.1",
    "@playwright/test": "^1.64.0",
    "@rolldown/plugin-babel": "^0.2.3",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "babel-plugin-react-compiler": "^1.0.0",
    "eslint": "^10.2.1",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "^17.5.0",
    "vite": "^8.0.10"
  }
}

```

## backend/requirements.txt

```text
fastapi==0.116.1
uvicorn[standard]==0.35.0
pymongo==4.13.2
dnspython==2.8.0
passlib==1.7.4
python-jose[cryptography]==3.5.0
python-dotenv==1.1.1
cryptography==50.0.1
regex==2026.9.10
guardrails-ai==0.11.0
phonenumbers==9.0.39
httpx==0.28.1
pika==1.4.4
litellm==1.102.1

```
