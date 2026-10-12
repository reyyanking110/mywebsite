import { generatePrompt, IdeaValidationError } from '../server/generatePrompt.ts';

// A small structural type keeps the route compatible with Vercel's Node
// function contract without pulling runtime dependencies into the client app.
interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  setHeader(name: string, value: string): ApiResponse;
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Sirf POST request qabool hai.' });
  }

  try {
    const body = req.body as { idea?: unknown } | null;
    const result = await generatePrompt(body?.idea);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof IdeaValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Prompt API request failed.', error);
    return res.status(500).json({ error: 'Prompt tayyar nahi ho saka. Dobara koshish karein.' });
  }
}
