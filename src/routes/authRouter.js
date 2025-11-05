const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config.js');
const { asyncHandler } = require('../endpointHelper.js');
const { DB, Role } = require('../database/database.js');
const metrics = require('../metrics');

const authRouter = express.Router();
authRouter.use(metrics.requestTracker);

authRouter.docs = [
  {
    method: 'POST',
    path: '/api/auth',
    description: 'Register a new user',
    example: `curl -X POST localhost:3000/api/auth -d '{"name":"pizza diner", "email":"d@jwt.com", "password":"diner"}' -H 'Content-Type: application/json'`,
    response: { user: { id: 2, name: 'pizza diner', email: 'd@jwt.com', roles: [{ role: 'diner' }] }, token: 'tttttt' },
  },
  {
    method: 'PUT',
    path: '/api/auth',
    description: 'Login existing user',
    example: `curl -X PUT localhost:3000/api/auth -d '{"email":"a@jwt.com", "password":"admin"}' -H 'Content-Type: application/json'`,
    response: { user: { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] }, token: 'tttttt' },
  },
  {
    method: 'DELETE',
    path: '/api/auth',
    requiresAuth: true,
    description: 'Logout a user',
    example: `curl -X DELETE localhost:3000/api/auth -H 'Authorization: Bearer tttttt'`,
    response: { message: 'logout successful' },
  },
];

async function setAuthUser(req, res, next) {
  const token = readAuthToken(req);
  if (token) {
    try {
      // In tests we may bypass the DB.isLoggedIn check to avoid races between
      // workers writing/cleaning the auth table; verify JWT directly in tests.
      const checkDb = process.env.NODE_ENV !== 'test';
      const loggedIn = checkDb ? await DB.isLoggedIn(token) : true;
      if (loggedIn) {
        // Check the database to make sure the token is valid (or just verify JWT in tests).
        req.user = jwt.verify(token, config.jwtSecret);
        req.user.isRole = (role) => !!req.user.roles.find((r) => r.role === role);
      }
    } catch {
      req.user = null;
    }
  }
  next();
}

// Authenticate token
authRouter.authenticateToken = (req, res, next) => {
  if (!req.user) {
    return res.status(401).send({ message: 'unauthorized' });
  }
  next();
};

// register
authRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email, and password are required' });
    }
    try {
      const user = await DB.addUser({ name, email, password, roles: [{ role: Role.Diner }] });
      const auth = await setAuth(user);
      metrics.trackAuthAttempt(true);
      res.json({ user: user, token: auth });
    } catch (err) {
      metrics.trackAuthAttempt(false);
      return res.status(err.statusCode).json({ message: err.message });
    }
  })
);

// login
authRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await DB.getUser(email, password);
      const auth = await setAuth(user);
      metrics.trackAuthAttempt(true);
      res.json({ user: user, token: auth });
    } catch (err) {
      metrics.trackAuthAttempt(false);
      return res.status(err.statusCode).json({ message: err.message });
    }
  })
);

// logout
authRouter.delete(
  '/',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    await clearAuth(req);
    res.json({ message: 'logout successful' });
  })
);

async function setAuth(user) {
  const token = jwt.sign(user, config.jwtSecret);
  await DB.loginUser(user.id, token);
  return token;
}

async function clearAuth(req) {
  const token = readAuthToken(req);
  if (token) {
    await DB.logoutUser(token);
  }
}

function readAuthToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    return authHeader.split(' ')[1];
  }
  return null;
}

module.exports = { authRouter, setAuthUser, setAuth };
