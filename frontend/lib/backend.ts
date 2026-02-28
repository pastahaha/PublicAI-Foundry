/**
 * Returns the base URL for the Python FastAPI backend.
 *
 * INTERNAL_BACKEND_URL is used in Docker (http://backend:8082) and is only
 * accessible from Next.js server-side API routes — never from the browser.
 *
 * NEXT_PUBLIC_BACKEND_URL is the public URL used by the browser for health
 * checks (e.g. http://localhost:8082).
 */
export function getBackendUrl(): string {
  return (
    process.env.INTERNAL_BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://localhost:8082"
  );
}
