const express = require('express');
const { authRouter, setAuthUser } = require('./routes/authRouter.js');
const orderRouter = require('./routes/orderRouter.js');
const franchiseRouter = require('./routes/franchiseRouter.js');
const userRouter = require('./routes/userRouter.js');
const version = require('./version.json');
const config = require('./config.js');
const logger = require('./logger');

const app = express();

// Install HTTP logger BEFORE any other middleware/routers
app.use(logger.httpLogger);

app.use(express.json());
app.use(setAuthUser);
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

const apiRouter = express.Router();
app.use('/api', apiRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/user', userRouter);
apiRouter.use('/order', orderRouter);
apiRouter.use('/franchise', franchiseRouter);

apiRouter.use('/docs', (req, res) => {
  res.json({
    version: version.version,
    endpoints: [...authRouter.docs, ...userRouter.docs, ...orderRouter.docs, ...franchiseRouter.docs],
    config: { factory: config.factory.url, db: config.db.connection.host },
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'welcome to JWT Pizza',
    version: version.version,
  });
});

// Expose Prometheus-style metrics endpoint if metrics helper is available
const metrics = require('./metrics');
app.get('/metrics', (req, res) => {
  if (metrics && typeof metrics.prometheusExposition === 'function') {
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics.prometheusExposition());
  } else {
    res.status(404).send('metrics not available');
  }
});

app.use('*', (req, res) => {
  res.status(404).json({
    message: 'unknown endpoint',
  });
});

// Default error handler for all exceptions and errors.
app.use((err, req, res, next) => {
  res.status(err.statusCode ?? 500).json({ message: err.message, stack: err.stack });
  next();
});

// Example helper used wherever you call the factory:
async function callPizzaFactory(payload) {
  const started = Date.now();
  let ok = false;
  let responseBody;
  try {
    const f = typeof fetch === 'function' ? fetch : (await import('node-fetch')).default;
    const res = await f(`${config.factory.url}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.factory.apiKey,
      },
      body: JSON.stringify(payload),
    });
    responseBody = await res.json().catch(() => ({}));
    ok = res.ok;
    await logger.logFactory(payload, responseBody, Date.now() - started, ok, ok ? undefined : `${res.status} ${res.statusText}`);
    if (!res.ok) {
      const err = new Error('Factory request failed');
      err.status = res.status;
      err.body = responseBody;
      throw err;
    }
    return responseBody;
  } catch (err) {
    await logger.logFactory(payload, responseBody, Date.now() - started, false, err.message);
    throw err;
  }
}
// Mark as used and export to avoid ESLint no-unused-vars
module.exports.callPizzaFactory = callPizzaFactory;

// Export or use callPizzaFactory inside your order creation logic.

module.exports = app;
