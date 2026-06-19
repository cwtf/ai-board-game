import { absoluteSiteUrl, siteUrl } from '@/lib/site';

export function GET() {
  const sitemapUrl = absoluteSiteUrl('/sitemap.xml', siteUrl());

  return new Response(
    [
      'User-agent: *',
      'Allow: /',
      'Allow: /llms.txt',
      'Allow: /llms-full.txt',
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
