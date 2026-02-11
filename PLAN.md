# VMS Implementation Plan

## Context

Building a Video Management Solution for a video creator + editor workflow. Videos are stored on Cloudflare R2 (not Frappe's file system); Frappe DocTypes hold metadata only. The React frontend is the primary interface — users don't use Frappe Desk. Authentication uses Frappe's default `/login` page.

### Key Concepts

- **Asset Categories**: Every asset has a `category` — "Source", "Cut" (work-in-progress edit), "Review" (shared for feedback), or "Final" (approved deliverable). Only "Review" and "Final" assets are eligible for transcription.
- **Inbox**: Assets uploaded without a project land in the **Inbox** — a global holding area visible to the uploader. From the Inbox, assets can be moved into any project. This supports ad-hoc uploads (quick screen recordings, rough cuts, etc.) that don't yet have a home.
- **Asset Movement**: Assets can be moved between projects or from the Inbox into a project at any time. Moving an asset updates its `project` link — the R2 object stays in place (no file copy needed).

---

## Phase 1A: Backend

### DocTypes

**1. VMS Settings** (Single DocType) — `vms/video_management_solution/doctype/vms_settings/`
- R2 Account ID, Access Key ID, Secret Access Key (Password field), Bucket Name, Public URL
- Upload settings: max file size (default 5GB), presigned URL expiry (default 3600s), allowed extensions

**2. VMS Project** — `vms/video_management_solution/doctype/vms_project/`
- Fields: `project_name`, `description` (Text Editor), `status` (Open/In Progress/In Review/Completed/Archived), `owner_user` (Link→User), `due_date`, `thumbnail_url`
- Naming: `naming_series:VMS-PROJ-.#####` (global counter via `tabSeries`)
- Permissions: Video Creator (CRUD own), Video Editor (read+write), System Manager (full)

**3. VMS Asset** (standalone, optionally linked to Project) — `vms/video_management_solution/doctype/vms_asset/`
- Fields: `project` (Link→VMS Project, **optional** — null means the asset is in the Inbox), `file_name`, `r2_key` (unique), `file_size`, `file_type` (MIME), `status` (Uploading/Ready/Processing/Error), `category` (Select: Source/Cut/Review/Final — default "Source"), `uploaded_by`, `uploaded_at`, `duration_seconds`, `thumbnail_r2_key`
- Naming: `naming_series:VMS-ASSET-.#####` (global counter via `tabSeries`)
- Permissions: Video Creator (CRUD), Video Editor (read only), System Manager (full)
- **Inbox rule**: Assets where `project` is null are "in the Inbox" — no separate DocType needed

### Custom Roles

- Create `vms/install.py` with `after_install()` hook to create "Video Creator" and "Video Editor" roles with `desk_access=0`
- Register in `hooks.py`: `after_install = "vms.install.after_install"`

### R2 Integration

- **`vms/r2.py`** — boto3 S3 client for Cloudflare R2, functions: `get_r2_client()`, `generate_presigned_upload_url()`, `generate_presigned_view_url()`, `delete_r2_object()`
- Add `boto3` to `pyproject.toml` dependencies

### API Endpoints

- **`vms/api.py`** — All whitelisted endpoints:
  - `get_upload_url(file_name, content_type, project=None, category="Source")` → returns `{upload_url, r2_key, asset_name}`. Validates extension, creates VMS Asset in "Uploading" status with given category. If `project` is omitted, the asset goes to the Inbox.
  - `confirm_upload(asset_name, file_size)` → marks asset as "Ready", sets file_size and uploaded_at
  - `get_view_url(asset_name)` → returns presigned GET URL for streaming
  - `move_asset(asset_name, target_project)` → moves an asset to a different project (or from Inbox to a project). Updates the `project` field. Validates the user has write access to both source and target projects.
  - `update_asset_category(asset_name, category)` → changes an asset's category (Source/Cut/Review/Final). Validates allowed transitions.

### Permission Queries

- **`vms/permissions.py`** — Query conditions so Video Creators only see their own projects/assets, Video Editors see all
- Register in `hooks.py` via `permission_query_conditions`

### Phase 1A Execution Order
1. Add `boto3` to `pyproject.toml`
2. Create `vms/install.py` (role creation)
3. Update `hooks.py` (after_install, permission_query_conditions)
4. Create VMS Settings DocType files
5. Create VMS Project DocType files
6. Create VMS Asset DocType files
7. Create `vms/r2.py`
8. Create `vms/api.py`
9. Create `vms/permissions.py`
10. Run `bench --site <site> migrate`

---

## Phase 1B: Frontend Tooling + App Shell

### Tooling Setup

Install in `frontend/`:
- **Tailwind CSS v4**: `tailwindcss` + `@tailwindcss/vite` (add plugin to `vite.config.ts`)
- **shadcn/ui deps**: `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-slot`, `lucide-react`
- **React Router v7**: `react-router`
- **Toasts**: `sonner`
- Create `src/lib/utils.ts` (cn helper), update `index.css` to `@import "tailwindcss"`
- Add shadcn/ui components: button, input, card, badge, dialog, progress
- Delete `App.css`, `assets/react.svg`

### App Shell

- **No custom login page** — use Frappe's default `/login`. ProtectedRoute redirects unauthenticated users to `/login` (full page redirect, not a React route)
- **`main.tsx`**: BrowserRouter with `basename="/frontend"`, FrappeProvider, Toaster
- **`App.tsx`**: Routes with ProtectedRoute guard (redirects Guest to Frappe `/login`)
- **Layout**: `AppLayout.tsx` (sidebar + header + Outlet), `Sidebar.tsx` (nav: Dashboard, Inbox, Projects), `Header.tsx` (user info + logout)
- **`src/types/index.ts`**: TypeScript interfaces for VMSProject, VMSAsset (including `category` field), API responses
- Stub pages: DashboardPage, InboxPage, ProjectsPage, ProjectDetailPage

### Phase 1B Execution Order
1. Install frontend deps (tailwind, shadcn, react-router, lucide-react, sonner)
2. Update `vite.config.ts` (Tailwind plugin)
3. Replace `index.css`, create `src/lib/utils.ts`
4. Add shadcn/ui components to `src/components/ui/`
5. Create `src/types/index.ts`
6. Create layout components (AppLayout, Sidebar, Header)
7. Rewrite `main.tsx` and `App.tsx` with routing (redirect to `/login` for auth)
8. Create stub pages (Dashboard, Inbox, Projects, ProjectDetail)
9. Delete `App.css`, `assets/react.svg`
10. Verify with `yarn dev`

---

## Phase 2: Core Upload, Browse & Inbox Workflow

### Dashboard Page
- Project counts by status, recent projects, recent uploads
- Inbox badge showing count of unassigned assets
- Uses `useFrappeGetDocList`

### Inbox Page (`/frontend/inbox`)
- Lists all assets where `project` is null (uploaded by the current user)
- Each asset card shows: filename, category badge, upload date, thumbnail/icon
- **Quick upload**: "Upload" button opens upload dialog with no project (assets land in Inbox)
- **Move to project**: Select one or more assets → "Move to Project" action → project picker dialog → calls `vms.api.move_asset` for each
- Bulk select with checkboxes for batch move operations

### Projects Page
- Card grid of projects with status badges
- "New Project" dialog using `useFrappeCreateDoc`
- Click navigates to project detail

### Project Detail Page
- Project header with metadata and edit capability
- Asset list/grid with file info, status, and **category badge** (Source/Cut/Review/Final)
- Filter/group assets by category
- "Upload Assets" button → opens upload dialog (with category selector)
- Click asset → opens video player dialog with presigned view URL
- Asset context menu: change category, move to another project

### Upload Dialog + `useUpload` Hook
- **Upload is a dialog, not a page** — can be triggered from any view (project detail, inbox, dashboard, etc.)
- Accepts an optional `project` prop — if omitted, assets go to the Inbox
- **Category selector**: dropdown to pick Source/Cut/Review/Final (defaults to "Source")
- **Upload flow**:
  1. Drag-and-drop zone to select files
  2. `POST vms.api.get_upload_url` → get presigned PUT URL + create asset record (passes project + category)
  3. `XMLHttpRequest` PUT directly to R2 (with progress tracking via `xhr.upload.onprogress`)
  4. `POST vms.api.confirm_upload` → mark asset as Ready
- **2 concurrent uploads** — pool-based concurrency (start next file as soon as one finishes, max 2 in flight at any time)
- Per-file progress bars, status indicators, error handling

### Move Asset Dialog
- Reusable dialog triggered from Inbox or Project Detail
- Shows a searchable list of projects to move the asset(s) into
- Calls `vms.api.move_asset` — only updates the `project` link, no file copy
- Toast confirmation on success

### Video Player Component
- Fetches presigned view URL via `vms.api.get_view_url`
- Native `<video>` element with controls

### Phase 2 Execution Order
1. Build DashboardPage (with Inbox badge)
2. Build ProjectsPage with create dialog
3. Build ProjectDetailPage with asset listing + category badges
4. Build `useUpload` hook (with concurrency pool of 2)
5. Build UploadDialog component (with category selector + optional project)
6. Build InboxPage (asset list, bulk select, quick upload)
7. Build MoveAssetDialog (project picker, move API call)
8. Build VideoPlayer component
9. End-to-end test: upload to inbox → move to project → upload to project with category → play it back

---

## Phase 3: Video Transcription

Automatically transcribe videos categorized as **"Review"** or **"Final"** — not raw source footage. Transcriptions are useful for searchability, accessibility, and review workflows (e.g., reading through a cut's narration without watching the full video).

### Backend

**1. VMS Transcription** (DocType) — `vms/video_management_solution/doctype/vms_transcription/`
- Fields: `asset` (Link→VMS Asset, unique — one transcription per asset), `status` (Pending/Processing/Completed/Failed), `transcript_text` (Long Text — full plain-text transcript), `transcript_segments` (JSON — timestamped segments array `[{start, end, text}]`), `language` (default "en"), `provider` (e.g., "Cloudflare Workers AI", "OpenAI Whisper"), `error_message`, `created_at`, `completed_at`
- Naming: `naming_series:VMS-TXN-.#####`

**2. Transcription trigger logic** — `vms/transcription.py`
- When an asset's category is changed to "Review" or "Final" (or uploaded directly as one), check if a transcription already exists. If not, enqueue a background job.
- `enqueue_transcription(asset_name)` — creates a VMS Transcription doc in "Pending" status, enqueues `run_transcription` via `frappe.enqueue`
- `run_transcription(transcription_name)` — downloads the video from R2 (presigned GET), sends audio to the transcription provider, parses the result into `transcript_text` + `transcript_segments`, updates status
- Provider options (configurable in VMS Settings):
  - **Cloudflare Workers AI** (Whisper model via REST API — stays in Cloudflare ecosystem)
  - **OpenAI Whisper API** (fallback)

**3. VMS Settings additions**
- Transcription provider (Select: Cloudflare Workers AI / OpenAI Whisper)
- Transcription API key (Password field)
- Auto-transcribe on upload (Check, default on) — when enabled, "Review" and "Final" assets are auto-transcribed on upload confirmation

**4. API endpoints** (added to `vms/api.py`)
- `get_transcription(asset_name)` → returns transcription text + segments if available
- `request_transcription(asset_name)` → manually trigger transcription for an asset (must be Review or Final category)

### Frontend

**Transcription panel** on the Video Player / Asset Detail view:
- If transcription exists and is "Completed": show full transcript text, clickable timestamped segments (click a segment → seek video to that timestamp)
- If "Processing": show a spinner with "Transcribing..."
- If "Failed": show error + "Retry" button
- If no transcription and category is Review/Final: show "Transcribe" button to manually trigger
- If category is Source/Cut: no transcription UI shown (not eligible)

**Search** (future enhancement placeholder): transcription text is stored as Long Text in Frappe, so `useFrappeGetDocList` with text filters can search across transcripts.

### Phase 3 Execution Order
1. Create VMS Transcription DocType
2. Add transcription settings to VMS Settings DocType
3. Create `vms/transcription.py` (enqueue + worker logic)
4. Add transcription API endpoints to `vms/api.py`
5. Hook into asset category change / upload confirmation to auto-trigger transcription
6. Build Transcription panel component in frontend
7. Integrate panel into Video Player / Asset Detail view
8. End-to-end test: upload a "Review" video → transcription auto-starts → transcript appears with timestamps

---

## Phase 4: Thumbnail Generation

Auto-generate thumbnails for video assets using server-side FFmpeg. Thumbnails are displayed in grid/list views for quick visual identification.

### Backend

**1. Thumbnail generation** — `vms/thumbnails.py`
- `generate_thumbnail(asset_name)` — downloads the first ~5MB of the video from R2 (presigned GET), runs FFmpeg to extract a single frame (e.g. at 1s or 10% into the video), uploads the thumbnail JPEG to R2 at `{prefix}/thumbs/{asset_id}.jpg`, updates `thumbnail_r2_key` on the VMS Asset doc
- Uses `subprocess` to call FFmpeg: `ffmpeg -ss 1 -i input -vframes 1 -f image2 -q:v 3 thumb.jpg`
- Requires FFmpeg installed on the server

**2. Background job integration**
- After `confirm_upload` marks an asset as "Ready", enqueue `generate_thumbnail` via `frappe.enqueue`
- Thumbnail generation is non-blocking — the asset is usable immediately, thumbnail appears once the job completes

**3. API additions** (in `vms/api.py`)
- `get_thumbnail_url(asset_name)` → returns presigned GET URL for the thumbnail (or null if not yet generated)
- Alternatively, serve via Cloudflare Image Transformations for on-the-fly resizing if configured

**4. VMS Settings additions**
- `thumbnail_frame_offset` (Int, default 1) — seconds into the video to capture the thumbnail frame

### Frontend

- Asset cards (grid and list views) show the thumbnail image when `thumbnail_r2_key` is populated
- Placeholder icon shown while thumbnail is being generated or if generation failed
- Fetch thumbnail URLs alongside asset data (batch or per-asset)

### Phase 4 Execution Order
1. Create `vms/thumbnails.py` (FFmpeg subprocess + R2 upload)
2. Hook into `confirm_upload` to enqueue thumbnail generation
3. Add `get_thumbnail_url` API endpoint
4. Update frontend asset cards to display thumbnails
5. Test: upload video → thumbnail auto-generates → appears in grid/list views

---

## Phase 5+ (Future — Not Built Now)
- **Video Transcoding Pipeline**: Uploaded videos in non-web-friendly formats (ProRes, HEVC in `.mov`, etc.) are served as-is, causing playback issues in Chrome/Firefox (audio plays but no video). Add server-side FFmpeg transcoding to convert uploads to H.264/AAC in MP4 container — the universally supported web format. Flow: after `confirm_upload`, enqueue a background job that downloads from R2, transcodes via FFmpeg (`-c:v libx264 -c:a aac -movflags +faststart`), uploads the transcoded MP4 back to R2, and updates the asset's `r2_key`/`file_type`. Serve the transcoded version for playback while optionally retaining the original for download. Add `transcoding_status` field to VMS Asset and a progress indicator in the frontend.
- **Folder support within projects**: R2 is flat (no real folders — just key prefixes). Add a `folder` field to VMS Asset, update R2 key format to `{project}/{folder}/{uuid}.{ext}`, build a folder browser UI in ProjectDetailPage (create/rename/delete folders, drag assets between folders). No R2 API calls needed to "create" folders — just use the prefix.
- **Video Review**: Timestamped comments (VMS Comment DocType), Frame.io-like review workflow with transcript-linked comments
- **Version tracking**: Multiple asset versions with comparison
- **Email notifications**: New uploads, review completions
- **Transcript search**: Full-text search across all transcriptions to find specific moments across projects

---

## Verification
1. `bench --site <site> migrate` — DocTypes created without errors
2. `cd frontend && yarn dev` — React app boots, redirects to Frappe `/login` if not authenticated
3. Configure R2 credentials in VMS Settings (Desk)
4. Login → upload a video with no project → appears in Inbox
5. Move the Inbox asset to a project → asset disappears from Inbox, appears in project
6. Upload a video directly to a project with category "Review" → asset shows category badge
7. Change an asset's category from Source → Review → transcription auto-triggers (Phase 3)
8. Play back a video via presigned URL → transcript panel shows timestamped text (Phase 3)
