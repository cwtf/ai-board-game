const siteUrl = import.meta.env.PUBLIC_SITE_URL ?? 'http://localhost:4321';

export function GET() {
  const sitemapUrl = new URL('/sitemap.xml', siteUrl).toString();

  return new Response(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /settings',
      '',
      `Sitemap: ${sitemapUrl}`,
      '',
    ].join('\n'),
    {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    },
  );
}
