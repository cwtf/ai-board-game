import { absoluteSiteUrl, siteUrl } from '@/lib/site';
import { publicSeoRoutes } from '@/lib/seo';

const routePriority = new Map([
  ['/', '1.0'],
  ['/about', '0.6'],
]);

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function GET() {
  const urls = publicSeoRoutes
    .map((route) => {
      const location = escapeXml(absoluteSiteUrl(route.path, siteUrl()));
      const priority =
        routePriority.get(route.path) ?? (route.path === '/' ? '1.0' : '0.8');

      return [
        '  <url>',
        `    <loc>${location}</loc>`,
        '    <changefreq>weekly</changefreq>',
        `    <priority>${priority}</priority>`,
        '  </url>',
      ].join('\n');
    })
    .join('\n');

  return new Response(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urls,
      '</urlset>',
      '',
    ].join('\n'),
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    },
  );
}
