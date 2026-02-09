# VMS Progress Report

_Last updated: 2026-02-09_

---

## Phase 1A: Backend — COMPLETE

| Item | Status | Notes |
|------|--------|-------|
| VMS Settings (Single DocType) | Done | R2 credentials, upload limits, allowed extensions |
| VMS Project DocType | Done | Naming series, status workflow, role-based permissions |
| VMS Asset DocType | Done | Optional project link (null = Inbox), category field, R2 key |
| Custom Roles (Video Creator / Video Editor) | Done | Created via `install.py`, `desk_access=0` |
| R2 Integration (`r2.py`) | Done | Upload, view, download presigned URLs + delete |
| API Endpoints (`api.py`) | Done | 10 endpoints — upload flow, view/download URLs, move asset, category update, R2 test, bucket usage |
| Permission Queries (`permissions.py`) | Done | Creators see own projects/assets; Editors + System Manager see all |
| hooks.py | Done | `after_install`, `permission_query_conditions`, `website_route_rules` |
| `boto3` in pyproject.toml | Done | `>=1.35.0` |

---

## Phase 1B: Frontend Tooling + App Shell — COMPLETE

| Item | Status | Notes |
|------|--------|-------|
| Tailwind CSS v4 + Vite plugin | Done | No separate config file — all in CSS + Vite plugin |
| shadcn/ui (base-maia style) | Done | 17 components installed, uses `@base-ui/react` (not Radix) |
| React Router v7 | Done | Protected routes redirect to Frappe `/login` |
| Sonner toasts | Done | |
| HugeIcons | Done | Used instead of Lucide (project uses `@hugeicons/react`) |
| AppLayout, Sidebar, Header | Done | |
| TypeScript interfaces | Done | `VMSProject`, `VMSAsset`, API response types |
| Stub pages → fully built | Done | All 4 pages are fully functional (not stubs) |

---

## Phase 2: Core Upload, Browse & Inbox Workflow — COMPLETE

| Item | Status | Notes |
|------|--------|-------|
| Dashboard Page | Done | Summary cards (inbox count, project counts, storage usage via Cloudflare API), recent projects, recent uploads |
| Projects Page | Done | Card grid, create project dialog (name, description, due date), status badges |
| Project Detail Page | Done | Tabs for Assets (Source/Cut) and Exports (Review/Final), list/grid toggle, bulk select, upload to project |
| Inbox Page | Done | Lists unassigned assets, bulk select, bulk move, bulk download, category/status badges |
| Upload Dialog + `useUpload` hook | Done | Drag-and-drop, category selector, 2 concurrent uploads, per-file progress, error cleanup |
| Move Asset Dialog | Done | Project picker dropdown, bulk move support, toast confirmations |
| Media Player (Video/Audio/Image) | Done | Presigned view URLs, native HTML5 controls, responsive sizing |
| Download (`useDownload` hook) | Done | Single + bulk download via presigned download URLs |
| Settings Dialog | Done | Two-pane layout, R2 config, upload settings, test connection — accessible from Sidebar |
| Dark Mode | Done | ThemeProvider + ModeToggle (Light/Dark/System), persists to localStorage |

---

## Phase 3: Video Transcription — NOT STARTED

| Item | Status |
|------|--------|
| VMS Transcription DocType | Not started |
| `transcription.py` (enqueue + worker) | Not started |
| Transcription API endpoints | Not started |
| VMS Settings additions (provider, API key) | Not started |
| Frontend transcription panel | Not started |

---

## Phase 4: Thumbnail Generation — NOT STARTED

| Item | Status |
|------|--------|
| `thumbnails.py` (FFmpeg + R2 upload) | Not started |
| Background job after `confirm_upload` | Not started |
| `get_thumbnail_url` API endpoint | Not started |
| Frontend asset card thumbnails | Not started |

---

## Phase 5+: Future — NOT STARTED

- Folder support within projects
- Video review with timestamped comments
- Version tracking
- Email notifications
- Transcript search

---

## Learnings & Notes

### Architecture Decisions
- **shadcn base-maia style**: Uses `@base-ui/react` instead of Radix. Components use `render` prop for composition (not `asChild`). This affects how triggers wrap custom elements (e.g., `<DropdownMenuTrigger render={<Button />}>`).
- **Tailwind CSS v4**: No `tailwind.config.js` — theme is defined via CSS custom properties in `index.css` with `@theme inline` and `@custom-variant dark`. Dark mode variables were already included from the shadcn init.
- **HugeIcons over Lucide**: The project uses `@hugeicons/react` + `@hugeicons/core-free-icons`. Icon usage pattern: `<HugeiconsIcon icon={SomeIcon} strokeWidth={2} />`.
- **SettingsPage vs SettingsDialog**: A full `SettingsPage.tsx` exists but is unused — the app uses a `SettingsDialog` triggered from the Sidebar instead. The page could be cleaned up.

### Frontend Patterns
- `frappe-react-sdk` hooks (`useFrappeGetDocList`, `useFrappePostCall`, `useFrappeAuth`) are used throughout — always check the SDK README for correct API.
- Upload flow is three-step: get presigned URL → XHR PUT to R2 → confirm upload. Failed uploads call `fail_upload` to clean up the asset record.
- Assets with `project = null` are "in the Inbox" — no separate DocType needed.

### Dev Environment
- Site: `vms.localhost:8000`
- Frontend dev server: `localhost:8080`
- R2 bucket: `vms-media`
- Wrangler CLI for Cloudflare operations (`npx wrangler`)
