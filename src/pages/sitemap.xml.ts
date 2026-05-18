const siteUrl = import.meta.env.PUBLIC_SITE_URL ?? 'http://localhost:4321';
const routes = [
  '/',
  '/about',
  '/splendor',
  '/secret-hitler',
  '/exploding-kittens',
  '/docs/TODO.md',
  '/docs/games/splendor.md',
  '/docs/games/exploding-kittens.md',
];

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function GET() {
  const urls = routes
    .map((route) => {
      const location = escapeXml(new URL(route, siteUrl).toString());

      return [
        '  <url>',
        `    <loc>${location}</loc>`,
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
