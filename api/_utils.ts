import type { IncomingMessage, ServerResponse } from 'http';

export type VercelReq = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[]>;
};

export type VercelRes = ServerResponse & {
  status?: (code: number) => VercelRes;
  json?: (data: unknown) => void;
};

export function sendJson(res: VercelRes, statusCode: number, data: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}

export async function readJsonBody(req: VercelReq): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string') {
    const trimmed = req.body.trim();
    return trimmed ? (JSON.parse(trimmed) as Record<string, unknown>) : {};
  }

  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        if (!raw) {
          resolve({});
          return;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new SyntaxError('Expected JSON object body.'));
          return;
        }
        resolve(parsed as Record<string, unknown>);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}
