import { describe, expect, it } from 'vitest';
import { buildFallbackPrompt, getClarificationQuestion, MAX_IDEA_LENGTH } from './promptBuilder';

const examples = [
  {
    idea: 'Mera avatar premium office mein baith kar mere business ka introduction de.',
    expected: ['premium, contemporary office', 'introduction to the user\'s business', 'separately selected reference avatar'],
  },
  {
    idea: 'Mera avatar ek professional suit mein camera ki taraf dekh kar baat kare.',
    expected: ['professional suit', 'speaks directly to the camera', 'medium close-up'],
  },
  {
    idea: 'Mera avatar ek cinematic documentary mein kisi topic ko explain kare.',
    expected: ['cinematic documentary-style', 'explains the user-provided topic', 'documentary framing'],
  },
  {
    idea: 'Mera avatar ek modern studio mein educational video banaye.',
    expected: ['modern studio', 'educational video', 'natural-looking key light'],
  },
  {
    idea: 'Mera avatar kisi scenic location par travel vlog banaye.',
    expected: ['travel-vlog scene', 'scenic location', 'smooth, unhurried camera move'],
  },
];

describe('offline prompt builder', () => {
  it.each(examples)('builds one coherent English prompt for the sample idea: $idea', ({ idea, expected }) => {
    const prompt = buildFallbackPrompt(idea);
    for (const phrase of expected) expect(prompt).toContain(phrase);
    expect(prompt).toContain('Preserve their recognizable facial features, skin tone, apparent age, hairstyle');
    expect(prompt).toContain('Maintain consistent identity');
    expect(prompt).not.toMatch(/\b(?:15|30) seconds?\b|\b(?:16:9|9:16)\b/u);
  });

  it('preserves a topic supplied after a clarification in English or Urdu', () => {
    const romanUrduPrompt = buildFallbackPrompt('Mera avatar ek cinematic documentary mein kisi topic ko explain kare. The user clarified: climate change');
    const urduPrompt = buildFallbackPrompt('میرا اوتار ایک جدید اسٹوڈیو میں تعلیمی ویڈیو بنائے۔ The user clarified: موسمیاتی تبدیلی کے بارے میں');
    expect(romanUrduPrompt).toContain('explains the user-provided topic “climate change”');
    expect(urduPrompt).toContain('the user-provided subject “climate change”');
  });

  it('keeps explicit duration and aspect ratio only when asked for', () => {
    const prompt = buildFallbackPrompt('A cinematic video of my avatar describing a garden. 15 seconds, vertical 9:16.');
    expect(prompt).toContain('Target the explicitly requested duration of 15 seconds.');
    expect(prompt).toContain('Use the explicitly requested 9:16 aspect ratio.');
  });

  it('does not invent avatar identity when the idea has no avatar', () => {
    const prompt = buildFallbackPrompt('A quiet mountain lake at sunrise, with mist over the water.');
    expect(prompt).toContain('Keep the subject and appearance faithful to the user’s description');
    expect(prompt).not.toContain('separately selected reference avatar');
  });
});

describe('clarification checks', () => {
  it('leaves empty-input validation to the form', () => {
    expect(getClarificationQuestion('')).toBeNull();
  });

  it('asks for a topic when the user requests a generic explanation', () => {
    expect(getClarificationQuestion(examples[2].idea)).toMatch(/kis mauzu par/u);
    expect(getClarificationQuestion(examples[3].idea)).toMatch(/kis mauzu par/u);
  });

  it('asks for detail when an idea is only a placeholder', () => {
    expect(getClarificationQuestion('Kuch acha')).toMatch(/Video mein kya dikhana hai/u);
    expect(getClarificationQuestion('میرا اوتار ایک جدید اسٹوڈیو میں تعلیمی ویڈیو بنائے۔')).toMatch(/kis mauzu par/u);
  });

  it('does not ask an unnecessary question for a clear business introduction or travel idea', () => {
    expect(getClarificationQuestion(examples[0].idea)).toBeNull();
    expect(getClarificationQuestion(examples[4].idea)).toBeNull();
    expect(getClarificationQuestion('An avatar walks beside the sea and waves at the camera.')).toBeNull();
  });

  it('enforces the shared input limit', () => {
    expect(MAX_IDEA_LENGTH).toBe(1600);
  });
});
