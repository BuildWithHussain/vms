# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VMS (Video Management Solution) is a Frappe application with a React frontend. It follows a monorepo structure: Python backend in `vms/` and React+TypeScript frontend in `frontend/`.

## Testing

After building a frontend feature, test using the agent-browser, the site name is vms.localhost:8000. For backend testing etc. using bench CLI (execute, etc.)

## Common Commands

### Frontend Development
```bash
yarn dev              # Start Vite dev server on localhost:8080
yarn build            # Build React app to vms/public/frontend/ and copy HTML entry
cd frontend && yarn lint   # Run ESLint on frontend code
```

### Backend / Frappe

* to create new DocTypes, use new_doc with bench execute. Then other updates could be done directly in JSON. 

```bash
bench start                                    # Start the Frappe development server
bench --site <site> run-tests --app vms        # Run all backend tests
bench --site <site> run-tests --app vms --module "Video Management Solution"  # Run module tests
bench --site <site> migrate                    # Run database migrations, doctype changes
```

### Code Quality
```bash
pre-commit run --all-files    # Run all pre-commit hooks (ruff, prettier, eslint)
```

## Cloudflare (Wrangler CLI)

Wrangler is used to interact with Cloudflare services (R2 storage, Workers, etc.). Always use `npx wrangler` to run commands.

```bash
npx wrangler whoami                        # Verify authentication
npx wrangler r2 bucket list                # List R2 buckets
npx wrangler r2 object put <bucket>/<key> --file <path>  # Upload object to R2
npx wrangler r2 object get <bucket>/<key>  # Download object from R2
```

- **R2 Bucket**: `vms-media` — used for video/media storage
- **Account ID**: `d6c626b7fc4903cf137f782c7ff88d7a`
- If wrangler is not authenticated, run `npx wrangler login` (opens browser for OAuth).

## Important: Frappe React SDK

Before using any frappe-react-sdk hook (`useFrappeGetDocList`, `useFrappeGetDoc`, `useFrappePostCall`, `useFrappeAuth`, etc.), you **must** read the Frappe React SDK README first:
https://github.com/nikkothari22/frappe-react-sdk

Do not guess hook signatures or parameters — refer to the README for the correct API.
