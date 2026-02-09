# E2E Testing Setup (Playwright)

Based on the patterns established in [apps/wiki](../wiki/).

---

## Directory Structure

```
vms/
├── e2e/
│   ├── .auth/                  # Generated — gitignored
│   │   ├── user.json           # Saved browser session (cookies/localStorage)
│   │   └── csrf.json           # CSRF token for API calls
│   ├── helpers/
│   │   ├── auth.ts             # Login/logout via API and UI
│   │   ├── frappe.ts           # Frappe REST API wrapper (CRUD, method calls, CSRF handling)
│   │   ├── vms.ts              # VMS-specific helpers (create project, asset, cleanup)
│   │   └── index.ts            # Re-exports
│   ├── pages/                  # Page objects (optional, add as needed)
│   │   └── index.ts
│   ├── tests/
│   │   ├── auth.setup.ts       # Setup project: authenticate + save state
│   │   ├── projects.spec.ts    # Project CRUD tests
│   │   ├── upload.spec.ts      # Upload dialog + R2 flow tests
│   │   └── ...
│   └── tsconfig.json           # TypeScript config with path aliases
├── playwright.config.ts        # Playwright configuration
└── package.json                # Add playwright scripts + devDependency
```

---

## 1. Install Playwright

```bash
cd apps/vms
yarn add -D @playwright/test
npx playwright install --with-deps chromium
```

## 2. package.json Scripts

Add to the root `package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:debug": "playwright test --debug"
  }
}
```

## 3. Playwright Config

Create `playwright.config.ts` at the app root:

```ts
import { defineConfig, devices } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, "e2e", ".auth", "user.json");

export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  timeout: 60000,

  expect: {
    timeout: 10000,
  },

  use: {
    baseURL: process.env.BASE_URL || "http://vms.test:8000",
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
      dependencies: ["setup"],
    },
  ],
});
```

**Key decisions (from wiki):**
- `workers: 1` and `fullyParallel: false` — Frappe has server-side session state; parallel tests cause conflicts
- Setup project authenticates once → saves cookies to `e2e/.auth/user.json` → all tests reuse that session
- `baseURL` defaults to `http://vms.test:8000` (override with `BASE_URL` env var)

## 4. TypeScript Config for E2E

Create `e2e/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@helpers/*": ["helpers/*"],
      "@pages/*": ["pages/*"]
    }
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules"]
}
```

## 5. Auth Setup (e2e/tests/auth.setup.ts)

Runs once before all test suites:

1. POST `/api/method/login` with credentials from `FRAPPE_USER` / `FRAPPE_PASSWORD` env vars
2. Verify login via `GET /api/method/frappe.auth.get_logged_user`
3. Navigate to `/app`, extract `window.frappe.csrf_token`
4. Save CSRF token to `e2e/.auth/csrf.json`
5. Save browser storage state to `e2e/.auth/user.json`

## 6. Helper Modules

### `e2e/helpers/frappe.ts` — Generic Frappe API wrapper

Provides CRUD operations with CSRF token handling:

```ts
// All mutations (POST, PUT, DELETE) include the X-Frappe-CSRF-Token header
// Token is read from e2e/.auth/csrf.json (saved during auth setup)

createDoc(request, doctype, doc)       // POST /api/resource/{doctype}
getDoc(request, doctype, name)         // GET /api/resource/{doctype}/{name}
updateDoc(request, doctype, name, doc) // PUT /api/resource/{doctype}/{name}
deleteDoc(request, doctype, name)      // DELETE /api/resource/{doctype}/{name}
getList(request, doctype, options)     // GET /api/resource/{doctype}?filters=...
callMethod(request, method, args)      // POST /api/method/{method}
docExists(request, doctype, name)      // Check existence
```

### `e2e/helpers/vms.ts` — VMS-specific helpers

```ts
createTestProject(request, options)    // Create VMS Project via API
createTestAsset(request, options)      // Create VMS Asset via API
cleanupTestProjects(request, pattern)  // Batch delete test data
```

## 7. .gitignore

Add:

```
e2e/.auth/
test-results/
playwright-report/
```

---

## CI Workflow

Create `.github/workflows/ui-tests.yml`:

```yaml
name: UI Tests

on:
  push:
    branches: [develop]
  pull_request:
  workflow_dispatch:

concurrency:
  group: ui-tests-vms-${{ github.event.number || github.ref }}
  cancel-in-progress: true

jobs:
  ui-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    name: Playwright E2E Tests

    services:
      redis-cache:
        image: redis:alpine
        ports:
          - 13000:6379
      redis-queue:
        image: redis:alpine
        ports:
          - 11000:6379
      mariadb:
        image: mariadb:10.6
        env:
          MYSQL_ROOT_PASSWORD: root
        ports:
          - 3306:3306
        options: --health-cmd="mariadb-admin ping" --health-interval=5s --health-timeout=2s --health-retries=3

    steps:
      - name: Clone
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.14"

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 24
          check-latest: true

      - name: Add to Hosts
        run: echo "127.0.0.1 vms.test" | sudo tee -a /etc/hosts

      - name: Cache pip
        uses: actions/cache@v4
        with:
          path: ~/.cache/pip
          key: ${{ runner.os }}-pip-${{ hashFiles('**/*requirements.txt', '**/pyproject.toml') }}

      - name: Get yarn cache directory path
        id: yarn-cache-dir-path
        run: echo "dir=$(yarn cache dir)" >> $GITHUB_OUTPUT

      - name: Cache yarn
        uses: actions/cache@v4
        with:
          path: ${{ steps.yarn-cache-dir-path.outputs.dir }}
          key: ${{ runner.os }}-yarn-${{ hashFiles('**/yarn.lock') }}

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-playwright-${{ hashFiles('**/package.json') }}

      - name: Install MariaDB Client
        run: |
          sudo apt update
          sudo apt-get install mariadb-client

      - name: Setup Bench
        run: |
          pip install frappe-bench
          bench init --skip-redis-config-generation --skip-assets --python "$(which python)" ~/frappe-bench
          mariadb --host 127.0.0.1 --port 3306 -u root -proot -e "SET GLOBAL character_set_server = 'utf8mb4'"
          mariadb --host 127.0.0.1 --port 3306 -u root -proot -e "SET GLOBAL collation_server = 'utf8mb4_unicode_ci'"

      - name: Install VMS
        working-directory: /home/runner/frappe-bench
        run: |
          bench get-app vms $GITHUB_WORKSPACE
          bench setup requirements --dev
          bench new-site --db-root-password root --admin-password admin vms.test
          bench --site vms.test install-app vms
          bench build
        env:
          CI: "Yes"

      - name: Configure Site
        working-directory: /home/runner/frappe-bench
        run: |
          bench --site vms.test set-config allow_tests true
          bench --site vms.test set-config host_name "http://vms.test:8000"

      - name: Start Frappe Server
        working-directory: /home/runner/frappe-bench
        run: |
          sed -i 's/^watch:/# watch:/g' Procfile
          sed -i 's/^schedule:/# schedule:/g' Procfile
          bench start &> bench_start.log &
          echo "Waiting for Frappe server to start..."
          timeout 60 bash -c 'until curl -s http://vms.test:8000 > /dev/null; do sleep 2; done'
          echo "Frappe server is ready!"

      - name: Install Playwright
        run: |
          npm install
          npx playwright install --with-deps chromium

      - name: Run Playwright Tests
        run: npx playwright test
        env:
          BASE_URL: http://vms.test:8000
          FRAPPE_USER: Administrator
          FRAPPE_PASSWORD: admin

      - name: Upload Playwright Report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

      - name: Upload Test Results
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: test-results
          path: test-results/
          retention-days: 7

      - name: Show Bench Logs on Failure
        if: failure()
        working-directory: /home/runner/frappe-bench
        run: |
          echo "=== Bench Start Log ==="
          cat bench_start.log || true
          echo ""
          echo "=== Frappe Logs ==="
          cat logs/*.log || true
```

---

## Running Tests Locally

```bash
# 1. Make sure your site is running
bench start

# 2. Run all tests (headless)
yarn test:e2e

# 3. Run with interactive UI (best for debugging)
yarn test:e2e:ui

# 4. Run a specific test file
npx playwright test e2e/tests/projects.spec.ts

# 5. Run with visible browser
yarn test:e2e:headed

# 6. Debug mode (step through)
yarn test:e2e:debug
```

**Environment variables for local runs:**

```bash
BASE_URL=http://vms.localhost:8000  # Your local site URL
FRAPPE_USER=Administrator
FRAPPE_PASSWORD=admin
```

---

## Note on R2 in Tests

E2E tests that exercise the upload flow will need either:
- A real R2 bucket configured in VMS Settings (use a dedicated test bucket)
- Or mock the presigned URL endpoints at the API level for CI environments where R2 isn't available

This decision should be made when writing the upload tests.
