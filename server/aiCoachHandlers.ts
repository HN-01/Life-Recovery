import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const PRIMARY_MODEL = process.env.GEMINI_PRIMARY_MODEL?.trim() || 'gemini-4-hydrogen';

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
    return null;
  }
  return raw;
}

const FALLBACK_MODEL = getConfiguredFallbackModel();
const GEMINI_TIMEOUT_MS = 45000;

export function getGeminiClient(): GoogleGenAI {
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

export interface ClassifiedGeminiError {
  httpStatus: number;
  upstreamStatus?: number;
  code: string;
  retryable: boolean;
  publicMessage: string;
}

export function getSafeApiErrorStatus(status: number): number {
  if (status === 403 || status === 502 || status === 503 || status === 504) {
    return 500;
  }
  return status >= 400 && status < 600 ? status : 500;
}

export function classifyGeminiError(error: unknown): ClassifiedGeminiError {
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
      httpStatus: 500,
      upstreamStatus: rawStatus || 503,
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
      upstreamStatus: 429,
      code: 'RATE_LIMITED',
      retryable: true,
      publicMessage: 'AI Coach is temporarily busy due to rate limits. Please try again shortly.',
    };
  }

  if (rawStatus === 401 || rawStatus === 403 || rawCode === 'PERMISSION_DENIED') {
    return {
      httpStatus: rawStatus === 401 ? 401 : 500,
      upstreamStatus: rawStatus || 403,
      code: 'AUTH_ERROR',
      retryable: false,
      publicMessage: 'AI Coach authentication failed on the server.',
    };
  }

  if (rawStatus === 400 || rawStatus === 404) {
    return {
      httpStatus: rawStatus,
      upstreamStatus: rawStatus,
      code: 'BAD_REQUEST',
      retryable: false,
      publicMessage: 'AI Coach request could not be processed.',
    };
  }

  return {
    httpStatus: 500,
    upstreamStatus: rawStatus,
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

export const COACH_SYSTEM_INSTRUCTION = `You are the AI Life Coach and General Intelligence Assistant inside PROJECT REBUILD ME — a sharp personal performance analyst, planning strategist, programming & STEM tutor, business advisor, and web-aware research companion.

CONVERSATIONAL INTELLIGENCE & GENERAL PURPOSE:
- Support natural conversations, follow-up questions, brainstorming, and complex multi-turn dialogue.
- Answer general knowledge, programming, university study, architecture, business, productivity, and current-events questions clearly using Markdown (concise paragraphs, bullet lists, tables, or fenced code blocks where appropriate).
- Match depth and tone to the question without repetitive motivational hype or lecturing.

WEB SEARCH GROUNDING RULES (CRITICAL):
- You have Google Search grounding available. Automatically use Google Search when the question involves current events, recent releases, live facts, latest library versions, prices, weather, news, or anything time-sensitive where verified web facts matter.
- Do NOT trigger web search unnecessarily for purely personal routine questions, basic greetings, or timeless fundamentals unless verification helps.
- Clearly distinguish verified current web findings from general reasoning when summarizing current topics.
- NEVER invent URLs, sources, or pretend to have searched the web if you did not retrieve search results.

PERSONAL CONTEXT GROUNDING (CRITICAL):
- When answering questions about the user's tasks, routine, progress, habits, goals, projects, or focus metrics, base EVERY stat, percentage, hour count, streak, and task name STRICTLY on the supplied JSON execution data.
- Note: Users earn full productivity credit by completing ANY scheduled activity or habit (University, Study, Exercise, Programming, Business, Family, Custom tasks); Deep Work timer sessions are strictly optional.
- Never claim you have automatically modified the user's schedule or goals—tell them they can apply proposed actions explicitly.

OPTIONAL STRUCTURED ACTIONS:
- ONLY when proposing specific new/rescheduled routine blocks or milestone breakdowns for the user to approve with a button, append a single block at the very end of your response:
<coach_actions>{"suggestedChanges":[{"targetDate":"YYYY-MM-DD","action":"add","title":"...","category":"Programming","priority":"High","suggestedStartTime":"17:00","suggestedEndTime":"18:00","reason":"..."}],"suggestedGoalActions":[]}</coach_actions>
- Omit <coach_actions> completely for normal conversations, Q&A, coding help, or general advice.`;

function parseCoachActionsTrailer(rawText: string): {
  replyText: string;
  suggestedChanges: unknown[];
  suggestedGoalActions: unknown[];
} {
  const match = rawText.match(/<coach_actions>\s*([\s\S]*?)\s*<\/coach_actions>/i);
  if (!match) {
    return {
      replyText: rawText.trim(),
      suggestedChanges: [],
      suggestedGoalActions: [],
    };
  }
  const cleanReply = rawText.replace(match[0], '').trim();
  try {
    const jsonText = match[1]
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    const parsed = JSON.parse(jsonText) as {
      suggestedChanges?: unknown[];
      suggestedGoalActions?: unknown[];
    };
    return {
      replyText: cleanReply,
      suggestedChanges: Array.isArray(parsed.suggestedChanges) ? parsed.suggestedChanges : [],
      suggestedGoalActions: Array.isArray(parsed.suggestedGoalActions)
        ? parsed.suggestedGoalActions
        : [],
    };
  } catch {
    return {
      replyText: cleanReply,
      suggestedChanges: [],
      suggestedGoalActions: [],
    };
  }
}

export async function handleCoachChat(body: {
  userMessage?: unknown;
  conversationHistory?: unknown;
  contextSnapshot?: unknown;
  conversationId?: unknown;
  allowFallback?: unknown;
}) {
  const {
    userMessage,
    conversationHistory,
    contextSnapshot,
    conversationId,
    allowFallback,
  } = body;

  if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
    return {
      status: 400,
      payload: {
        success: false,
        error: 'userMessage is required.',
        code: 'BAD_REQUEST',
        retryable: false,
      },
    };
  }

  const ai = getGeminiClient();
  const historyList = Array.isArray(conversationHistory)
    ? (conversationHistory as Array<{ role?: string; content?: string }>).slice(-12)
    : [];

  const contentsPayload = [
    {
      role: 'user' as const,
      parts: [
        {
          text: `AUTHENTICATED USER FIRESTORE CONTEXT (JSON — cite only real numbers recorded here when discussing user data):\n${JSON.stringify(
            contextSnapshot ?? {}
          )}`,
        },
      ],
    },
    {
      role: 'model' as const,
      parts: [
        {
          text: 'Understood. I will ground all personal routine/task/habit/goal stats strictly in this Firestore context, remember prior turns, and use Google Search automatically when current web facts are needed.',
        },
      ],
    },
    ...historyList
      .filter((m) => typeof m?.content === 'string' && m.content.trim())
      .map((m) => ({
        role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
        parts: [{ text: String(m.content) }],
      })),
  ];

  // Ensure the final user message is always present at the end if caller omitted it from history
  const lastTurn = contentsPayload[contentsPayload.length - 1];
  if (!lastTurn || lastTurn.role !== 'user' || lastTurn.parts[0]?.text !== userMessage) {
    contentsPayload.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });
  }

  const invokeGroundedChat = async (model: string) => {
    const isHydrogen = model.includes('gemini-4-hydrogen');
    const response = await ai.models.generateContent({
      model,
      contents: contentsPayload,
      config: {
        systemInstruction: COACH_SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }],
        ...(isHydrogen ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      },
    });
    return response;
  };

  let response;
  let modelUsed = PRIMARY_MODEL;
  let usedFallback = false;
  let fallbackNotice: string | undefined;

  try {
    response = await invokeGroundedChat(PRIMARY_MODEL);
  } catch (primaryErr) {
    const classified = classifyGeminiError(primaryErr);
    if (Boolean(allowFallback) && classified.retryable && FALLBACK_MODEL) {
      response = await invokeGroundedChat(FALLBACK_MODEL);
      modelUsed = FALLBACK_MODEL;
      usedFallback = true;
      fallbackNotice = `Primary model (${PRIMARY_MODEL}) was temporarily unavailable. Response generated using configured fallback model (${FALLBACK_MODEL}).`;
    } else {
      throw primaryErr;
    }
  }

  const rawText = response.text ?? '';
  const { replyText, suggestedChanges, suggestedGoalActions } =
    parseCoachActionsTrailer(rawText);

  const candidate = response.candidates?.[0];
  const groundingMeta = candidate?.groundingMetadata as
    | {
        webSearchQueries?: string[];
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      }
    | undefined;

  const citationsMap = new Map<string, { title: string; uri: string }>();
  if (Array.isArray(groundingMeta?.groundingChunks)) {
    for (const chunk of groundingMeta.groundingChunks) {
      const uri = chunk?.web?.uri?.trim();
      if (!uri) continue;
      if (!citationsMap.has(uri)) {
        citationsMap.set(uri, {
          title: chunk?.web?.title?.trim() || uri,
          uri,
        });
      }
    }
  }
  const citations = Array.from(citationsMap.values());
  const webSearchQueries = Array.isArray(groundingMeta?.webSearchQueries)
    ? groundingMeta.webSearchQueries.filter((q) => typeof q === 'string' && q.trim())
    : [];
  const isWebGrounded = citations.length > 0 || webSearchQueries.length > 0;

  return {
    status: 200,
    payload: {
      success: true,
      response: replyText || 'No response generated.',
      reply: replyText || 'No response generated.',
      ...(typeof conversationId === 'string' && conversationId.trim()
        ? { conversationId: conversationId.trim() }
        : {}),
      suggestedChanges,
      suggestedGoalActions,
      citations,
      webSearchQueries,
      isWebGrounded,
      modelUsed,
      usedFallback,
      fallbackNotice,
    },
  };
}

export async function handleDailyReview(body: {
  todaySnapshot?: unknown;
  recentTrends?: unknown;
  allowFallback?: unknown;
}) {
  const ai = getGeminiClient();
  const prompt = `Analyze today's execution data and recent trends for the user's end-of-day accountability review.

TODAY'S RECORDED DATA:
${JSON.stringify(body.todaySnapshot ?? {})}

RECENT MULTI-DAY CONTEXT:
${JSON.stringify(body.recentTrends ?? {})}

Generate a structured daily review based strictly on the recorded tasks, habits, and times. Remember all completed tasks (not just Deep Work timer blocks) count toward productivity.`;

  const result = await generateCoachJson<Record<string, unknown>>({
    ai,
    prompt,
    systemInstruction: COACH_SYSTEM_INSTRUCTION,
    allowFallback: Boolean(body.allowFallback),
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        completedSummary: { type: Type.STRING },
        missedTasks: { type: Type.ARRAY, items: { type: Type.STRING } },
        plannedVsActual: { type: Type.STRING },
        patterns: { type: Type.ARRAY, items: { type: Type.STRING } },
        recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
        tomorrowPriorities: { type: Type.ARRAY, items: { type: Type.STRING } },
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

  return {
    status: 200,
    payload: {
      success: true,
      ...result.parsed,
      modelUsed: result.modelUsed,
      usedFallback: result.usedFallback,
      fallbackNotice: result.fallbackNotice,
    },
  };
}

export async function handleWeeklyReport(body: {
  weekMetrics?: unknown;
  allowFallback?: unknown;
}) {
  const ai = getGeminiClient();
  const prompt = `Generate a structured Weekly Performance Report strictly from these recorded metrics:
${JSON.stringify(body.weekMetrics ?? {})}

Do not invent numbers. Use the exact percentages and hour counts supplied.`;

  const result = await generateCoachJson<Record<string, unknown>>({
    ai,
    prompt,
    systemInstruction: COACH_SYSTEM_INSTRUCTION,
    allowFallback: Boolean(body.allowFallback),
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        studyProgress: { type: Type.STRING },
        exerciseConsistency: { type: Type.STRING },
        timeAllocation: { type: Type.STRING },
        biggestAchievement: { type: Type.STRING },
        biggestWeakness: { type: Type.STRING },
        recommendedImprovements: { type: Type.ARRAY, items: { type: Type.STRING } },
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

  return {
    status: 200,
    payload: {
      success: true,
      ...result.parsed,
      modelUsed: result.modelUsed,
      usedFallback: result.usedFallback,
      fallbackNotice: result.fallbackNotice,
    },
  };
}

export async function handleSchedulerEnrich(body: {
  proposals?: Array<{
    id: string;
    title: string;
    category: string;
    priority: string;
    reason: string;
  }>;
  diagnostics?: Array<{ issue: string; evidence: string }>;
  contextSummary?: string;
}) {
  const contextSummary = body.contextSummary || 'Conflict-free schedule computed.';
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return { status: 200, payload: { summaryNote: contextSummary, reasonsById: {} } };
  }

  try {
    const ai = getGeminiClient();
    const prompt = `The deterministic scheduling engine generated conflict-free proposals for tomorrow:
Summary: ${contextSummary}
Proposals: ${JSON.stringify(body.proposals ?? [])}
Diagnostics: ${JSON.stringify(body.diagnostics ?? [])}

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
    return {
      status: 200,
      payload: {
        summaryNote: result.parsed.summaryNote || contextSummary,
        reasonsById,
        modelUsed: result.modelUsed,
        usedFallback: result.usedFallback,
      },
    };
  } catch {
    return {
      status: 200,
      payload: { summaryNote: contextSummary, reasonsById: {} },
    };
  }
}

export async function handleRecommendTimetable(body: {
  basicSchedule?: unknown;
  commitments?: unknown;
  activities?: unknown;
  goalTargets?: unknown;
}) {
  const ai = getGeminiClient();
  const prompt = `Design a balanced, conflict-free 7-day weekly timetable recommendation tailored to this user's exact lifestyle inputs:
Basic Schedule: ${JSON.stringify(body.basicSchedule ?? {})}
Fixed Commitments: ${JSON.stringify(body.commitments ?? [])}
Personal Activities: ${JSON.stringify(body.activities ?? [])}
Goal Weekly Targets: ${JSON.stringify(body.goalTargets ?? [])}

Rules:
- Respect wake/bed times, sleep hours, break preferences, and NEVER overlap fixed commitments.
- Include brief recovery buffers between demanding study/work sessions.
- Output 24h HH:mm times (00..23) and day indices 0 (Sun) through 6 (Sat).`;

  const result = await generateCoachJson<{
    rationale?: string;
    weeklyBlocks?: Array<{
      dayOfWeek: number;
      title: string;
      startTime: string;
      endTime: string;
      category: string;
      priority: string;
      description: string;
      isBreak?: boolean;
    }>;
  }>({
    ai,
    prompt,
    systemInstruction: COACH_SYSTEM_INSTRUCTION,
    allowFallback: true,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        rationale: { type: Type.STRING },
        weeklyBlocks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              dayOfWeek: { type: Type.INTEGER },
              title: { type: Type.STRING },
              startTime: { type: Type.STRING },
              endTime: { type: Type.STRING },
              category: { type: Type.STRING },
              priority: { type: Type.STRING },
              description: { type: Type.STRING },
              isBreak: { type: Type.BOOLEAN },
            },
            required: ['dayOfWeek', 'title', 'startTime', 'endTime', 'category', 'priority'],
          },
        },
      },
      required: ['rationale', 'weeklyBlocks'],
    },
  });

  return {
    status: 200,
    payload: {
      success: true,
      rationale: result.parsed.rationale || 'Personalized timetable generated.',
      weeklyBlocks: Array.isArray(result.parsed.weeklyBlocks) ? result.parsed.weeklyBlocks : [],
      modelUsed: result.modelUsed,
    },
  };
}
