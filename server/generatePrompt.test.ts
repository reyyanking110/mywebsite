import { afterEach, describe, expect, it, vi } from 'vitest';
import { generatePrompt, IdeaValidationError, validateIdea } from './generatePrompt.ts';

afterEach(() => vi.unstubAllEnvs());

describe('server prompt endpoint helpers', () => {
  it('trims valid input and rejects empty or oversized ideas', () => {
    expect(validateIdea('  My avatar walks in a garden.  ')).toBe('My avatar walks in a garden.');
    expect(() => validateIdea('  ')).toThrow(IdeaValidationError);
    expect(() => validateIdea('x'.repeat(1601))).toThrow(/1600/u);
    expect(() => validateIdea(undefined)).toThrow(/video idea/u);
  });

  it('uses the deterministic template when no AI key is configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const response = await generatePrompt('Mera avatar premium office mein baith kar mere business ka introduction de.');
    expect(response.mode).toBe('template');
    expect(response.notice).toMatch(/AI key set nahi/u);
    expect(response.prompt).toContain('premium, contemporary office');
    expect(response.prompt).toContain('Preserve their recognizable facial features');
  });
});
