import * as webpush from 'web-push';

function getVapidEnv() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || '';
  const subject =
    process.env.VAPID_SUBJECT?.trim() || 'mailto:notifications@projectrebuildme.app';
  const configured = Boolean(publicKey && privateKey);
  const cronConfigured = Boolean(
    configured && process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  );
  return { publicKey, privateKey, subject, configured, cronConfigured };
}

export function handleGetVapidPublicKey() {
  const env = getVapidEnv();
  if (!env.configured) {
    return {
      status: 200,
      payload: {
        configured: false,
        publicKey: null,
        cronConfigured: false,
        message:
          'Web Push VAPID keys are not configured on the server yet. In-app & Browser notifications still work whenever the app is open; set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in environment variables to enable encrypted Web Push delivery.',
      },
    };
  }

  return {
    status: 200,
    payload: {
      configured: true,
      publicKey: env.publicKey,
      cronConfigured: env.cronConfigured,
    },
  };
}

export async function handleSendTestPush(body: {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  title?: string;
  body?: string;
  taskId?: string;
  url?: string;
}) {
  const env = getVapidEnv();
  if (!env.configured) {
    return {
      status: 400,
      payload: {
        success: false,
        code: 'VAPID_NOT_CONFIGURED',
        error:
          'Server Web Push requires VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.',
      },
    };
  }

  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return {
      status: 400,
      payload: {
        success: false,
        code: 'INVALID_SUBSCRIPTION',
        error: 'Valid PushSubscription endpoint and encryption keys (p256dh, auth) are required.',
      },
    };
  }

  try {
    webpush.setVapidDetails(env.subject, env.publicKey, env.privateKey);
    const payloadStr = JSON.stringify({
      title: body.title || 'Project Rebuild Me — Test Push',
      body: body.body || 'Web Push delivery is active for this device.',
      tag: 'rebuild-me-test-push',
      url: body.url || '/',
      taskId: body.taskId || '',
    });

    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
        },
      },
      payloadStr,
      { TTL: 60 }
    );

    return {
      status: 200,
      payload: {
        success: true,
        delivered: true,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to deliver Web Push message.';
    return {
      status: 500,
      payload: {
        success: false,
        code: 'PUSH_DELIVERY_FAILED',
        error: msg,
      },
    };
  }
}

export async function handlePushCron(authHeader?: string) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (expectedSecret) {
    const provided = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    if (provided !== expectedSecret) {
      return {
        status: 401,
        payload: {
          success: false,
          code: 'UNAUTHORIZED',
          error: 'Invalid or missing CRON_SECRET bearer token.',
        },
      };
    }
  }

  const env = getVapidEnv();
  if (!env.configured || !process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
    return {
      status: 200,
      payload: {
        success: false,
        code: 'BACKGROUND_CRON_NOT_CONFIGURED',
        configured: false,
        missing: [
          ...(!env.publicKey ? ['VAPID_PUBLIC_KEY'] : []),
          ...(!env.privateKey ? ['VAPID_PRIVATE_KEY'] : []),
          ...(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
            ? ['FIREBASE_SERVICE_ACCOUNT_JSON']
            : []),
        ],
        message:
          'Server background Web Push cron requires VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, and FIREBASE_SERVICE_ACCOUNT_JSON environment variables configured in Vercel.',
      },
    };
  }

  // Note: If service account credentials are provided in Vercel, Firestore Admin lookup
  // would execute here. Since Firebase Admin SDK is intentionally omitted until a service
  // account is provisioned, report readiness status cleanly.
  return {
    status: 200,
    payload: {
      success: true,
      configured: true,
      message: 'Web Push VAPID configuration present.',
    },
  };
}
