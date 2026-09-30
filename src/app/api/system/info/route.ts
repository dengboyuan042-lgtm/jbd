import { capabilities } from '@/lib/env';
import { route } from '@/server/http';
import { ai } from '@/services/ai';
import { supportedExtensions } from '@/services/knowledge/parsers';
import { speechInfo } from '@/services/speech';

/** What the deployment can actually do right now — the UI reads this instead
 *  of assuming every integration is live. */
export async function GET() {
  return route(async () => ({
    capabilities: capabilities(),
    ai: ai.info(),
    speech: speechInfo(),
    upload: { extensions: supportedExtensions(), maxBytes: 100 * 1024 * 1024 },
  }));
}
