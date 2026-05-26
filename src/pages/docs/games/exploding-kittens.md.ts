import content from '../../../../docs/games/exploding-kittens.md?raw';

export function GET() {
  return new Response(content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Robots-Tag': 'noindex',
    },
  });
}
