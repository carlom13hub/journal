import type { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const BASE_SYSTEM_PROMPT = `You are a grounded gratitude and reflection prompt designer. When asked, provide a single short, thoughtful prompt for journaling — this could be about gratitude, processing feelings, or just noticing something real.

Rules:
- One or two sentences only
- Grounded and real, never cheesy or forced
- Vary the focus: relationships, senses, small moments, challenges overcome, everyday things, nature, skills, safety, growth, letting go, what you're learning
- Never use phrases like "What are you thankful for" or generic gratitude language
- Make it specific enough to spark a real thought
- Acknowledge that life can be hard — prompts should work on tough days too
- If someone needs to vent or dump, that's valid — prompts can invite honest processing, not just positivity`;

export async function chatHandler(req: Request, res: Response) {
  const { messages, apiKey, profileContext } = req.body;

  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(400).json({ error: 'API key required. Add your Anthropic API key in Settings.' });
    return;
  }

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'Messages array required' });
    return;
  }

  // Build system prompt with profile context if available
  let systemPrompt = BASE_SYSTEM_PROMPT;
  if (profileContext) {
    const parts: string[] = [];
    if (profileContext.aboutMe) parts.push(`About this person: ${profileContext.aboutMe}`);
    if (profileContext.currentSeason) parts.push(`What's happening in their life right now: ${profileContext.currentSeason}`);
    if (profileContext.preferences) parts.push(`What resonates with them: ${profileContext.preferences}`);
    if (profileContext.avoidances) parts.push(`What to avoid (feels fake/cheesy to them): ${profileContext.avoidances}`);
    if (parts.length > 0) {
      systemPrompt += `\n\nContext about this specific person — tailor your prompt to fit them:\n${parts.join('\n')}`;
    }
  }

  try {
    const client = new Anthropic({ apiKey: key });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else {
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
  }
}
