import { handleGetVapidPublicKey } from '../../server/pushHandlers';
import { sendJson, VercelReq, VercelRes } from '../_utils';

export default function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }
  const { status, payload } = handleGetVapidPublicKey();
  sendJson(res, status, payload);
}
