import { handlePushCron } from '../../server/pushHandlers';
import { sendJson, VercelReq, VercelRes } from '../_utils';

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }
  const authHeader =
    typeof req.headers?.authorization === 'string'
      ? req.headers.authorization
      : undefined;
  const { status, payload } = await handlePushCron(authHeader);
  sendJson(res, status, payload);
}
