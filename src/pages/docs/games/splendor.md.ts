import content from '../../../../docs/games/splendor.md?raw';

export function GET() {
  return new Response(content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}
