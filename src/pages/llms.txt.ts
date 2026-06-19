import { createLlmsText } from '@/lib/llms';
import { siteUrl } from '@/lib/site';

export function GET() {
  return new Response(createLlmsText(siteUrl()), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
