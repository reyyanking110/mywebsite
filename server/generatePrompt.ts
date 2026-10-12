import { buildFallbackPrompt, MAX_IDEA_LENGTH, type PromptResponse } from '../src/lib/promptBuilder.ts';

export class IdeaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdeaValidationError';
  }
}

export function validateIdea(value: unknown): string {
  if (typeof value !== 'string') {
    throw new IdeaValidationError('Meherbani karke apna video idea likhein ya bol kar batayein.');
  }

  const idea = value.trim();
  if (!idea) {
    throw new IdeaValidationError('Meherbani karke apna video idea likhein ya bol kar batayein.');
  }
  if (idea.length > MAX_IDEA_LENGTH) {
    throw new IdeaValidationError(`Idea ${MAX_IDEA_LENGTH} haroof se chhota rakhein.`);
  }
  return idea;
}

const SYSTEM_PROMPT = `You are an expert prompt writer for Google Flow video generation. Turn the user's idea into exactly ONE detailed, coherent, ready-to-paste video prompt written in professional English. Return only the prompt, with no title, preamble, analysis, or explanation. Keep every user-provided fact and requested action faithful; do not invent personal information, company details, factual claims, or exact dialogue. If the user explicitly supplies dialogue, preserve it accurately and request that it be spoken in the user's requested language. If the idea requests speech but gives a clear subject without exact wording, describe a concise, natural, general delivery and prohibit invented facts. If no dialogue is requested, do not add narration. For any user-selected avatar, preserve the reference person's identity, face, skin tone, apparent age, hairstyle, and recognizable traits; do not substitute another person. Include useful scene, behavior, framing, camera movement, lighting, color, atmosphere, sound, natural motion, continuity, and relevant negative constraints. Mention duration or aspect ratio only when the user explicitly requests them. Avoid contradictions, generic filler, and instructions to generate multiple videos.`;

function stripCodeFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:english|text|prompt)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();
}

/**
 * Server-only generation. The API key is read exclusively from the server
 * environment; with no key, the same useful template builder works offline.
 */
export async function generatePrompt(ideaValue: unknown): Promise<PromptResponse> {
  const idea = validateIdea(ideaValue);
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return {
      prompt: buildFallbackPrompt(idea),
      mode: 'template',
      notice: 'Server par AI key set nahi; built-in smart template se prompt bana hai.',
    };
  }

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.55,
        max_tokens: 1100,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Write one English video prompt from this idea. The idea may be in Urdu, Roman Urdu, Hindi, or Hinglish.\n\n${idea}` },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`AI provider returned ${response.status}: ${details.slice(0, 300)}`);
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const prompt = stripCodeFence(payload.choices?.[0]?.message?.content ?? '');
    if (!prompt) throw new Error('AI provider returned an empty prompt.');

    return { prompt, mode: 'ai' };
  } catch (error) {
    console.error('AI prompt generation failed; using the built-in template instead.', error);
    return {
      prompt: buildFallbackPrompt(idea),
      mode: 'template',
      notice: 'AI service se rabta nahi ho saka; smart template se prompt bana hai.',
    };
  }
}
