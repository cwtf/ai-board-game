export const DEFAULT_SITE_URL = 'https://aiboard.games';

export function normalizeSiteUrl(value: string | undefined): string {
  const raw = (value ?? DEFAULT_SITE_URL).trim() || DEFAULT_SITE_URL;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  return new URL(withProtocol).origin;
}

export function siteUrl(): string {
  return normalizeSiteUrl(import.meta.env.PUBLIC_SITE_URL);
}

export function absoluteSiteUrl(path: string, base = siteUrl()): string {
  return new URL(path, base).toString();
}
