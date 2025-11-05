const os = require('os');
const config = require('./config');

const btoa = (str) => Buffer.from(str).toString('base64');

class MetricsBuilder {
  constructor(source) {
    this.source = source;
    this.lines = [];
  }

  static esc(str) {
    return String(str).replace(/ /g, '\\ ').replace(/,/g, '\\,').replace(/=/g, '\\=');
  }

  addMetric(name, value, tags = {}) {
    if (value === undefined || value === null || Number.isNaN(Number(value))) return;
    const ts = Date.now() * 1e6; // ns
    const allTags = { source: this.source, ...tags };
    const tagStr = Object.entries(allTags)
      .map(([k, v]) => `${MetricsBuilder.esc(k)}=${MetricsBuilder.esc(v)}`)
      .join(',');
    const line = `${MetricsBuilder.esc(name)}${tagStr ? ',' + tagStr : ''} value=${Number(value)} ${ts}`;
    this.lines.push(line);
  }

  async sendToGrafana(url, basicAuthValue) {
    if (!this.lines.length) return;
    const body = this.lines.join('\n');

    const doFetch = async () => {
      if (typeof fetch === 'function') return fetch;
      const mod = await import('node-fetch');
      return mod.default;
    };

    const f = await doFetch();
    const res = await f(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuthValue}`,
        'Content-Type': 'text/plain',
      },
      body,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Grafana metrics push failed: ${res.status} ${res.statusText} ${txt}`);
    }
  }
}

// In-memory aggregation
let metricsStore = {
  httpRequests: { GET: 0, POST: 0, PUT: 0, DELETE: 0, OTHER: 0 },
  authAttempts: { success: 0, fail: 0 },
  activeUsers: new Set(),
  pizzaPurchases: { sold: 0, failed: 0, revenue: 0 },
  pizzaLatency: { sum: 0, count: 0 },
  endpointLatencyAll: { sum: 0, count: 0 },
  endpointLatencyByPath: new Map(), // path -> {sum, count}
};

function resetMetricsStore() {
  metricsStore.httpRequests = { GET: 0, POST: 0, PUT: 0, DELETE: 0, OTHER: 0 };
  metricsStore.authAttempts = { success: 0, fail: 0 };
  metricsStore.activeUsers.clear();
  metricsStore.pizzaPurchases = { sold: 0, failed: 0, revenue: 0 };
  metricsStore.pizzaLatency = { sum: 0, count: 0 };
  metricsStore.endpointLatencyAll = { sum: 0, count: 0 };
  metricsStore.endpointLatencyByPath = new Map();
}

// System metrics
function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return parseFloat((cpuUsage * 100).toFixed(2));
}

function getMemoryUsagePercentage() {
  const total = os.totalmem();
  const free = os.freemem();
  return parseFloat((((total - free) / total) * 100).toFixed(2));
}

// Send batch
async function sendMetrics() {
  try {
    const cfg = config.metrics || {};
    const { url, apiKey, source } = cfg;

    if (!url || !apiKey || !source) return; // no-op if not configured

    const authHeader = btoa(apiKey); // "USER:KEY"
    const builder = new MetricsBuilder(source);

    // 1) HTTP requests by method + total
    let totalRequests = 0;
    for (const [method, count] of Object.entries(metricsStore.httpRequests)) {
      builder.addMetric('http_requests_total', count, { method });
      totalRequests += count;
    }
    builder.addMetric('http_requests_total', totalRequests, { method: 'ALL' });

    // 2) Auth attempts
    builder.addMetric('auth_attempts_total', metricsStore.authAttempts.success, { status: 'success' });
    builder.addMetric('auth_attempts_total', metricsStore.authAttempts.fail, { status: 'failed' });

    // 3) Active users (unique in the interval)
    builder.addMetric('active_users', metricsStore.activeUsers.size);

    // 4) System
    builder.addMetric('cpu_usage_percent', getCpuUsagePercentage());
    builder.addMetric('memory_usage_percent', getMemoryUsagePercentage());

    // 5) Pizza metrics
    builder.addMetric('pizzas_sold_total', metricsStore.pizzaPurchases.sold);
    builder.addMetric('pizza_failures_total', metricsStore.pizzaPurchases.failed);
    builder.addMetric('pizza_revenue_total', metricsStore.pizzaPurchases.revenue);

    // 6) Latencies
    const avgPizzaLatency =
      metricsStore.pizzaLatency.count > 0
        ? metricsStore.pizzaLatency.sum / metricsStore.pizzaLatency.count
        : 0;
    builder.addMetric('pizza_creation_latency_ms', parseFloat(avgPizzaLatency.toFixed(2)));

    const avgAllEndpoints =
      metricsStore.endpointLatencyAll.count > 0
        ? metricsStore.endpointLatencyAll.sum / metricsStore.endpointLatencyAll.count
        : 0;
    builder.addMetric('endpoint_latency_ms', parseFloat(avgAllEndpoints.toFixed(2)), { endpoint: 'ALL' });

    for (const [endpoint, agg] of metricsStore.endpointLatencyByPath.entries()) {
      const avg = agg.count > 0 ? agg.sum / agg.count : 0;
      builder.addMetric('endpoint_latency_ms', parseFloat(avg.toFixed(2)), { endpoint });
    }

    await builder.sendToGrafana(url, authHeader);
    resetMetricsStore();
    if (process.env.NODE_ENV !== 'test') {
      // Keep logs quiet in tests
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Error sending metrics', err.message);
    }
    // Do not reset store on error; attempt to resend next tick with accumulated data
  }
}

// Only enable periodic sending when not in tests and config present.
// You can override with METRICS_ENABLED=false to disable.
const SHOULD_ENABLE =
  process.env.NODE_ENV !== 'test' &&
  process.env.METRICS_ENABLED !== 'false';

if (SHOULD_ENABLE) {
  const METRICS_INTERVAL_MS = Number(process.env.METRICS_INTERVAL_MS || 10000);
  setInterval(sendMetrics, METRICS_INTERVAL_MS);
}

function getEndpointKey(req) {
  // Prefer route path (parameterized), fall back to path
  const routePath = req.route && req.route.path ? req.route.path : req.path;
  const base = req.baseUrl || '';
  return (base + routePath) || req.originalUrl || 'unknown';
}

module.exports = {
  // Middleware to track HTTP requests, active users, and endpoint latency
  requestTracker: (req, res, next) => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const ms = Number(end - start) / 1e6;

      // Method count
      const method = ['GET', 'POST', 'PUT', 'DELETE'].includes(req.method) ? req.method : 'OTHER';
      metricsStore.httpRequests[method] = (metricsStore.httpRequests[method] || 0) + 1;

      // Active users (unique within interval)
      if (req.user) {
        const id = req.user.id || req.user.email || req.user.name;
        if (id) metricsStore.activeUsers.add(String(id));
      }

      // Endpoint latency
      metricsStore.endpointLatencyAll.sum += ms;
      metricsStore.endpointLatencyAll.count += 1;

      const key = getEndpointKey(req);
      let agg = metricsStore.endpointLatencyByPath.get(key);
      if (!agg) {
        agg = { sum: 0, count: 0 };
        metricsStore.endpointLatencyByPath.set(key, agg);
      }
      agg.sum += ms;
      agg.count += 1;
    });

    next();
  },

  // Track auth success/failure (call in auth routes)
  trackAuthAttempt: (isSuccess) => {
    if (isSuccess) {
      metricsStore.authAttempts.success += 1;
    } else {
      metricsStore.authAttempts.fail += 1;
    }
  },

  // Track pizza purchases (call in order routes)
  trackPizzaPurchase: (success, latencyMs, price) => {
    if (success) {
      metricsStore.pizzaPurchases.sold += 1;
      metricsStore.pizzaPurchases.revenue += Number(price || 0);
    } else {
      metricsStore.pizzaPurchases.failed += 1;
    }
    if (latencyMs !== undefined && latencyMs !== null) {
      metricsStore.pizzaLatency.sum += Number(latencyMs);
      metricsStore.pizzaLatency.count += 1;
    }
  },
  // Produce a Prometheus exposition-format text snapshot of current metrics (without resetting the store)
  prometheusExposition: () => {
    const lines = [];
    // helper to add a metric with optional labels
    const add = (name, value, labels = {}) => {
      const labelStr = Object.keys(labels)
        .map((k) => `${k}="${String(labels[k]).replace(/"/g, '\\"')}"`)
        .join(',');
      lines.push(`${name}${labelStr ? '{' + labelStr + '}' : ''} ${Number(value)}`);
    };

    // copy current store snapshot (avoid mutation)
    const httpReqs = { ...metricsStore.httpRequests };
    let totalRequests = 0;
    for (const [m, c] of Object.entries(httpReqs)) {
      add('http_requests_total', c, { method: m });
      totalRequests += c;
    }
    add('http_requests_total', totalRequests, { method: 'ALL' });

    add('auth_attempts_success_total', metricsStore.authAttempts.success);
    add('auth_attempts_fail_total', metricsStore.authAttempts.fail);

    add('active_users', metricsStore.activeUsers.size);

    add('cpu_usage_percent', getCpuUsagePercentage());
    add('memory_usage_percent', getMemoryUsagePercentage());

    add('pizzas_sold_total', metricsStore.pizzaPurchases.sold);
    add('pizza_failures_total', metricsStore.pizzaPurchases.failed);
    add('pizza_revenue_total', metricsStore.pizzaPurchases.revenue);

    const avgPizzaLatency = metricsStore.pizzaLatency.count > 0 ? metricsStore.pizzaLatency.sum / metricsStore.pizzaLatency.count : 0;
    add('pizza_creation_latency_ms', parseFloat(avgPizzaLatency.toFixed(2)));

    const avgAllEndpoints = metricsStore.endpointLatencyAll.count > 0 ? metricsStore.endpointLatencyAll.sum / metricsStore.endpointLatencyAll.count : 0;
    add('endpoint_latency_ms', parseFloat(avgAllEndpoints.toFixed(2)), { endpoint: 'ALL' });

    for (const [endpoint, agg] of metricsStore.endpointLatencyByPath.entries()) {
      const avg = agg.count > 0 ? agg.sum / agg.count : 0;
      // sanitize endpoint label value
      add('endpoint_latency_ms', parseFloat(avg.toFixed(2)), { endpoint });
    }

    // add a timestamp line comment
    lines.unshift(`# Metrics snapshot ${new Date().toISOString()}`);
    return lines.join('\n') + '\n';
  },
};