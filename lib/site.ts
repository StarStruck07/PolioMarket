/**
 * Canonical site origin (no trailing slash). Set NEXT_PUBLIC_SITE_URL in Vercel
 * to your production domain (e.g. https://bosm-market.vercel.app) so OAuth always
 * returns to the clean domain instead of a deployment-specific *.vercel.app URL.
 * Falls back to the current origin (dev / when the env var is unset).
 */
export function getSiteURL(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}
