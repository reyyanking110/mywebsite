import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  AudioLines,
  BookOpen,
  Building2,
  Camera,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Copy,
  Film,
  Lightbulb,
  LoaderCircle,
  MapPin,
  Mic,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import {
  buildFallbackPrompt,
  getClarificationQuestion,
  MAX_IDEA_LENGTH,
  type PromptResponse,
} from './lib/promptBuilder';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly 0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorLike {
  readonly error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

type SpeechState = 'ready' | 'listening' | 'processing' | 'error';

type ExampleIdea = {
  text: string;
  icon: LucideIcon;
};

const examples: ExampleIdea[] = [
  { text: 'Mera avatar premium office mein baith kar mere business ka introduction de.', icon: Building2 },
  { text: 'Mera avatar ek professional suit mein camera ki taraf dekh kar baat kare.', icon: Camera },
  { text: 'Mera avatar ek cinematic documentary mein kisi topic ko explain kare.', icon: Film },
  { text: 'Mera avatar ek modern studio mein educational video banaye.', icon: BookOpen },
  { text: 'Mera avatar kisi scenic location par travel vlog banaye.', icon: MapPin },
];

const speechLanguages = [
  { value: 'ur-PK', label: 'Urdu (Pakistan)' },
  { value: 'hi-IN', label: 'Hindi (India)' },
  { value: 'en-IN', label: 'Roman Urdu / Hinglish — Angrezi pehchan' },
];

function getSpeechRecognitionConstructor() {
  if (typeof window === 'undefined') return undefined;
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function combineTranscript(base: string, transcript: string) {
  const cleanTranscript = transcript.trim();
  const cleanBase = base.trim();
  if (!cleanTranscript) return cleanBase;
  return cleanBase ? `${cleanBase} ${cleanTranscript}` : cleanTranscript;
}

function speechErrorCopy(code: string) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone ki ijazat nahi mili. Browser settings mein microphone allow karein, ya neeche apna idea likhein.';
    case 'audio-capture':
      return 'Microphone nahi mil raha. Apna microphone check karein, ya neeche idea likh dein.';
    case 'no-speech':
      return 'Awaaz samajh nahi aayi. Microphone ke qareeb bol kar dobara koshish karein.';
    case 'network':
      return 'Speech pehchanne ki service se rabta nahi ho saka. Internet check karein, ya idea likh dein.';
    case 'language-not-supported':
      return 'Chuni hui zubaan is browser mein supported nahi. Doosri zubaan chunain, ya idea likh dein.';
    case 'aborted':
      return 'Recording ruk gayi. Jab chahein dobara bol sakte hain.';
    default:
      return 'Awaaz pehchani nahi ja saki. Dobara koshish karein, ya idea neeche likh dein.';
  }
}

function App() {
  const [idea, setIdea] = useState('');
  const [speechLanguage, setSpeechLanguage] = useState('ur-PK');
  const [speechState, setSpeechState] = useState<SpeechState>('ready');
  const [speechMessage, setSpeechMessage] = useState('');
  const [supported, setSupported] = useState(false);
  const [inputError, setInputError] = useState('');
  const [clarification, setClarification] = useState<{ question: string; original: string; answer: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [generationMode, setGenerationMode] = useState<PromptResponse['mode']>('template');
  const [generationNotice, setGenerationNotice] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechErrorRef = useRef(false);
  const transcriptBaseRef = useRef('');
  const ideaTextareaRef = useRef<HTMLTextAreaElement>(null);
  const clarificationInputRef = useRef<HTMLInputElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const resultCardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionConstructor()));
    return () => recognitionRef.current?.abort();
  }, []);

  useEffect(() => {
    if (clarification) {
      window.requestAnimationFrame(() => clarificationInputRef.current?.focus());
    }
  }, [clarification?.question]);

  function setIdeaText(value: string) {
    setIdea(value);
    setInputError('');
    setSpeechMessage('');
    if (speechState === 'error') setSpeechState('ready');
    setCopyMessage('');
    setIsCopied(false);
    setGeneratedPrompt('');
    setGenerationNotice('');
    if (clarification) setClarification(null);
  }

  function startRecording() {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setSpeechState('error');
      setSpeechMessage('Is browser mein awaaz se likhne ki sahulat nahi. Neeche idea likh dein—prompt phir bhi ban jayega.');
      ideaTextareaRef.current?.focus();
      return;
    }

    try {
      const recognition = new Recognition();
      recognition.lang = speechLanguage;
      recognition.continuous = false;
      recognition.interimResults = true;
      transcriptBaseRef.current = idea;
      setGeneratedPrompt('');
      setGenerationNotice('');
      speechErrorRef.current = false;
      setSpeechMessage('');
      setSpeechState('ready');

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0]?.transcript ?? '')
          .join(' ')
          .trim();
        if (transcript) {
          setIdea(combineTranscript(transcriptBaseRef.current, transcript));
          setInputError('');
          setSpeechState('processing');
          setSpeechMessage('Alfaaz likhe ja rahe hain…');
        }
      };
      recognition.onerror = (event) => {
        speechErrorRef.current = true;
        setSpeechState('error');
        setSpeechMessage(speechErrorCopy(event.error));
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        if (!speechErrorRef.current) {
          setSpeechState('ready');
          setSpeechMessage((previous) => {
            if (previous === 'Alfaaz likhe ja rahe hain…') return 'Aapka idea neeche likh diya hai. Aap ise badal bhi sakte hain.';
            if (previous === 'Recording roki ja rahi hai…') return 'Recording ruk gayi. Aap apna idea edit kar sakte hain.';
            if (previous.startsWith('Sun raha hoon')) return 'Koi matn nahi mila. Dobara bol kar koshish karein.';
            return previous;
          });
        }
      };
      recognitionRef.current = recognition;
      recognition.start();
      setSpeechState('listening');
      setSpeechMessage('Sun raha hoon… Aaram se apna idea batayein.');
    } catch {
      recognitionRef.current = null;
      setSpeechState('error');
      setSpeechMessage('Microphone shuru nahi ho saka. Browser mein microphone ki ijazat check karein, ya idea neeche likhein.');
    }
  }

  function stopRecording() {
    if (!recognitionRef.current) return;
    setSpeechState('processing');
    setSpeechMessage('Recording roki ja rahi hai…');
    recognitionRef.current.stop();
  }

  async function requestPrompt(text: string) {
    setIsGenerating(true);
    setInputError('');
    setGeneratedPrompt('');
    setGenerationNotice('');
    setCopyMessage('');
    setIsCopied(false);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: text }),
      });

      const payload = await response.json().catch(() => null) as (PromptResponse & { error?: string }) | null;
      if (!response.ok) {
        if (response.status >= 500 || response.status === 404) {
          throw new Error('local-fallback');
        }
        setInputError(payload?.error || 'Idea qabool nahi hua. Dobara check karein.');
        return;
      }
      if (!payload || typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
        throw new Error('local-fallback');
      }

      setGeneratedPrompt(payload.prompt.trim());
      setGenerationMode(payload.mode === 'ai' ? 'ai' : 'template');
      setGenerationNotice(payload.notice || (payload.mode === 'ai'
        ? 'AI ne aapke idea se prompt tayyar kiya hai.'
        : 'Built-in smart template se prompt tayyar hua hai.'));
      window.setTimeout(() => resultCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch {
      setGeneratedPrompt(buildFallbackPrompt(text));
      setGenerationMode('template');
      setGenerationNotice('Server se rabta nahi ho saka; browser ke smart template se prompt bana hai.');
      window.setTimeout(() => resultCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerate(value = idea, skipClarification = false) {
    const cleanIdea = value.trim();
    if (!cleanIdea) {
      setInputError('Meherbani karke pehle apna idea bol kar batayein ya neeche likhein.');
      ideaTextareaRef.current?.focus();
      return;
    }
    if (cleanIdea.length > MAX_IDEA_LENGTH) {
      setInputError(`Idea ${MAX_IDEA_LENGTH} haroof se chhota rakhein.`);
      ideaTextareaRef.current?.focus();
      return;
    }

    if (!skipClarification) {
      const question = getClarificationQuestion(cleanIdea);
      if (question) {
        setClarification({ question, original: cleanIdea, answer: '' });
        setInputError('');
        return;
      }
    }

    setClarification(null);
    await requestPrompt(cleanIdea);
  }

  async function submitClarification() {
    if (!clarification) return;
    const answer = clarification.answer.trim();
    if (!answer) {
      setInputError('Meherbani karke mauzu ya zaroori tafseel likhein.');
      clarificationInputRef.current?.focus();
      return;
    }
    const expandedIdea = `${clarification.original.replace(/[.!?…]+$/u, '')}. The user clarified: ${answer}`;
    if (expandedIdea.length > MAX_IDEA_LENGTH) {
      setInputError(`Idea aur tafseel mila kar ${MAX_IDEA_LENGTH} haroof se chhote rakhein.`);
      clarificationInputRef.current?.focus();
      return;
    }
    setIdea(expandedIdea);
    setClarification(null);
    await handleGenerate(expandedIdea, true);
  }

  async function copyPrompt() {
    if (!generatedPrompt) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard available nahi.');
      await navigator.clipboard.writeText(generatedPrompt);
      setIsCopied(true);
      setCopyMessage('Prompt copy ho gaya!');
    } catch {
      const output = promptTextareaRef.current;
      output?.focus();
      output?.select();
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
      if (copied) {
        setIsCopied(true);
        setCopyMessage('Prompt copy ho gaya!');
      } else {
        setIsCopied(false);
        setCopyMessage('Prompt select hai. Ctrl+C dabayein; phone par matn daba kar “Copy” chunein.');
      }
    }
  }

  function editIdea() {
    setGeneratedPrompt('');
    setGenerationNotice('');
    setCopyMessage('');
    setIsCopied(false);
    setClarification(null);
    window.setTimeout(() => ideaTextareaRef.current?.focus(), 30);
  }

  function resetWorkflow() {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setIdea('');
    setSpeechState('ready');
    setSpeechMessage('');
    setInputError('');
    setClarification(null);
    setGeneratedPrompt('');
    setGenerationNotice('');
    setCopyMessage('');
    setIsCopied(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => ideaTextareaRef.current?.focus(), 80);
  }

  const listening = speechState === 'listening';
  const processingSpeech = speechState === 'processing';
  const statusText = listening
    ? 'Sun raha hoon…'
    : processingSpeech
      ? 'Alfaaz likhe ja rahe hain…'
      : speechState === 'error'
        ? 'Awaaz nahi samajh aayi'
        : 'Bolne ke liye tayyar';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#idea-input">Seedha idea likhne par jayein</a>

      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#top" aria-label="Flow Prompt Assistant — shuru par jayein">
            <span className="brand-mark" aria-hidden="true"><WandSparkles size={21} strokeWidth={2.1} /></span>
            <span className="brand-name">Flow Prompt <span>Assistant</span></span>
          </a>
          <div className="header-trust"><span className="trust-dot" /> Asaan tareeqa, tayyar prompt</div>
        </div>
      </header>

      <main id="top" className="page-main">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-kicker"><span className="kicker-sparkle"><Sparkles size={14} /></span> Google Flow ke liye, asaan andaaz mein</div>
          <h1 id="page-title">Aapka khayal,<br className="mobile-break" /> tayyar video prompt</h1>
          <p className="hero-subtitle">Bas apna idea boliye, ready prompt paiye.</p>
          <div className="steps-line" aria-label="Teen asaan qadam">
            <span><i>1</i> Idea batayein</span><b aria-hidden="true">—</b><span><i>2</i> Prompt banayein</span><b aria-hidden="true">—</b><span><i>3</i> Copy karein</span>
          </div>
        </section>

        <div className="workspace">
          <section className="idea-card" aria-labelledby="idea-heading">
            <div className="card-topline">
              <div className="section-index">01</div>
              <div className="card-heading-copy">
                <p className="eyebrow">Pehla qadam</p>
                <h2 id="idea-heading">Apna video idea batayein</h2>
                <p className="section-subtitle">Bol kar batayein ya apne alfaaz mein likhein.</p>
              </div>
              <span className="private-pill"><ShieldCheck size={15} /> App awaaz save nahi karti</span>
            </div>

            <div className={`voice-panel${listening ? ' is-listening' : ''}`}>
              <div className="voice-panel-copy">
                <span className="voice-overline">Aapki awaaz, aapki zubaan</span>
                <h3>Shuru karne ke liye boliye</h3>
                <p>Ek jumla bhi kaafi hai. Idea baad mein badla ja sakta hai.</p>
                <div className="voice-buttons">
                  <button
                    className={`mic-button${listening ? ' mic-button-live' : ''}`}
                    type="button"
                    onClick={startRecording}
                    disabled={listening || processingSpeech || isGenerating}
                    aria-label="Bol Kar Batayein"
                    aria-describedby="speech-status"
                  >
                    <span className="mic-button-icon"><Mic size={21} strokeWidth={2.2} /></span>
                    <span>Bol Kar Batayein</span>
                  </button>
                  {listening && (
                    <button className="stop-button" type="button" onClick={stopRecording}>
                      <Square size={14} fill="currentColor" /> Sunna Band Karein
                    </button>
                  )}
                </div>
              </div>
              <div className="voice-art" aria-hidden="true">
                <div className={`voice-art-orbit${listening ? ' orbit-active' : ''}`} />
                <div className="voice-art-core"><AudioLines size={31} strokeWidth={1.8} /></div>
                <span className="voice-art-dot dot-one" /><span className="voice-art-dot dot-two" /><span className="voice-art-dot dot-three" />
              </div>
              <div className="voice-status" id="speech-status" role="status" aria-live="polite">
                <span className={`status-light status-${speechState}`} />
                <span>{speechMessage || statusText}</span>
              </div>
            </div>

            <div className="language-row">
              <div className="language-label-wrap">
                <label htmlFor="speech-language">Bolne ki zubaan</label>
                <span className="field-hint">Awaaz pehchan browser ke mutabiq farq ho sakti hai.</span>
              </div>
              <div className="select-wrap">
                <select
                  id="speech-language"
                  value={speechLanguage}
                  onChange={(event) => setSpeechLanguage(event.target.value)}
                  disabled={listening || processingSpeech || isGenerating}
                >
                  {speechLanguages.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
                </select>
                <ChevronDown size={16} aria-hidden="true" />
              </div>
            </div>

            {!supported && (
              <div className="notice notice-info" role="note">
                <CircleAlert size={18} />
                <p>Is browser mein awaaz se likhne ki sahulat nahi. Neeche idea likh dein—prompt phir bhi ban jayega.</p>
              </div>
            )}

            {speechState === 'error' && speechMessage && supported && (
              <div className="notice notice-warning" role="alert">
                <CircleAlert size={18} />
                <p>{speechMessage}</p>
              </div>
            )}

            <div className="input-divider"><span>ya phir likhein</span></div>

            <div className="idea-input-wrap">
              <label className="input-label" htmlFor="idea-input">Ya Apna Idea Yahan Likhein</label>
              <textarea
                ref={ideaTextareaRef}
                id="idea-input"
                className={`idea-textarea${inputError ? ' has-error' : ''}`}
                value={idea}
                onChange={(event) => setIdeaText(event.target.value)}
                placeholder="Misal: Mera avatar apne business ka taaruf ek modern office mein de…"
                rows={4}
                maxLength={MAX_IDEA_LENGTH}
                disabled={isGenerating || listening || processingSpeech}
                aria-invalid={Boolean(inputError)}
                aria-describedby={inputError ? 'idea-error idea-count' : 'idea-count'}
              />
              <div className="input-meta">
                {inputError ? <span className="input-error" id="idea-error" role="alert">{inputError}</span> : <span className="input-helper">Urdu, Roman Urdu, Hindi ya Hinglish mein likh sakte hain.</span>}
                <span className="character-count" id="idea-count">{idea.length}/{MAX_IDEA_LENGTH}</span>
              </div>
            </div>

            <div className="examples-section">
              <div className="examples-heading">
                <div><Lightbulb size={16} /><span>Idea chunne mein madad chahiye?</span></div>
                <span>Misal par tap karein</span>
              </div>
              <div className="example-list">
                {examples.map(({ text, icon: Icon }) => (
                  <button
                    key={text}
                    className={`example-chip${idea === text ? ' example-chip-selected' : ''}`}
                    type="button"
                    disabled={isGenerating || listening || processingSpeech}
                    onClick={() => {
                      setIdeaText(text);
                      ideaTextareaRef.current?.focus();
                    }}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{text}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="generate-area">
              <button
                className="generate-button"
                type="button"
                onClick={() => void handleGenerate()}
                disabled={isGenerating || listening || processingSpeech}
              >
                {isGenerating ? <LoaderCircle size={19} className="spin" /> : <Sparkles size={19} />}
                <span>{isGenerating ? 'Prompt tayyar ho raha hai…' : 'Mera Prompt Banao'}</span>
                {!isGenerating && <span className="button-arrow" aria-hidden="true">→</span>}
              </button>
              <p className="generate-hint">Aapka idea sirf prompt banane ke liye process hota hai.</p>
            </div>
          </section>

          {clarification && (
            <section className="clarification-card" aria-labelledby="clarification-heading">
              <div className="clarification-icon"><CircleHelp size={21} /></div>
              <div className="clarification-content">
                <p className="eyebrow">Bas ek chhoti si baat</p>
                <h2 id="clarification-heading">{clarification.question}</h2>
                <label htmlFor="clarification-input">Mauzu ya tafseel</label>
                <div className="clarification-control">
                  <input
                    ref={clarificationInputRef}
                    id="clarification-input"
                    value={clarification.answer}
                    onChange={(event) => {
                      setClarification({ ...clarification, answer: event.target.value });
                      setInputError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void submitClarification();
                      }
                    }}
                    placeholder="Misal: mere business ka taaruf"
                    maxLength={400}
                    aria-describedby={inputError ? 'clarification-error' : undefined}
                  />
                  <button type="button" onClick={() => void submitClarification()} disabled={isGenerating}>
                    Aage Barhein <span aria-hidden="true">→</span>
                  </button>
                </div>
                {inputError && <p className="clarification-error" id="clarification-error" role="alert">{inputError}</p>}
                <button className="clarification-cancel" type="button" onClick={() => {
                  setClarification(null);
                  setInputError('');
                  ideaTextareaRef.current?.focus();
                }}>
                  <ArrowLeft size={14} /> Idea par wapas jayein
                </button>
              </div>
            </section>
          )}

          {isGenerating && (
            <div className="loading-card" role="status" aria-live="polite">
              <span className="loading-orb"><Sparkles size={19} /></span>
              <div><strong>Aapka prompt ban raha hai</strong><span>Thora sa intezar karein…</span></div>
              <LoaderCircle className="spin loading-spinner" size={20} />
            </div>
          )}

          {generatedPrompt && !isGenerating && (
            <section className="result-card" ref={resultCardRef} aria-labelledby="result-heading">
              <div className="result-top">
                <div className="result-title-wrap">
                  <span className="result-check"><CircleCheck size={21} /></span>
                  <div>
                    <p className="eyebrow">Teesra qadam</p>
                    <h2 id="result-heading">Aapka Ready Video Prompt</h2>
                  </div>
                </div>
                <span className={`mode-badge${generationMode === 'ai' ? ' mode-ai' : ''}`}>
                  <Sparkles size={13} /> {generationMode === 'ai' ? 'AI se tayyar' : 'Smart template se tayyar'}
                </span>
              </div>
              {generationNotice && <p className="generation-notice"><CircleAlert size={15} /> {generationNotice}</p>}
              <div className="prompt-output-wrap">
                <label className="sr-only" htmlFor="prompt-output">English video prompt</label>
                <textarea
                  ref={promptTextareaRef}
                  id="prompt-output"
                  className="prompt-output"
                  value={generatedPrompt}
                  readOnly
                  rows={Math.min(18, Math.max(11, generatedPrompt.split('\n').length + 5))}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <span className="english-tag">English prompt</span>
              </div>
              <div className="copy-row">
                <button className={`copy-button${isCopied ? ' copy-button-done' : ''}`} type="button" onClick={() => void copyPrompt()}>
                  {isCopied ? <Check size={18} /> : <Copy size={18} />}
                  {isCopied ? 'Dobara Copy Karein' : 'Copy Prompt'}
                </button>
                <span className={`copy-message${copyMessage && !isCopied ? ' copy-message-manual' : ''}`} role="status" aria-live="polite">
                  {copyMessage && <>{isCopied ? <Check size={15} /> : <CircleAlert size={15} />} {copyMessage}</>}
                </span>
              </div>
              <div className="result-divider" />
              <div className="result-actions">
                <button className="secondary-button" type="button" onClick={editIdea}>
                  <ArrowLeft size={16} /> Idea Badlein
                </button>
                <button className="text-button" type="button" onClick={resetWorkflow}>
                  <RotateCcw size={15} /> Naya Prompt Banayein
                </button>
              </div>
            </section>
          )}

          <aside className="flow-note" aria-label="Google Flow ke liye zaroori note">
            <div className="flow-note-icon"><WandSparkles size={18} /></div>
            <p><strong>Yaad rahe:</strong> Yeh prompt Google Flow mein paste karein. Apna avatar Flow mein alag se select karein.</p>
          </aside>

          <div className="privacy-note"><ShieldCheck size={15} /><span>App awaaz record ya save nahi karti. Browser speech service ka tareeqa alag ho sakta hai; AI mode mein likha hua idea AI service ko bheja jata hai.</span></div>
        </div>
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <span>Flow Prompt Assistant</span>
          <span>Sirf prompt tayyar karta hai — video Google Flow mein banayein.</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
