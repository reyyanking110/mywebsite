import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import { type Plugin, loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { generatePrompt, IdeaValidationError } from './server/generatePrompt.ts';

const MAX_BODY_BYTES = 16_384;

function sendJson(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
}

function readRequestBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let content = '';
    let size = 0;
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request zyada bari hai.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      content += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(content));
      } catch {
        reject(Object.assign(new Error('Request samajh nahi aayi.'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function createPromptHandler() {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      sendJson(res, 405, { error: 'Sirf POST request qabool hai.' });
      return;
    }

    try {
      const body = await readRequestBody(req);
      const idea = (body as { idea?: unknown } | null)?.idea;
      sendJson(res, 200, await generatePrompt(idea));
    } catch (error) {
      const statusCode = error instanceof IdeaValidationError
        ? 400
        : typeof error === 'object' && error && 'statusCode' in error
          ? Number((error as { statusCode: unknown }).statusCode) || 400
          : 500;
      const message = error instanceof Error ? error.message : 'Prompt tayyar nahi ho saka.';
      sendJson(res, statusCode, { error: message });
    }
  };
}

function promptApiPlugin(): Plugin {
  return {
    name: 'flow-prompt-local-api',
    configureServer(server) {
      server.middlewares.use('/api/generate', createPromptHandler());
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/generate', createPromptHandler());
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Only expose the server-only variables to Node; Vite never prefixes or
  // injects these values into the browser bundle.
  for (const key of ['OPENAI_API_KEY', 'OPENAI_MODEL'] as const) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [react(), promptApiPlugin()],
    server: {
      host: '0.0.0.0',
      allowedHosts: ['.e2b.app'],
    },
    preview: {
      host: '0.0.0.0',
      allowedHosts: ['.e2b.app'],
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      restoreMocks: true,
    },
  };
});
