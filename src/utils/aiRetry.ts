export const MAX_AI_RETRIES = 3;
export const AI_RETRY_BASE_DELAY_MS = 1200;

export const RETRY_BUSY_MESSAGE = 'Your AI Coach is temporarily busy. Retrying...';
export const UNAVAILABLE_FINAL_MESSAGE =
  'AI Coach is temporarily unavailable. Please try again shortly.';

export interface RetryStatusUpdate {
  phase: 'retrying';
  attempt: number; // 1..MAX_AI_RETRIES
  maxRetries: number;
  delayMs: number;
  message: string;
}

export class AICoachRequestError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    options?: { status?: number; code?: string; retryable?: boolean }
  ) {
    super(message);
    this.name = 'AICoachRequestError';
    this.status = options?.status;
    this.code = options?.code;
    this.retryable = Boolean(options?.retryable);
  }
}

export function isTransientUnavailablePayload(
  status: number,
  payload?: { error?: string; code?: string; retryable?: boolean }
): boolean {
  if (status === 503 || status === 502 || status === 504 || status === 429) {
    return true;
  }
  if (payload?.retryable === true) {
    return true;
  }
  if (
    payload?.code === 'TEMPORARY_UNAVAILABLE' ||
    payload?.code === 'RATE_LIMITED'
  ) {
    return true;
  }
  const msg = (payload?.error || '').toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('temporarily busy') ||
    msg.includes('try again later')
  );
}

export function computeExponentialBackoffMs(
  retryIndex: number,
  baseDelayMs = AI_RETRY_BASE_DELAY_MS,
  jitterMs = 150
): number {
  // retryIndex: 0 -> ~1200ms, 1 -> ~2400ms, 2 -> ~4800ms
  const exponential = baseDelayMs * Math.pow(2, retryIndex);
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
  return exponential + jitter;
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Request aborted', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Request aborted', 'AbortError'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function fetchCoachWithRetry<TResponse>(options: {
  url: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  maxRetries?: number;
  baseDelayMs?: number;
  onRetryStatus?: (status: RetryStatusUpdate) => void;
}): Promise<TResponse> {
  const {
    url,
    body,
    signal,
    maxRetries = MAX_AI_RETRIES,
    baseDelayMs = AI_RETRY_BASE_DELAY_MS,
    onRetryStatus,
  } = options;

  let lastError: AICoachRequestError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Request aborted', 'AbortError');
    }

    const allowFallback = attempt === maxRetries;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          ...body,
          allowFallback,
        }),
        signal,
      });

      const contentType = (resp.headers.get('content-type') || '').toLowerCase();
      const rawText = await resp.text();
      const trimmedText = rawText.trim();
      const looksLikeHtml =
        trimmedText.startsWith('<!doctype') ||
        trimmedText.startsWith('<!DOCTYPE') ||
        trimmedText.startsWith('<html') ||
        trimmedText.startsWith('<');
      const isJsonContentType = contentType.includes('application/json');

      if (!isJsonContentType || looksLikeHtml) {
        const isTransientGatewayStatus =
          resp.status === 502 ||
          resp.status === 503 ||
          resp.status === 504 ||
          resp.status === 429;

        const nonJsonErr = new AICoachRequestError(
          isTransientGatewayStatus
            ? UNAVAILABLE_FINAL_MESSAGE
            : `AI Coach API returned an unexpected non-JSON response (HTTP ${resp.status}). Ensure the backend server is handling /api routes.`,
          {
            status: resp.status,
            code: isTransientGatewayStatus
              ? 'TEMPORARY_UNAVAILABLE'
              : 'NON_JSON_RESPONSE',
            retryable: isTransientGatewayStatus,
          }
        );

        lastError = nonJsonErr;
        if (!nonJsonErr.retryable) {
          throw nonJsonErr;
        }
      } else {
        let payload: Record<string, unknown> = {};
        let parsedValidJson = false;
        try {
          const parsed = trimmedText ? JSON.parse(trimmedText) : {};
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Expected JSON object payload.');
          }
          payload = parsed as Record<string, unknown>;
          parsedValidJson = true;
        } catch {
          const parseErr = new AICoachRequestError(
            'AI Coach API returned malformed JSON data. Please try again.',
            {
              status: resp.status,
              code: 'INVALID_JSON_RESPONSE',
              retryable: resp.status >= 500,
            }
          );
          lastError = parseErr;
          if (!parseErr.retryable) {
            throw parseErr;
          }
        }

        if (parsedValidJson) {
          if (resp.ok) {
            return payload as TResponse;
          }

          const errorText =
            typeof payload.error === 'string' && payload.error.trim()
              ? payload.error.trim()
              : `Request failed with status ${resp.status}.`;
          const errorCode =
            typeof payload.code === 'string' ? payload.code : undefined;
          const retryableFlag =
            typeof payload.retryable === 'boolean' ? payload.retryable : undefined;

          const isTransient = isTransientUnavailablePayload(resp.status, {
            error: errorText,
            code: errorCode,
            retryable: retryableFlag,
          });

          lastError = new AICoachRequestError(
            isTransient ? UNAVAILABLE_FINAL_MESSAGE : errorText,
            {
              status: resp.status,
              code: errorCode,
              retryable: isTransient,
            }
          );

          if (!isTransient) {
            throw lastError;
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      if (err instanceof AICoachRequestError) {
        if (!err.retryable) {
          throw err;
        }
        lastError = err;
      } else {
        // Network error / connection drop
        lastError = new AICoachRequestError(UNAVAILABLE_FINAL_MESSAGE, {
          code: 'NETWORK_UNAVAILABLE',
          retryable: true,
        });
      }
    }

    // Schedule exponential backoff if retries remain
    if (attempt < maxRetries) {
      const delayMs = computeExponentialBackoffMs(attempt, baseDelayMs);
      onRetryStatus?.({
        phase: 'retrying',
        attempt: attempt + 1,
        maxRetries,
        delayMs,
        message: RETRY_BUSY_MESSAGE,
      });
      await sleepWithAbort(delayMs, signal);
    }
  }

  throw (
    lastError ??
    new AICoachRequestError(UNAVAILABLE_FINAL_MESSAGE, {
      status: 503,
      code: 'TEMPORARY_UNAVAILABLE',
      retryable: true,
    })
  );
}
