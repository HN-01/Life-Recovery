import { handleSchedulerEnrich } from '../../server/aiCoachHandlers';
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
    const { status, payload } = await handleSchedulerEnrich(
      body as Parameters<typeof handleSchedulerEnrich>[0]
    );
    sendJson(res, status, payload);
  } catch {
    sendJson(res, 200, {
      summaryNote: 'Conflict-free schedule computed.',
      reasonsById: {},
    });
  }
}
