import {
  classifyGeminiError,
  getSafeApiErrorStatus,
  handleRecommendTimetable,
} from '../../server/aiCoachHandlers';
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
    const { status, payload } = await handleRecommendTimetable(body);
    sendJson(res, getSafeApiErrorStatus(status), payload);
  } catch (error) {
    const classified = classifyGeminiError(error);
    sendJson(res, getSafeApiErrorStatus(classified.httpStatus), {
      success: false,
      error: classified.publicMessage,
      code: classified.code,
      retryable: classified.retryable,
    });
  }
}
