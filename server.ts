import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const PORT = Number(process.env.PORT || 3000);
const PRIMARY_MODEL = process.env.GEMINI_PRIMARY_MODEL?.trim() || 'gemini-4-hydrogen';

// Only allow verified active, non-deprecated, non-paid-only text models as automatic fallback
const COMPATIBLE_FALLBACK_MODELS = new Set([
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
]);

function getConfiguredFallbackModel(): string | null {
  const raw = process.env.GEMINI_FALLBACK_MODEL?.trim();
  if (!raw || raw === PRIMARY_MODEL) {
    return null;
  }
  if (!COMPATIBLE_FALLBACK_MODELS.has(raw)) {
    console.warn(
      `[AI Coach] Ignoring unsupported or restricted GEMINI_FALLBACK_MODEL="${raw}". Allowed fallback models: ${Array.from(
        COMPATIBLE_FALLBACK_MODELS
      ).join(', ')}.`
    );
    return null;
  }
  return raw;
}

const FALLBACK_MODEL = getConfiguredFallbackModel();
const GEMINI_TIMEOUT_MS = 28000;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured in the server environment.');
    (err as Error & { code?: string }).code = 'CONFIG_ERROR';
    throw err;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: GEMINI_TIMEOUT_MS,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface ClassifiedGeminiError {
  httpStatus: number;
  code: string;
  retryable: boolean;
  publicMessage: string;
}

function classifyGeminiError(error: unknown): ClassifiedGeminiError {
  const errObj = (error && typeof error === 'object' ? error : {}) as Record<string, unknown>;
  const nestedError =
    errObj.error && typeof errObj.error === 'object'
      ? (errObj.error as Record<string, unknown>)
      : undefined;

  const rawStatus =
    typeof errObj.status === 'number'
      ? errObj.status
      : typeof errObj.statusCode === 'number'
      ? errObj.statusCode
      : typeof nestedError?.code === 'number'
      ? nestedError.code
      : undefined;

  const rawCode = String(
    errObj.code ?? nestedError?.status ?? errObj.status ?? ''
  ).toUpperCase();

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof nestedError?.message === 'string'
      ? nestedError.message
      : String(error ?? '');

  if (rawCode === 'CONFIG_ERROR' || rawMessage.includes('GEMINI_API_KEY is not configured')) {
    return {
      httpStatus: 500,
      code: 'CONFIG_ERROR',
      retryable: false,
      publicMessage: 'AI Coach service is not configured on the server.',
    };
  }

  const errName = error instanceof Error ? error.name : String(errObj.name ?? '');

  const isUnavailable =
    rawStatus === 503 ||
    rawStatus === 502 ||
    rawStatus === 504 ||
    errName === 'TimeoutError' ||
    errName === 'AbortError' ||
    rawCode === 'UNAVAILABLE' ||
    rawCode === 'TIMEOUT' ||
    rawCode === 'ECONNRESET' ||
    rawCode === 'ETIMEDOUT' ||
    rawCode === 'ECONNABORTED' ||
    rawCode === 'EAI_AGAIN' ||
    rawCode === 'ENOTFOUND' ||
    rawCode === 'UND_ERR_CONNECT_TIMEOUT' ||
    /\b(503|502|504)\b|UNAVAILABLE|high demand|overloaded|temporarily unavailable|service unavailable|currently experiencing|try again later|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|timed out|timeout|aborted|MODEL_JSON_PARSE_ERROR/i.test(
      rawMessage
    );

  if (isUnavailable) {
    return {
      httpStatus: 503,
      code: 'TEMPORARY_UNAVAILABLE',
      retryable: true,
      publicMessage: 'AI Coach is temporarily unavailable. Please try again shortly.',
    };
  }

  const isRateLimited =
    rawStatus === 429 ||
    rawCode === 'RESOURCE_EXHAUSTED' ||
    /\b429\b|RESOURCE_EXHAUSTED|rate limit|quota/i.test(rawMessage);

  if (isRateLimited) {
    return {
      httpStatus: 429,
      code: 'RATE_LIMITED',
      retryable: true,
      publicMessage: 'AI Coach is temporarily busy due to rate limits. Please try again shortly.',
    };
  }

  if (rawStatus === 401 || rawStatus === 403 || rawCode === 'PERMISSION_DENIED') {
    return {
      httpStatus: rawStatus || 403,
      code: 'AUTH_ERROR',
      retryable: false,
      publicMessage: 'AI Coach authentication failed on the server.',
    };
  }

  if (rawStatus === 400 || rawStatus === 404) {
    return {
      httpStatus: rawStatus,
      code: 'BAD_REQUEST',
      retryable: false,
      publicMessage: 'AI Coach request could not be processed.',
    };
  }

  return {
    httpStatus: 500,
    code: 'INTERNAL_ERROR',
    retryable: false,
    publicMessage: 'Failed to reach AI Coach service. Please try again.',
  };
}

interface GeminiJsonResult<T> {
  parsed: T;
  modelUsed: string;
  usedFallback: boolean;
  primaryModel: string;
  fallbackNotice?: string;
}

async function generateCoachJson<T>(options: {
  ai: GoogleGenAI;
  prompt: string;
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
  allowFallback?: boolean;
  thinkingLevel?: ThinkingLevel;
}): Promise<GeminiJsonResult<T>> {
  const {
    ai,
    prompt,
    systemInstruction,
    responseSchema,
    allowFallback = false,
    thinkingLevel = ThinkingLevel.LOW,
  } = options;

  const invokeModel = async (model: string): Promise<T> => {
    const isHydrogen = model.includes('gemini-4-hydrogen');
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema,
        ...(isHydrogen ? { thinkingConfig: { thinkingLevel } } : {}),
        abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      },
    });
    const rawText = (response.text ?? '{}')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    try {
      return JSON.parse(rawText) as T;
    } catch {
      const parseErr = new Error('MODEL_JSON_PARSE_ERROR: Gemini returned malformed JSON.');
      (parseErr as Error & { status?: number }).status = 502;
      throw parseErr;
    }
  };

  try {
    const parsed = await invokeModel(PRIMARY_MODEL);
    return {
      parsed,
      modelUsed: PRIMARY_MODEL,
      usedFallback: false,
      primaryModel: PRIMARY_MODEL,
    };
  } catch (primaryError) {
    const classified = classifyGeminiError(primaryError);
    if (allowFallback && classified.retryable && FALLBACK_MODEL) {
      console.warn(
        `[AI Coach] Primary model (${PRIMARY_MODEL}) unavailable (${classified.code}); invoking configured fallback (${FALLBACK_MODEL}).`
      );
      const parsed = await invokeModel(FALLBACK_MODEL);
      return {
        parsed,
        modelUsed: FALLBACK_MODEL,
        usedFallback: true,
        primaryModel: PRIMARY_MODEL,
        fallbackNotice: `Primary model (${PRIMARY_MODEL}) was temporarily unavailable. Response generated using configured fallback model (${FALLBACK_MODEL}).`,
      };
    }
    throw primaryError;
  }
}

const COACH_SYSTEM_INSTRUCTION = `You are the AI Life Coach inside PROJECT REBUILD ME — a thoughtful, sharp personal performance analyst, planning assistant, technical/academic mentor, and accountability partner.

CONVERSATIONAL INTELLIGENCE & TONE:
- Respond naturally, clearly, and pragmatically like a skilled mentor who remembers the thread.
- Match response length and depth to the question: crisp and direct for straightforward questions; structured with clear headings, numbered steps, concrete examples, or code blocks for complex planning, technical, or learning topics.
- Ask focused follow-up or clarifying questions when helpful (e.g., ambiguous priorities, energy level, or unclear constraints).
- Avoid repetitive motivational clichés, empty hype, and lecturing. Challenge excuses constructively with evidence and practical next moves.
- Explain complex concepts simply and clearly when asked (whether about productivity, study strategies, software engineering, math, communication, or general knowledge questions outside productivity).

PERSONAL CONTEXT GROUNDING (CRITICAL):
- When answering questions about the user's tasks, routine, focus hours, habits, goals, projects, or weekly/monthly progress, base EVERY stat, percentage, hour count, streak, and task name STRICTLY on the supplied JSON execution data.
- Never invent completion stats or pretend to know unrecorded information. If a requested personal metric is missing or has zero logged sessions/tasks, state that clearly and explain what to log.
- Reference previous turns in the conversation naturally for follow-up continuity.

SAFE RECOMMENDATIONS ONLY:
- You can propose new or adjusted schedule blocks in \`suggestedChanges\` (respecting fixed university commitments and sleep times; never overwriting past completed history) and optional structured goals/milestones in \`suggestedGoalActions\`.
- NEVER claim you have automatically edited the user's schedule or goals—explicitly let the user know they can review and apply proposed changes with the action button.`;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'project-rebuild-me' });
  });

  // 1. AI Life Coach Chat Endpoint
  app.post('/api/coach/chat', async (req, res) => {
    try {
      const { userMessage, conversationHistory, contextSnapshot, allowFallback } = req.body as {
        userMessage: string;
        conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
        contextSnapshot: unknown;
        allowFallback?: boolean;
      };

      if (!userMessage || typeof userMessage !== 'string') {
        res.status(400).json({ error: 'userMessage is required.', retryable: false });
        return;
      }

      const ai = getGeminiClient();

      const recentHistory = (conversationHistory || [])
        .slice(-10)
        .map((m) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`)
        .join('\n');

      const prompt = `AUTHENTICATED USER RECORDED EXECUTION DATA (JSON):
${JSON.stringify(contextSnapshot)}

RECENT CONVERSATION:
${recentHistory || '(New conversation)'}

CURRENT USER MESSAGE:
${userMessage}

Instructions:
- Answer helpfully using clean Markdown formatting (bulleted lists, bold emphasis, or code blocks where useful).
- For personal analytics/planning questions, ground numbers strictly in the JSON execution data above. For general study, programming, communication, or knowledge questions, give clear, practical explanations and examples.
- Only include \`suggestedChanges\` when proposing specific schedule blocks for today or upcoming days (24h HH:mm format, avoiding overlaps with fixed commitments and sleep). Otherwise return \`suggestedChanges: []\`.
- Only include \`suggestedGoalActions\` when breaking down a goal into actionable milestones the user can optionally save. Otherwise return \`suggestedGoalActions: []\`.`;

      const result = await generateCoachJson<{
        reply?: string;
        suggestedChanges?: unknown[];
        suggestedGoalActions?: unknown[];
      }>({
        ai,
        prompt,
        systemInstruction: COACH_SYSTEM_INSTRUCTION,
        allowFallback: Boolean(allowFallback),
        thinkingLevel: ThinkingLevel.LOW,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: {
              type: Type.STRING,
              description: 'Helpful, structured Markdown response grounded in conversation history and recorded data.',
            },
            suggestedChanges: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  targetDate: { type: Type.STRING },
                  action: { type: Type.STRING },
                  title: { type: Type.STRING },
                  category: { type: Type.STRING },
                  priority: { type: Type.STRING },
                  suggestedStartTime: { type: Type.STRING },
                  suggestedEndTime: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
              },
            },
            suggestedGoalActions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  goalTitle: { type: Type.STRING },
                  area: { type: Type.STRING },
                  deadline: { type: Type.STRING },
                  milestones: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  reason: { type: Type.STRING },
                },
              },
            },
          },
          required: ['reply', 'suggestedChanges'],
        },
      });

      res.json({
        reply: result.parsed.reply || 'No response generated.',
        suggestedChanges: Array.isArray(result.parsed.suggestedChanges)
          ? result.parsed.suggestedChanges
          : [],
        suggestedGoalActions: Array.isArray(result.parsed.suggestedGoalActions)
          ? result.parsed.suggestedGoalActions
          : [],
        modelUsed: result.modelUsed,
        usedFallback: result.usedFallback,
        fallbackNotice: result.fallbackNotice,
      });
    } catch (error) {
      const classified = classifyGeminiError(error);
      res.status(classified.httpStatus).json({
        error: classified.publicMessage,
        code: classified.code,
        retryable: classified.retryable,
      });
    }
  });

  // 2. AI Daily Accountability Review Endpoint
  app.post('/api/coach/daily-review', async (req, res) => {
    try {
      const { todaySnapshot, recentTrends, allowFallback } = req.body as {
        todaySnapshot: unknown;
        recentTrends: unknown;
        allowFallback?: boolean;
      };

      const ai = getGeminiClient();
      const prompt = `Analyze today's execution data and recent trends for the user's end-of-day accountability review.

TODAY'S RECORDED DATA:
${JSON.stringify(todaySnapshot)}

RECENT MULTI-DAY CONTEXT:
${JSON.stringify(recentTrends)}

Generate a structured daily review based strictly on the recorded tasks and times.`;

      const result = await generateCoachJson<Record<string, unknown>>({
        ai,
        prompt,
        systemInstruction: COACH_SYSTEM_INSTRUCTION,
        allowFallback: Boolean(allowFallback),
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            completedSummary: { type: Type.STRING },
            missedTasks: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            plannedVsActual: { type: Type.STRING },
            patterns: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            tomorrowPriorities: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: [
            'completedSummary',
            'missedTasks',
            'plannedVsActual',
            'patterns',
            'recommendations',
            'tomorrowPriorities',
          ],
        },
      });

      res.json({
        ...result.parsed,
        modelUsed: result.modelUsed,
        usedFallback: result.usedFallback,
        fallbackNotice: result.fallbackNotice,
      });
    } catch (error) {
      const classified = classifyGeminiError(error);
      res.status(classified.httpStatus).json({
        error: classified.publicMessage,
        code: classified.code,
        retryable: classified.retryable,
      });
    }
  });

  // 3. AI Weekly Performance Report Endpoint
  app.post('/api/coach/weekly-report', async (req, res) => {
    try {
      const { weekMetrics, allowFallback } = req.body as {
        weekMetrics: unknown;
        allowFallback?: boolean;
      };
      const ai = getGeminiClient();

      const prompt = `Generate a structured Weekly Performance Report strictly from these recorded metrics:
${JSON.stringify(weekMetrics)}

Do not invent numbers. Use the exact percentages and hour counts supplied.`;

      const result = await generateCoachJson<Record<string, unknown>>({
        ai,
        prompt,
        systemInstruction: COACH_SYSTEM_INSTRUCTION,
        allowFallback: Boolean(allowFallback),
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            studyProgress: { type: Type.STRING },
            exerciseConsistency: { type: Type.STRING },
            timeAllocation: { type: Type.STRING },
            biggestAchievement: { type: Type.STRING },
            biggestWeakness: { type: Type.STRING },
            recommendedImprovements: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: [
            'studyProgress',
            'exerciseConsistency',
            'timeAllocation',
            'biggestAchievement',
            'biggestWeakness',
            'recommendedImprovements',
          ],
        },
      });

      res.json({
        ...result.parsed,
        modelUsed: result.modelUsed,
        usedFallback: result.usedFallback,
        fallbackNotice: result.fallbackNotice,
      });
    } catch (error) {
      const classified = classifyGeminiError(error);
      res.status(classified.httpStatus).json({
        error: classified.publicMessage,
        code: classified.code,
        retryable: classified.retryable,
      });
    }
  });

  // 4. Smart Scheduling Explanation & Recommendation Enrichment Endpoint
  app.post('/api/scheduler/enrich', async (req, res) => {
    try {
      const { proposals, diagnostics, contextSummary } = req.body as {
        proposals: Array<{ id: string; title: string; category: string; priority: string; reason: string }>;
        diagnostics: Array<{ issue: string; evidence: string }>;
        contextSummary: string;
      };

      if (!process.env.GEMINI_API_KEY) {
        res.json({ summaryNote: contextSummary, reasonsById: {} });
        return;
      }

      const ai = getGeminiClient();
      const prompt = `The deterministic scheduling engine generated conflict-free proposals for tomorrow:
Summary: ${contextSummary}
Proposals: ${JSON.stringify(proposals)}
Diagnostics: ${JSON.stringify(diagnostics)}

Provide a concise 2-sentence strategic summary note explaining why these adjustments protect the user's goals and sleep, and optionally refine the reason text for each proposal ID without changing any times.`;

      const result = await generateCoachJson<{
        summaryNote?: string;
        refinedReasons?: Array<{ id?: string; reason?: string }>;
      }>({
        ai,
        prompt,
        systemInstruction: COACH_SYSTEM_INSTRUCTION,
        allowFallback: true,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summaryNote: { type: Type.STRING },
            refinedReasons: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
              },
            },
          },
          required: ['summaryNote', 'refinedReasons'],
        },
      });

      const reasonsById: Record<string, string> = {};
      if (Array.isArray(result.parsed.refinedReasons)) {
        for (const item of result.parsed.refinedReasons) {
          if (item?.id && item?.reason) reasonsById[item.id] = item.reason;
        }
      }
      res.json({
        summaryNote: result.parsed.summaryNote || contextSummary,
        reasonsById,
        modelUsed: result.modelUsed,
        usedFallback: result.usedFallback,
      });
    } catch {
      // Graceful fallback to deterministic summary
      res.json({
        summaryNote: req.body?.contextSummary || 'Conflict-free schedule computed.',
        reasonsById: {},
      });
    }
  });

  // Ensure unmatched /api/* routes return JSON 404 instead of falling through to HTML SPA fallback
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
      code: 'API_NOT_FOUND',
      retryable: false,
    });
  });

  // Ensure any Express middleware error on /api/* (e.g., malformed JSON 400 or payload limit 413) returns JSON instead of HTML
  app.use(
    '/api',
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
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
          error: 'Invalid JSON request body.',
          code: 'INVALID_JSON_BODY',
          retryable: false,
        });
        return;
      }
      if (errType === 'entity.too.large' || status === 413) {
        res.status(413).json({
          error: 'Request payload is too large for the AI Coach API.',
          code: 'PAYLOAD_TOO_LARGE',
          retryable: false,
        });
        return;
      }
      const classified = classifyGeminiError(err);
      res.status(status >= 400 && status < 600 ? status : classified.httpStatus).json({
        error: classified.publicMessage,
        code: classified.code,
        retryable: classified.retryable,
      });
    }
  );

  // Mount Vite middleware in dev or static build in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PROJECT REBUILD ME server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
