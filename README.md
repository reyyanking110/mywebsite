# Flow Prompt Assistant

A mobile-first React + TypeScript + Vite app for turning a spoken or typed idea in Urdu, Roman Urdu, Hindi, or Hinglish into one ready-to-copy English video prompt for Google Flow. The app creates prompts only; it does not create videos or connect to Google Flow.

The UI is written in simple Roman Urdu. It uses the browser Web Speech API when available, keeps the transcription editable, asks a short follow-up for vague ideas, and includes an honest deterministic smart-template fallback. No audio is recorded or stored by this app.

## Run locally

Requirements: Node.js 20.19+ (Node 22 recommended) and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). The Vite development server also serves the same `/api/generate` endpoint used by the Vercel deployment. With no AI key, it returns a prompt from the built-in template builder; the app remains usable without a paid service.

Run checks:

```bash
npm test
npm run build
```

## Optional server-side AI mode

AI generation uses the OpenAI Chat Completions API from the server only. The key is never included in browser code. If the key is missing—or the provider fails—the app says so and uses the built-in template instead.

For local development, run `cp .env.example .env.local`, then add your key to `OPENAI_API_KEY` in `.env.local` (optionally change `OPENAI_MODEL`). Restart `npm run dev` after changing environment variables. Do not use a `VITE_` prefix for secrets, and do not commit `.env.local`.

## Deploy to Vercel

1. Either push this project to GitHub and import the repository in Vercel, or deploy with the CLI: run `npx vercel` for a preview deployment and `npx vercel --prod` for production.
2. Keep the build command as `npm run build` and the output directory as `dist` (both are in `vercel.json`). Vercel discovers the serverless endpoint at `api/generate.ts`.
3. To enable AI mode, open **Project Settings → Environment Variables** and add `OPENAI_API_KEY` (optionally add `OPENAI_MODEL`). Add the values to the environments you use, then redeploy. Never add the key as a `VITE_` variable.
4. Without that variable, production uses the built-in smart-template fallback and remains functional.

## Voice and privacy notes

- Voice input depends on the browser's Web Speech API and the selected recognition language. Browser support, language availability, and Roman Urdu transcription accuracy vary. The text field is always available as a fallback.
- Speech recognition may be handled by the browser's speech service. This app does not upload, retain, or store audio recordings.
- The typed/transcribed idea is sent to this app's `/api/generate` endpoint to make a prompt. When server-side AI mode is configured, that text is also sent to the configured AI provider. In fallback mode, the template runs locally on the server (or in the browser if the API cannot be reached).
- The father selects or uploads his own avatar separately in Google Flow. The app only writes a prompt that reminds the video model to preserve a referenced avatar's identity.
