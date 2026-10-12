import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { buildFallbackPrompt } from './lib/promptBuilder';

const businessIdea = 'Mera avatar premium office mein baith kar mere business ka introduction de.';

function mockPromptResponse(prompt = 'Create a polished video with the selected avatar.') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ prompt, mode: 'template', notice: 'Smart template se tayyar.' }),
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockPromptResponse()));
  Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  Reflect.deleteProperty(window, 'SpeechRecognition');
  Reflect.deleteProperty(window, 'webkitSpeechRecognition');
  Reflect.deleteProperty(navigator, 'clipboard');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Flow Prompt Assistant workflow', () => {
  it('turns a selected example into one prompt and copies only that prompt', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: new RegExp(businessIdea.slice(0, 27)) }));
    expect(screen.getByLabelText('Ya Apna Idea Yahan Likhein')).toHaveValue(businessIdea);
    await user.click(screen.getByRole('button', { name: 'Mera Prompt Banao' }));

    expect(await screen.findByRole('heading', { name: 'Aapka Ready Video Prompt' })).toBeInTheDocument();
    expect(screen.getByLabelText('English video prompt')).toHaveValue('Create a polished video with the selected avatar.');
    expect(screen.getByText('Smart template se tayyar')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy Prompt' }));
    expect(writeText).toHaveBeenCalledExactlyOnceWith('Create a polished video with the selected avatar.');
    expect(await screen.findByText('Prompt copy ho gaya!')).toBeInTheDocument();
  });

  it('keeps the workflow reachable by keyboard from the skip link onward', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.tab();
    expect(screen.getByRole('link', { name: 'Seedha idea likhne par jayein' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: /Flow Prompt Assistant/u })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Bol Kar Batayein' })).toHaveFocus();
  });

  it('validates an empty idea before making an API request', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Mera Prompt Banao' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Meherbani karke pehle apna idea');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks one short clarification, then includes the answer in the generation request', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Ya Apna Idea Yahan Likhein'), 'Mera avatar baat kare.');
    await user.click(screen.getByRole('button', { name: 'Mera Prompt Banao' }));
    expect(await screen.findByText('Aapka avatar kis mauzu par baat kare? Sirf mauzu bata dein; apne alfaaz dena zaroori nahi.')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Mauzu ya tafseel'), 'solar panels');
    await user.click(screen.getByRole('button', { name: /Aage Barhein/u }));
    await screen.findByRole('heading', { name: 'Aapka Ready Video Prompt' });
    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(request?.body)).idea).toContain('The user clarified: solar panels');
  });

  it('lets a user edit the current idea or start over completely', async () => {
    const user = userEvent.setup();
    render(<App />);
    const ideaField = screen.getByLabelText('Ya Apna Idea Yahan Likhein');
    await user.type(ideaField, 'An avatar waves beside the sea at sunset.');
    await user.click(screen.getByRole('button', { name: 'Mera Prompt Banao' }));
    await screen.findByRole('heading', { name: 'Aapka Ready Video Prompt' });
    await user.click(screen.getByRole('button', { name: 'Idea Badlein' }));
    expect(screen.queryByRole('heading', { name: 'Aapka Ready Video Prompt' })).not.toBeInTheDocument();
    expect(ideaField).toHaveValue('An avatar waves beside the sea at sunset.');

    await user.click(screen.getByRole('button', { name: 'Mera Prompt Banao' }));
    await screen.findByRole('heading', { name: 'Aapka Ready Video Prompt' });
    await user.click(screen.getByRole('button', { name: 'Naya Prompt Banayein' }));
    expect(screen.queryByRole('heading', { name: 'Aapka Ready Video Prompt' })).not.toBeInTheDocument();
    expect(ideaField).toHaveValue('');
  });

  it('shows the unsupported-browser fallback and explains what to do', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText(/Is browser mein awaaz se likhne ki sahulat nahi/u)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bol Kar Batayein' }));
    expect(screen.getByRole('status')).toHaveTextContent('Neeche idea likh dein—prompt phir bhi ban jayega.');
    expect(screen.getByLabelText('Ya Apna Idea Yahan Likhein')).toHaveFocus();
  });

  it('reports microphone permission denial in Roman Urdu', async () => {
    class DeniedRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((event: never) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() { window.setTimeout(() => this.onerror?.({ error: 'not-allowed' }), 0); }
      stop() {}
      abort() {}
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: DeniedRecognition });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Bol Kar Batayein' }));
    expect(await screen.findAllByText(/Microphone ki ijazat nahi mili/u)).toHaveLength(2);
    expect(screen.getByLabelText('Ya Apna Idea Yahan Likhein')).toBeInTheDocument();
  });

  it('uses the chosen recognition language and leaves the transcript editable', async () => {
    let instance: {
      lang: string;
      onresult: ((event: { resultIndex: number; results: Array<{ 0: { transcript: string }; length: number; isFinal: boolean }> }) => void) | null;
      onend: (() => void) | null;
    } | undefined;
    class TranscriptRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((event: { resultIndex: number; results: Array<{ 0: { transcript: string }; length: number; isFinal: boolean }> }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      constructor() { instance = this; }
      start() {
        window.setTimeout(() => {
          this.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: 'Mera avatar office mein business ka taaruf de' }, length: 1, isFinal: true }] });
          this.onend?.();
        }, 0);
      }
      stop() {}
      abort() {}
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: TranscriptRecognition });
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText('Bolne ki zubaan'), 'hi-IN');
    await user.click(screen.getByRole('button', { name: 'Bol Kar Batayein' }));
    const ideaField = screen.getByLabelText('Ya Apna Idea Yahan Likhein');
    await waitFor(() => expect(ideaField).toHaveValue('Mera avatar office mein business ka taaruf de'));
    expect(instance?.lang).toBe('hi-IN');
    await user.clear(ideaField);
    await user.type(ideaField, 'Mera avatar camera mein seedha dekhe.');
    expect(ideaField).toHaveValue('Mera avatar camera mein seedha dekhe.');
  });

  it('shows a visible stop-recording action while listening', async () => {
    const stop = vi.fn();
    class ListeningRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((event: never) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {}
      stop = stop;
      abort() {}
    }
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: ListeningRecognition });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Bol Kar Batayein' }));
    const stopButton = await screen.findByRole('button', { name: 'Sunna Band Karein' });
    await user.click(stopButton);
    expect(stop).toHaveBeenCalledOnce();
  });

  it('selects the prompt for manual copying when clipboard access fails', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('permission denied')) },
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) });
    render(<App />);
    await user.type(screen.getByLabelText('Ya Apna Idea Yahan Likhein'), 'An avatar waves beside the sea.');
    await user.click(screen.getByRole('button', { name: 'Mera Prompt Banao' }));
    await screen.findByRole('heading', { name: 'Aapka Ready Video Prompt' });
    await user.click(screen.getByRole('button', { name: 'Copy Prompt' }));
    expect(await screen.findByText(/Prompt select hai/u)).toBeInTheDocument();
    expect(screen.getByLabelText('English video prompt')).toHaveFocus();
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('builds a transparently labeled local prompt when the server cannot be reached', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    render(<App />);
    await user.type(screen.getByLabelText('Ya Apna Idea Yahan Likhein'), 'My avatar waves at sunrise.');
    await user.click(screen.getByRole('button', { name: 'Mera Prompt Banao' }));
    expect(await screen.findByRole('heading', { name: 'Aapka Ready Video Prompt' })).toBeInTheDocument();
    expect(screen.getByText('Smart template se tayyar')).toBeInTheDocument();
    expect(screen.getByText(/Server se rabta nahi ho saka/u)).toBeInTheDocument();
    expect(screen.getByLabelText('English video prompt')).toHaveValue(buildFallbackPrompt('My avatar waves at sunrise.'));
  });

  it('shows loading state and disables repeat generation while waiting', async () => {
    let finishRequest!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>((resolve) => { finishRequest = resolve; }));
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Ya Apna Idea Yahan Likhein'), 'My avatar smiles at the camera.');
    await user.click(screen.getByRole('button', { name: 'Mera Prompt Banao' }));
    expect(screen.getByRole('button', { name: 'Prompt tayyar ho raha hai…' })).toBeDisabled();
    finishRequest(mockPromptResponse() as unknown as Response);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Aapka Ready Video Prompt' })).toBeInTheDocument());
  });
});
