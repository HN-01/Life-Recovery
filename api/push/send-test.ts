import { handleSendTestPush } from '../../server/pushHandlers';
import { readJsonBody, sendJson, VercelReq, VercelRes } from '../_utils';

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { success: false, error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const { status, payload } = await handleSendTestPush(
      body as Parameters<typeof handleSendTestPush>[0]
    );
    sendJson(res, status, payload);
  } catch (err) {
    sendJson(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to parse request.',
    });
  }
}
