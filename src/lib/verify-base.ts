/**
 * Canonical public verification portal base URL.
 *
 * The domain `dpdt-govbd-trademek-database.vercel.app` is now served by the
 * `dpdt-govbd-main` Vercel project. This constant is the single source of
 * truth for the default:
 *   - server routes (publish / preflight) override it with `PUBLIC_VERIFY_BASE_URL`
 *   - client code (History → View Live) overrides it with the build-time
 *     `NEXT_PUBLIC_VERIFY_BASE_URL` variable
 */
export const DEFAULT_VERIFY_BASE_URL =
  'https://dpdt-govbd-trademek-database.vercel.app';

/**
 * Client-safe base URL. Next.js inlines `process.env.NEXT_PUBLIC_*` at build
 * time; when unset it falls back to the canonical default, so View Live always
 * points at the verification portal.
 */
export const VERIFY_BASE_URL =
  process.env.NEXT_PUBLIC_VERIFY_BASE_URL || DEFAULT_VERIFY_BASE_URL;
