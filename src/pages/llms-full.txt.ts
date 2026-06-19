import { createFullLlmsText } from '@/lib/llms';
import { siteUrl } from '@/lib/site';

export function GET() {
  return new Response(createFullLlmsText(siteUrl()), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
