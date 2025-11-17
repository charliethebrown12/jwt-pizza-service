const config = require('./config');

const SAFE_ENV =
  process.env.NODE_ENV === 'test' ||
  process.env.LOGGING_ENABLED === 'false';

function hasLoggingConfig() {
  const c = config.logging || {};
  return Boolean(c.url && c.apiKey && (c.userId || String(c.userId) === '0') && c.source);
}

function b64(s) {
  return Buffer.from(s).toString('base64');
}

function sanitize(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);

  const hidden = new Set(['password', 'pwd', 'token', 'authorization', 'apiKey', 'apikey', 'jwt']);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (hidden.has(k.toLowerCase())) {
      out[k] = '***';
    } else {
      out[k] = sanitize(v);
    }
  }
  return out;
}

async function sendToLoki(streams) {
  if (SAFE_ENV || !hasLoggingConfig()) return;
  const { url, apiKey, userId } = config.logging;

  const payload = { streams };
  const auth = b64(`${userId}:${apiKey}`);

  const f = typeof fetch === 'function' ? fetch : (await import('node-fetch')).default;

  const res = await f(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    // keep quiet in production, but do not throw to avoid impacting requests
    if (process.env.NODE_ENV !== 'production') {
      const text = await res.text().catch(() => '');
      console.warn('Loki push failed:', res.status, res.statusText, text);
    }
  }
}

function nowNs() {
  return (BigInt(Math.floor(Date.now() / 1000)) * 1000000000n).toString();
}

function httpLogger(req, res, next) {
  const start = Date.now();
  const hasAuth = Boolean(req.headers?.authorization);

  // capture response body
  let responseBody;
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };
  res.send = (body) => {
    responseBody = body;
    return originalSend(body);
  };

  res.once('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const source = (config.logging && config.logging.source) || 'jwt-pizza-service-dev';

    const labels = {
      source,
      level: status >= 500 ? 'error' : 'info',
      kind: 'http',
      method: req.method,
      path: req.baseUrl ? `${req.baseUrl}${req.route?.path || ''}` : (req.route?.path || req.path || req.originalUrl || '/'),
      status: String(status),
      hasAuth: hasAuth ? 'true' : 'false',
    };

    const entry = {
      method: req.method,
      path: req.originalUrl,
      status,
      hasAuth,
      durationMs: ms,
      requestBody: sanitize(req.body),
      responseBody: sanitize(responseBody),
    };

    const streams = [{
      stream: labels,
      values: [[nowNs(), JSON.stringify(entry)]],
    }];

    sendToLoki(streams).catch(() => {});
  });

  next();
}

async function logDb(sql, params, durationMs, ok, errorMsg) {
  const source = (config.logging && config.logging.source) || 'jwt-pizza-service-dev';
  const labels = {
    source,
    level: ok ? 'info' : 'error',
    kind: 'db',
  };
  const entry = {
    sql,
    params: sanitize(params),
    durationMs,
    ok,
    error: ok ? undefined : String(errorMsg || ''),
  };
  const streams = [{
    stream: labels,
    values: [[nowNs(), JSON.stringify(entry)]],
  }];
  return sendToLoki(streams);
}

async function logFactory(requestBody, responseBody, durationMs, ok, errorMsg) {
  const source = (config.logging && config.logging.source) || 'jwt-pizza-service-dev';
  const labels = {
    source,
    level: ok ? 'info' : 'error',
    kind: 'factory',
  };
  const entry = {
    request: sanitize(requestBody),
    response: sanitize(responseBody),
    durationMs,
    ok,
    error: ok ? undefined : String(errorMsg || ''),
  };
  const streams = [{
    stream: labels,
    values: [[nowNs(), JSON.stringify(entry)]],
  }];
  return sendToLoki(streams);
}

module.exports = {
  httpLogger,
  logDb,
  logFactory,
};