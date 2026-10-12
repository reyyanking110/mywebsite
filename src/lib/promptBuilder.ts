export const MAX_IDEA_LENGTH = 1600;

export type GenerationMode = 'ai' | 'template';

export interface PromptResponse {
  prompt: string;
  mode: GenerationMode;
  notice?: string;
}

const cleanText = (value: string) => value.replace(/\s+/gu, ' ').trim();

function normaliseForMatching(value: string) {
  return cleanText(value.normalize('NFKC').toLocaleLowerCase());
}

function hasAvatarReference(idea: string) {
  return /\bavatar\b|\bdigital (?:twin|clone|likeness)\b|\bmy likeness\b|\b(?:mera|meri|mere|apna|apni)\s+(?:digital\s+)?(?:avatar|chehra|roop)\b|\bmain khud\b|\bme as the subject\b|اوتار|اواتار|میرا چہرہ|میری تصویر/iu.test(idea);
}

function hasKnownTopic(idea: string) {
  return /\b(?:about\s+\S+|on\s+\S+|topic|mauzu|business|karobar|company|product|service|travel|history|science|health|fitness|cooking|food|technology|nature|story|kahani|message|welcome|introduction|taaruf|recipe|school|lesson|solar|climate|art|music|culture)\b|کے بارے میں|کے متعلق|موضوع|کاروبار|کمپنی|سفر|تاریخ|سائنس|صحت|کھانا|سبق|کہانی/iu.test(idea);
}

/**
 * Return one short Roman Urdu question only when the idea is too vague to build
 * a faithful prompt. The caller can merge the user's answer into the idea.
 */
export function getClarificationQuestion(idea: string): string | null {
  const text = normaliseForMatching(idea);
  if (!text) return null;

  const placeholderTopic = /\b(?:kisi|koi|any|some|a)\s+(?:topic|mauzu|subject)\b|کسی\s+(?:موضوع|بات)|کوئی\s+(?:موضوع|بات)/iu.test(text);
  const educationWithoutTopic = /\b(?:educational|education|taleemi|taaleemi|documentary|documentry|dastavezi)\b|تعلیمی|دستاویزی/iu.test(text)
    && !hasKnownTopic(text)
    && !placeholderTopic;

  if (placeholderTopic || educationWithoutTopic) {
    return 'Aapka avatar kis mauzu par baat ya wazahat kare? Sirf mauzu likh dein—misal: apne business ka taaruf.';
  }

  const asksToSpeak = /\b(?:baat\s+(?:kare|karay|karta|karti)|bol(?:e|ay|na|ta|ti)?|speak(?:s|ing)?|talk(?:s|ing)?|explain(?:s|ing)?|narrat(?:e|es|ing)|present(?:s|ing)?|taaruf\s+(?:de|karaye)|introduction\s+(?:de|give|deliver))\b|بات\s+کرے|بولے|سمجھائے/iu.test(text);
  if (asksToSpeak && !hasKnownTopic(text)) {
    return 'Aapka avatar kis mauzu par baat kare? Sirf mauzu bata dein; apne alfaaz dena zaroori nahi.';
  }

  const genericOnly = /^(?:video|ek video|a video|kuch|kuch acha|kuch achha|acha video|achha video|koi video|koi acha video|koi achha video|video banao|video bana do|video banayein|mera avatar|my avatar|avatar|business video|educational video|a documentary|documentary|travel vlog|office intro|اوتار|میرا اوتار|ویڈیو|ایک ویڈیو|کچھ اچھا|کوئی ویڈیو)$/iu.test(text);
  const wordCount = text.split(/\s+/u).filter(Boolean).length;
  if (genericOnly || wordCount < 3) {
    return 'Video mein kya dikhana hai aur aapka avatar kya kare? Thori si tafseel likh dein.';
  }

  return null;
}

function includesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function replacePhrases(text: string, phrases: Array<[RegExp, string]>) {
  return phrases.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}

const romanUrduPhraseMap: Array<[RegExp, string]> = [
  [/\b(?:mera|meri|mere)\s+(?:digital\s+)?avatar\b/giu, "the user's selected avatar"],
  [/\b(?:apna|apni)\s+avatar\b/giu, "the user's selected avatar"],
  [/\bpremium\s+(?:office|daftar)\s+mein\s+baith\s+kar\b/giu, 'seated in a premium office'],
  [/\b(?:mere|apne)\s+business\s+ka\s+(?:introduction|taaruf)\s+de\b/giu, "presenting an introduction to the user's business"],
  [/\b(?:camera|camra)\s+ki\s+taraf\s+dekh\s+kar\s+baat\s+kare\b/giu, 'speaking while looking directly into the camera'],
  [/\bprofessional\s+suit\s+mein\b/giu, 'wearing a professional suit'],
  [/\bcinematic\s+documentary\s+mein\b/giu, 'in a cinematic documentary'],
  [/\bkisi\s+topic\s+ko\s+explain\s+kare\b/giu, 'explaining the user-provided topic'],
  [/\bmodern\s+studio\s+mein\b/giu, 'in a modern studio'],
  [/\beducational\s+video\s+banaye\b/giu, 'creating an educational video'],
  [/\bscenic\s+location\s+par\b/giu, 'at a scenic location'],
  [/\btravel\s+vlog\s+banaye\b/giu, 'creating a travel vlog'],
  [/\bcamera\s+ki\s+taraf\b/giu, 'toward the camera'],
  [/\bcamera\s+ke\s+samne\b/giu, 'in front of the camera'],
  [/\bke\s+bare\s+mein\b|\bke\s+baare\s+mein\b/giu, 'about'],
  [/\bbaith\s+kar\b/giu, 'while seated'],
  [/\bkhara\s+ho\s+kar\b/giu, 'while standing'],
  [/\bmuskurate\s+huye\b/giu, 'smiling'],
  [/\bbaat\s+kare\b|\bbaat\s+karay\b/giu, 'speaks naturally'],
  [/\bsamjha(?:ye|ta)\b/giu, 'explains'],
  [/\bdikhaye\b/giu, 'shows'],
  [/\bchal(?:e|ta)\b/giu, 'walks'],
  [/\bbanaye\b|\bbana(?:yein|o|do)\b/giu, 'creates'],
  [/\bMera\s+avatar\b/giu, "the user's selected avatar"],
];

const romanUrduWordMap: Record<string, string> = {
  mera: 'the', meri: 'the', mere: 'the', apna: 'the', apni: 'the',
  avatar: 'avatar', ek: 'a', aik: 'a', premium: 'premium', office: 'office', daftar: 'office',
  mein: 'in', me: 'in', baith: 'seated', kar: 'while', business: 'business', karobar: 'business',
  company: 'company', ka: 'of', ki: 'the', ke: 'the', introduction: 'introduction', taaruf: 'introduction',
  de: 'present', deta: 'presents', deti: 'presents', professional: 'professional', suit: 'suit',
  camera: 'camera', camra: 'camera', taraf: 'toward', dekh: 'looking', baat: 'speaks', kare: 'speaks',
  karay: 'speaks', cinematic: 'cinematic', documentary: 'documentary', kisi: 'the specified', topic: 'topic',
  explain: 'explains', samjha: 'explains', modern: 'modern', studio: 'studio', educational: 'educational',
  video: 'video', banaye: 'creates', scenic: 'scenic', location: 'location', par: 'at', travel: 'travel',
  vlog: 'vlog', bare: 'about', baare: 'about', main: 'in', muskuraye: 'smiles',
  khush: 'happy', ahista: 'gently', pyar: 'warmly', doston: 'people', logon: 'people',
  saath: 'with', zindagi: 'life', shehar: 'city', bazaar: 'market', khoobsurat: 'beautiful',
  khubsurat: 'beautiful', subah: 'morning', shaam: 'evening', pareshan: 'concerned',
  purjosh: 'enthusiastic', pur: '', jo: '', aur: 'and', phir: 'then', bohat: 'very',
  acha: 'good', achha: 'good', naya: 'new', nayi: 'new', rang: 'color', dikhata: 'shows',
  dikhati: 'shows', batata: 'explains', batati: 'explains', karta: '', karti: '', ho: '',
  hai: '', hain: '', ko: '', se: '', bhi: '', mujhe: 'the user',
};

const urduPhraseMap: Array<[RegExp, string]> = [
  [/میرا\s+(?:اوتار|اواتار)\s+پریمیم\s+(?:آفس|دفتر)\s+میں\s+بیٹھ\s+کر\s+میرے\s+کاروبار\s+کا\s+تعارف\s+دے/gu, "the user's selected avatar sits in a premium office and introduces the user's business"],
  [/میرا\s+(?:اوتار|اواتار)\s+(?:ایک\s+)?پیشہ\s+ورانہ\s+سوٹ\s+میں\s+کیمرے\s+کی\s+طرف\s+دیکھ\s+کر\s+بات\s+کرے/gu, "the user's selected avatar wears a professional suit and speaks while looking directly into the camera"],
  [/میرا\s+(?:اوتار|اواتار)\s+(?:ایک\s+)?سنیماٹک\s+دستاویزی\s+فلم\s+میں\s+کسی\s+موضوع\s+کی\s+وضاحت\s+کرے/gu, "the user's selected avatar explains the user-provided topic in a cinematic documentary"],
  [/میرا\s+(?:اوتار|اواتار)\s+(?:ایک\s+)?جدید\s+اسٹوڈیو\s+میں\s+تعلیمی\s+ویڈیو\s+بنائے/gu, "the user's selected avatar creates an educational video in a modern studio"],
  [/میرا\s+(?:اوتار|اواتار)\s+کسی\s+خوبصورت\s+مقام\s+پر\s+ٹریول\s+ولاگ\s+بنائے/gu, "the user's selected avatar presents a travel vlog at a scenic location"],
  [/کے\s+بارے\s+میں/gu, 'about'],
  [/کیمرے\s+کی\s+طرف\s+دیکھ\s+کر/gu, 'looking directly into the camera'],
  [/بات\s+کرے/gu, 'speaks naturally'],
  [/وضاحت\s+کرے|سمجھائے/gu, 'explains'],
];

const urduWordMap: Record<string, string> = {
  'میرا': 'the', 'میری': 'the', 'میرے': 'the', 'اپنا': 'the', 'اوتار': 'avatar', 'اواتار': 'avatar',
  'ایک': 'a', 'پریمیم': 'premium', 'آفس': 'office', 'دفتر': 'office', 'میں': 'in', 'بیٹھ': 'seated',
  'کر': 'while', 'کاروبار': 'business', 'کمپنی': 'company', 'کا': 'of', 'تعارف': 'introduction',
  'دے': 'present', 'پیشہ': 'professional', 'ورانہ': 'professional', 'سوٹ': 'suit', 'کیمرے': 'camera',
  'کیمرہ': 'camera', 'کی': 'the', 'طرف': 'toward', 'دیکھ': 'looking', 'بات': 'speaks', 'کرے': 'speaks',
  'سنیماٹک': 'cinematic', 'دستاویزی': 'documentary', 'فلم': 'film', 'کسی': 'a', 'موضوع': 'topic',
  'وضاحت': 'explanation', 'جدید': 'modern', 'اسٹوڈیو': 'studio', 'سٹودیو': 'studio', 'تعلیمی': 'educational',
  'ویڈیو': 'video', 'بنائے': 'creates', 'خوبصورت': 'scenic', 'مقام': 'location', 'پر': 'at', 'ٹریول': 'travel',
  'سفر': 'travel', 'ولاگ': 'vlog', 'وی': '', 'لاگ': 'vlog', 'سمجھائے': 'explains', 'قدرتی': 'natural',
  'صبح': 'morning', 'شام': 'evening', 'شہر': 'city', 'منظر': 'scenery', 'اسکول': 'school', 'تعلیم': 'education',
  'سولر': 'solar', 'پینل': 'panel', 'توانائی': 'energy', 'موسمیاتی': 'climate', 'تبدیلی': 'change',
  'ماحولیاتی': 'environmental', 'ماحول': 'environment', 'آب': 'climate', 'ہوا': 'air', 'پانی': 'water',
  'ٹیکنالوجی': 'technology', 'مصنوعی': 'artificial', 'ذہانت': 'intelligence', 'صحت': 'health',
  'دل': 'heart', 'تاریخ': 'history', 'پاکستان': 'Pakistan', 'کرکٹ': 'cricket', 'فٹبال': 'football',
  'کھانا': 'food', 'کھانا پکانا': 'cooking', 'بچے': 'children', 'بچوں': 'children', 'کہانی': 'story',
  'کاروباری': 'business', 'خدمت': 'service', 'خدمات': 'services', 'مصنوعات': 'products', 'پروڈکٹ': 'product',
  'قیمت': 'price', 'منفعت': 'benefit', 'فائدہ': 'benefit', 'دوست': 'friend', 'خاندان': 'family',
};

function translateRomanUrdu(idea: string) {
  let translated = replacePhrases(idea, romanUrduPhraseMap);
  const hasRomanMarkers = /\b(?:mera|meri|mere|apna|apni|mein|baith|kar|kare|banaye|dikhaye|samjhaye|taaruf|mauzu|ke bare|ke baare)\b/iu.test(idea);
  if (!hasRomanMarkers) return cleanText(translated);

  translated = translated
    .split(/(\b[\p{L}\p{N}'-]+\b)/u)
    .map((token) => {
      const lower = token.toLocaleLowerCase();
      return romanUrduWordMap[lower] ?? token;
    })
    .join(' ')
    .replace(/\s+([.,!?;:])/gu, '$1')
    .replace(/\b(?:the\s+){2,}/giu, 'the ')
    .replace(/\b(?:in\s+){2,}/giu, 'in ')
    .replace(/\b(?:while\s+){2,}/giu, 'while ')
    .replace(/\s+/gu, ' ')
    .trim();
  return cleanText(translated);
}

function translateUrduScript(idea: string) {
  let translated = replacePhrases(idea, urduPhraseMap);
  translated = translated
    .split(/([\u0600-\u06FF]+)/u)
    .map((token) => urduWordMap[token] ?? token)
    .join(' ')
    .replace(/\s+([.,!?;:؛،۔])/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
  return cleanText(translated);
}

function translatedDirection(idea: string) {
  if (/[\u0600-\u06FF]/u.test(idea)) return translateUrduScript(idea);
  return translateRomanUrdu(idea);
}

function translatedClarificationDetail(value: string) {
  const detail = cleanText(value)
    .replace(/[.!?؟۔]+$/u, '')
    .replace(/\s+(?:ke\s+baare?\s+mein|کے\s+بارے\s+میں)$/iu, '')
    .replace(/^(?:about|on)\s+/iu, '')
    .trim();
  return translatedDirection(detail);
}

function requestedSpecs(idea: string) {
  const specs: string[] = [];
  const aspect = idea.match(/\b(?:aspect\s+ratio\s*)?(16\s*:\s*9|9\s*:\s*16|4\s*:\s*5|1\s*:\s*1)\b/iu)?.[1];
  if (aspect) specs.push(`Use the explicitly requested ${aspect.replace(/\s+/gu, '')} aspect ratio.`);

  const duration = idea.match(/\b(\d{1,3})\s*(?:-\s*)?(?:seconds?|secs?|s)\b/iu)?.[1];
  if (duration) specs.push(`Target the explicitly requested duration of ${duration} seconds.`);
  return specs;
}

function promptScene(idea: string, text: string, avatar: boolean) {
  const clarificationMatch = idea.match(/\bthe user clarified:\s*(.+)$/iu);
  const extraDirection = clarificationMatch?.[1] ? translatedClarificationDetail(clarificationMatch[1]) : '';
  const extraSentence = extraDirection ? ` Include this user-provided detail: “${extraDirection}”.` : '';
  const business = includesAny(text, [/\bbusiness\b/iu, /\bkarobar\b/iu, /کاروبار/u, /کمپنی/u]);
  const introduction = includesAny(text, [/\bintroduction\b/iu, /\bintroduc\w*\b/iu, /\btaaruf\b/iu, /تعارف/u]);
  const office = includesAny(text, [/\boffice\b/iu, /\bdaftar\b/iu, /دفتر/u, /آفس/u]);
  const suit = includesAny(text, [/\bsuit\b/iu, /لباس/u, /سوٹ/u]);
  const camera = includesAny(text, [/\bcamera\b/iu, /\bcamra\b/iu, /کیمر/u]);
  const documentary = includesAny(text, [/\bdocumentary\b/iu, /\bdastavezi\b/iu, /دستاویزی/u]);
  const studio = includesAny(text, [/\bstudio\b/iu, /اسٹوڈیو/u, /سٹودیو/u]);
  const educational = includesAny(text, [/\beducational\b/iu, /\beducation\b/iu, /\btaleemi\b/iu, /تعلیمی/u]);
  const scenic = includesAny(text, [/\bscenic\b/iu, /\blocation\b/iu, /\bmanzar\b/iu, /خوبصورت/u, /منظر/u, /مقام/u]);
  const travel = includesAny(text, [/\btravel\b/iu, /\bsafar\b/iu, /\bvlog\b/iu, /ٹریول/u, /سفر/u, /ولاگ/u]);
  const speaker = includesAny(text, [/\bspeak\w*\b/iu, /\btalk\w*\b/iu, /\bbaat\b/iu, /\bexplain\w*\b/iu, /\bsamjha\w*\b/iu, /\bnarrat\w*\b/iu, /\bpresent\w*\b/iu, /\btaaruf\b/iu, /بات/u, /بول/u, /سمجھ/u, /وضاحت/u]);

  if (business && introduction && office) {
    const subject = avatar ? 'The selected avatar' : 'The main subject';
    return { scene: `${subject} sits naturally in a premium, contemporary office and presents an introduction to the user's business.${extraSentence}`, type: 'business', speaker: true };
  }
  if (suit && camera && speaker) {
    const subject = avatar ? 'The selected avatar' : 'The main subject';
    return { scene: `${subject} wears a professional suit and speaks directly to the camera.${extraSentence}`, type: 'talking-head', speaker: true };
  }
  if (documentary) {
    const topic = extraDirection ? `the user-provided topic “${extraDirection}”` : 'the user-provided topic';
    return { scene: `Create a cinematic documentary-style scene in which ${avatar ? 'the selected avatar' : 'the main subject'} explains ${topic}.`, type: 'documentary', speaker: true };
  }
  if (studio && educational) {
    const subject = extraDirection ? `the user-provided subject “${extraDirection}”` : 'the user-provided subject';
    return { scene: `Place ${avatar ? 'the selected avatar' : 'the main subject'} in a modern studio for an educational video about ${subject}.`, type: 'studio', speaker: true };
  }
  if (travel && scenic) {
    return { scene: `Create a travel-vlog scene with ${avatar ? 'the selected avatar' : 'the main subject'} at a scenic location.`, type: 'travel', speaker };
  }

  const translated = translatedDirection(idea);
  const scene = /[\u0600-\u06FF]/u.test(translated)
    ? `Follow the user's original Urdu direction faithfully: “${cleanText(idea)}”. Preserve its requested scene, subject, action, and mood without adding details.`
    : `Follow this user-provided scene direction faithfully: “${translated}”.`;
  return { scene, type: documentary ? 'documentary' : travel ? 'travel' : 'general', speaker };
}

/** A deterministic, no-key prompt builder used locally and by the server. */
export function buildFallbackPrompt(idea: string): string {
  const cleanIdea = cleanText(idea);
  const lower = normaliseForMatching(cleanIdea);
  const avatar = hasAvatarReference(cleanIdea);
  const { scene, type, speaker } = promptScene(cleanIdea, lower, avatar);
  const avatarDirection = avatar
    ? 'Use the separately selected reference avatar as the same person throughout. Preserve their recognizable facial features, skin tone, apparent age, hairstyle, and other identity traits; do not replace or redesign them as a different person. Keep any user-requested clothing consistent.'
    : 'Keep the subject and appearance faithful to the user’s description; do not introduce an unrelated person or change the requested subject.';

  let performance: string;
  if (type === 'travel') {
    performance = 'Use relaxed, curious expressions and natural, purposeful movement as the subject presents the surroundings; keep gestures subtle and human.';
  } else if (type === 'talking-head' || type === 'business' || type === 'documentary' || type === 'studio') {
    performance = 'Use an upright but relaxed posture, attentive eye contact, small measured hand gestures, natural facial expressions, and unhurried human pacing.';
  } else {
    performance = 'Use natural posture, realistic movement, restrained gestures, and expressive but unexaggerated facial behavior that fits the requested action.';
  }

  let camera: string;
  if (type === 'travel') {
    camera = 'Frame the subject in a medium shot with a smooth, unhurried camera move that reveals the location while keeping the subject clearly recognizable.';
  } else if (type === 'documentary') {
    camera = 'Use composed documentary framing at eye level, with a restrained cinematic camera move and enough context to establish the scene.';
  } else if (type === 'business' || type === 'talking-head' || type === 'studio') {
    camera = 'Use an eye-level medium close-up, steady framing, and a very gentle push-in; keep the face sharp and comfortably centered.';
  } else {
    camera = 'Use a clear, eye-level medium shot with stable, restrained camera movement and an unobstructed view of the main action.';
  }

  const lighting = type === 'travel'
    ? 'Use natural, soft daylight with balanced highlights and authentic, gently warm color grading that preserves the real atmosphere of the location.'
    : type === 'documentary'
      ? 'Use cinematic, softly directional light, natural skin tones, controlled contrast, and subtle documentary-style color grading.'
      : 'Use soft, flattering, natural-looking key light with gentle fill, balanced contrast, and a clean, refined color grade.';

  const dialogue = speaker
    ? type === 'business'
      ? 'Deliver a concise, warm, conversational introduction to the business in the language of the user’s idea. Keep it general; do not invent a business name, products, services, achievements, or factual claims.'
      : type === 'documentary' || type === 'studio'
        ? 'Explain only the user-provided subject in the language of the user’s idea, with clear, natural pacing and accurate lip synchronization. Do not add unsupported facts or an unprovided script.'
        : 'Use clear, natural speech in the language of the user’s idea, with conversational pacing and accurate lip synchronization. Do not invent a topic, personal details, or factual claims that the user did not provide.'
    : 'Use only scene-appropriate ambient sound; do not add narration or dialogue that the user did not request.';
  const sound = speaker
    ? 'Add subtle, setting-appropriate ambience beneath clean, intelligible dialogue; keep music minimal and never let it mask the voice.'
    : 'Add restrained, realistic ambient sound that suits the setting without distracting from the action.';

  const specs = requestedSpecs(cleanIdea);
  const constraints = avatar
    ? 'Maintain consistent identity, facial proportions, wardrobe, and scene continuity. Keep anatomy, hands, eye movement, and motion realistic; avoid extra people, abrupt cuts, unrequested on-screen text, logos, and watermarks.'
    : 'Maintain consistent scene continuity and realistic anatomy and motion; avoid abrupt cuts, unrequested extra people, on-screen text, logos, and watermarks.';

  return [
    `Create one polished, coherent video based faithfully on the user's idea. ${scene}`,
    avatarDirection,
    performance,
    camera,
    lighting,
    dialogue,
    sound,
    constraints,
    ...specs,
  ].join('\n\n');
}
