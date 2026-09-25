# document.bd — Architecture

## 1. Architecture Principle

document.bd is a modular multi-editor platform.

Each editor is an independent feature module.

Reusable UI components are allowed, but editor state must remain isolated.

---

# 2. Application Structure

Recommended conceptual structure:

src/
├── app/
│   ├── dashboard/
│   ├── studio/
│   │   ├── editor/
│   │   │   ├── tm/
│   │   │   ├── pdf/
│   │   │   ├── hacked-page-recover/
│   │   │   ├── youtube-trademark/
│   │   │   ├── business-manager/
│   │   │   ├── nid/
│   │   │   ├── tin/
│   │   │   └── unhcr/
│   │   ├── history/
│   │   ├── templates/
│   │   ├── projects/
    │   │   ├── settings/
    │   │   ├── support/
    │   │   └── bug-hunter/
│
├── components/
│   ├── editor/
│   ├── support/
│   ├── dashboard/
│   └── shared/
│
├── lib/
│   ├── auth/
│   ├── permissions/
│   ├── vault/
│   ├── history/
│   └── supabase/

---

# 3. Editor Architecture

Every editor should have:

- Dedicated route
- Dedicated document type
- Dedicated state
- Dedicated save logic
- Dedicated History identity
- Permission scope
- Shared UI components where appropriate

Shared code must not create shared mutable state.

---

# 4. Document Identity

Every saved document must have a clear document type.

Examples:

tm-certificate
pdf-editor
hacked-page-recover
youtube-trademark
business-manager
nid
tin
unhcr-server-1
unhcr-server-2

Never use one generic document type when two editors require independent state.

---

# 5. UNHCR Server Isolation

Server 1 and Server 2 are separate logical editor instances.

Server 1:
- template = server1
- state = server1
- history = server1

Server 2:
- template = server2
- state = server2
- history = server2

A Server 2 save MUST NOT update Server 1.

A Server 1 save MUST NOT update Server 2.

---

# 6. History Architecture

History identifies records by:
- authenticated user
- document type
- record ID
- editor type

Opening History must route to the correct editor.

Example:

unhcr-server-1 → Server 1 editor

unhcr-server-2 → Server 2 editor

---

# 7. Shared Current State

If an editor requires a shared workspace/current template:

Use a dedicated server/document namespace.

Never use a private History record as the default current workspace.

Private History and shared current workspace are separate concepts.

---

# 8. Database

Supabase is the backend.

Use:
- Auth
- Postgres
- RLS
- Secure RPC where appropriate
- Storage where required

Database changes must be backward-compatible unless explicitly approved.

Never tell the developer to recreate existing columns/functions if they already exist.

---

# 9. Authorization

Authorization flow:

User
→ Authentication
→ Permission check
→ Server-side authorization
→ RLS
→ Data access

Never rely only on frontend guards.

---

# 10. PDF Architecture

PDF editor coordinates must be represented in PDF/document space rather than screen pixels.

Zoom must affect rendering only.

Export must preserve:
- Position
- Rotation
- Font
- Size
- Color
- Page dimensions

---

# 11. Rendering

Editor preview and export should use consistent:
- Font
- Position
- Scale
- Color
- Rotation

Fonts must be loaded before rendering/export when required.

---

# 12. API Security

Protected APIs must:
- Verify authentication
- Verify authorization
- Validate ownership
- Validate input
- Apply rate limits where appropriate
- Never expose privileged credentials

GET/POST behavior must follow the API contract.

---

# 13. Deployment

Production deployment uses the existing Vercel/Next.js setup.

Do not introduce a new deployment architecture without explicit approval.

---

# 14. Bug Hunter

Admin-only error console at `/studio/bug-hunter`.

- Clients report sanitized payloads to `POST /api/bug-hunter/ingest`.
- Server re-validates, redacts secrets, and upserts via `ingest_bug_report` RPC.
- Identical errors share a fingerprint and increment `occurrence_count`.
- Resolved fingerprints stay historical until the same error recurs, then reopen as `new`. Ignored fingerprints stay ignored.
- Dashboard open/severity counters and "Most frequent" only include `new` and `investigating` rows. Resolved/ignored rows remain for audit.
- Ingest and Bug Hunter monitoring requests are not captured as application errors.
- `bug_reports` is readable only by `is_admin()`; clients cannot insert fake rows.
- Stack traces never render for non-admin users.

---

# 15. Testing

Relevant tests should exist for:
- Typecheck
- Lint
- Build
- Publish
- PDF editor
- Support
- Bug Hunter
- Rendering
- History
- Editor-specific workflows

When modifying one editor, run its relevant regression tests.
