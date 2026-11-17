import { sendJson, VercelReq, VercelRes } from './_utils';

export default function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }
  sendJson(res, 200, {
    success: true,
    ok: true,
    service: 'project-rebuild-me',
    runtime: 'vercel-serverless',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    webPushConfigured: Boolean(
      process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim()
    ),
  });
}
