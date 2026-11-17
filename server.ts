import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  classifyGeminiError,
  getSafeApiErrorStatus,
  handleCoachChat,
  handleDailyReview,
  handleRecommendTimetable,
  handleSchedulerEnrich,
  handleWeeklyReport,
} from './server/aiCoachHandlers';
import {
  handleGetVapidPublicKey,
  handlePushCron,
  handleSendTestPush,
} from './server/pushHandlers';

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Explicitly ensure every /api/* response declares application/json
  app.use('/api', (_req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      success: true,
      ok: true,
      service: 'project-rebuild-me',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      webPushConfigured: Boolean(
        process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim()
      ),
    });
  });

  // 1. AI Life Coach Chat (Web-grounded via Google Search + Firestore context)
  app.post('/api/coach/chat', async (req, res) => {
    try {
      const { status, payload } = await handleCoachChat(req.body || {});
      res.status(getSafeApiErrorStatus(status)).json(payload);
    } catch (error) {
      const classified = classifyGeminiError(error);
      res.status(getSafeApiErrorStatus(classified.httpStatus)).json({
        success: false,
        error: classified.publicMessage,
        code: classified.code,
        retryable: classified.retryable,
        ...(classified.upstreamStatus ? { upstreamStatus: classified.upstreamStatus } : {}),
      });
    }
  });

  // 2. AI Daily Accountability Review
  app.post('/api/coach/daily-review', async (req, res) => {
    try {
      const { status, payload } = await handleDailyReview(req.body || {});
      res.status(getSafeApiErrorStatus(status)).json(payload);
    } catch (error) {
      const classified = classifyGeminiError(error);
      res.status(getSafeApiErrorStatus(classified.httpStatus)).json({
        success: false,
        error: classified.publicMessage,
        code: classified.code,
        retryable: classified.retryable,
        ...(classified.upstreamStatus ? { upstreamStatus: classified.upstreamStatus } : {}),
      });
    }
  });

  // 3. AI Weekly Performance Report
  app.post('/api/coach/weekly-report', async (req, res) => {
    try {
      const { status, payload } = await handleWeeklyReport(req.body || {});
      res.status(getSafeApiErrorStatus(status)).json(payload);
    } catch (error) {
      const classified = classifyGeminiError(error);
      res.status(getSafeApiErrorStatus(classified.httpStatus)).json({
        success: false,
        error: classified.publicMessage,
        code: classified.code,
        retryable: classified.retryable,
        ...(classified.upstreamStatus ? { upstreamStatus: classified.upstreamStatus } : {}),
      });
    }
  });

  // 4. Smart Scheduling Explanation & Enrichment
  app.post('/api/scheduler/enrich', async (req, res) => {
    const { status, payload } = await handleSchedulerEnrich(req.body || {});
    res.status(status).json(payload);
  });

  // 5. Personalized Onboarding Timetable Recommendation
  app.post('/api/onboarding/recommend-timetable', async (req, res) => {
    try {
      const { status, payload } = await handleRecommendTimetable(req.body || {});
      res.status(getSafeApiErrorStatus(status)).json(payload);
    } catch (error) {
      const classified = classifyGeminiError(error);
      res.status(getSafeApiErrorStatus(classified.httpStatus)).json({
        success: false,
        error: classified.publicMessage,
        code: classified.code,
        retryable: classified.retryable,
      });
    }
  });

  // 6. Web Push Configuration & Test Delivery
  app.get('/api/push/vapid-public-key', (_req, res) => {
    const { status, payload } = handleGetVapidPublicKey();
    res.status(status).json(payload);
  });

  app.post('/api/push/send-test', async (req, res) => {
    const { status, payload } = await handleSendTestPush(req.body || {});
    res.status(status).json(payload);
  });

  app.all('/api/push/cron', async (req, res) => {
    const { status, payload } = await handlePushCron(req.headers.authorization);
    res.status(status).json(payload);
  });

  // Ensure unmatched /api/* routes return JSON 404 instead of falling through to HTML SPA fallback
  app.use('/api', (req, res) => {
    res.status(404).json({
      success: false,
      error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
      code: 'API_NOT_FOUND',
      retryable: false,
    });
  });

  // Ensure any Express middleware error on /api/* returns JSON instead of HTML
  app.use(
    '/api',
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const errObj = (err && typeof err === 'object' ? err : {}) as Record<string, unknown>;
      const status =
        typeof errObj.status === 'number'
          ? errObj.status
          : typeof errObj.statusCode === 'number'
          ? errObj.statusCode
          : 500;
      const errType = String(errObj.type ?? '');
      if (errType === 'entity.parse.failed' || err instanceof SyntaxError) {
        res.status(400).json({
          success: false,
          error: 'Invalid JSON request body.',
          code: 'INVALID_JSON_BODY',
          retryable: false,
        });
        return;
      }
      if (errType === 'entity.too.large' || status === 413) {
        res.status(413).json({
          success: false,
          error: 'Request payload is too large for the API.',
          code: 'PAYLOAD_TOO_LARGE',
          retryable: false,
        });
        return;
      }
      const classified = classifyGeminiError(err);
      res.status(getSafeApiErrorStatus(status >= 400 && status < 600 ? status : classified.httpStatus)).json({
        success: false,
        error: classified.publicMessage,
        code: classified.code,
        retryable: classified.retryable,
      });
    }
  );

  const httpServer = http.createServer(app);

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PROJECT REBUILD ME server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
