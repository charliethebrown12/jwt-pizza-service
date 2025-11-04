const request = require('supertest');
const app = require('./service');
const { DB, Role } = require('./database/database.js');
const jwt = require('jsonwebtoken');
const config = require('./config');

// Make key variables global
global.request = request;
global.app = app;

// Mock fetch
global.fetch = jest.fn();

beforeAll(async () => {
  try {
    console.log('--- SETUP: Initializing database and creating users... ---');

    const isPrimary = process.env.JEST_WORKER_ID === '1' || !process.env.JEST_WORKER_ID;

    const adminData = { name: 'Test Admin', email: 'admin@test.com', password: 'password', roles: [{ role: Role.Admin }] };
    const dinerData = { name: 'Test Diner', email: 'diner@test.com', password: 'password', roles: [{ role: Role.Diner }] };
    const otherDinerData = { name: 'Other Diner', email: 'other@test.com', password: 'password', roles: [{ role: Role.Diner }] };

    if (isPrimary) {
      // Only the primary worker cleans and seeds the DB to avoid races
      await DB.cleanupTestDatabase();

      // Create Admin User
      const adminUserObj = await DB.addUser(adminData);
      const adminToken = jwt.sign(adminUserObj, config.jwtSecret);
      await DB.loginUser(adminUserObj.id, adminToken);
      global.adminToken = adminToken;
      global.adminUser = adminUserObj;

      // Create Diner User
      const dinerUserObj = await DB.addUser(dinerData);
      const dinerToken = jwt.sign(dinerUserObj, config.jwtSecret);
      await DB.loginUser(dinerUserObj.id, dinerToken);
      global.dinerToken = dinerToken;
      global.dinerUser = dinerUserObj;

      // Create Other Diner User
      const otherUserObj = await DB.addUser(otherDinerData);
      const otherToken = jwt.sign(otherUserObj, config.jwtSecret);
      await DB.loginUser(otherUserObj.id, otherToken);
      global.otherDinerToken = otherToken;
      global.otherDinerUser = otherUserObj;

      console.log('--- SETUP: Users created successfully. ---');
    } else {
      // Non-primary workers wait until the primary has created the users.
      // Poll the database directly until the users exist, then create tokens locally.
      const maxAttempts = 40;
      const delayMs = 250;
      let attempt = 0;
      let success = false;

      async function fetchUserByEmail(email) {
        const conn = await DB.getConnection();
        try {
          const rows = await DB.query(conn, 'SELECT id, name, email FROM user WHERE email=?', [email]);
          if (!rows || rows.length === 0) return null;
          const user = rows[0];
          const roles = await DB.query(conn, 'SELECT role, objectId FROM userRole WHERE userId=?', [user.id]);
          user.roles = roles.map((r) => ({ role: r.role, objectId: r.objectId || undefined }));
          return user;
        } finally {
          conn.end();
        }
      }

      while (attempt < maxAttempts && !success) {
        try {
          const adminUserObj = await fetchUserByEmail(adminData.email);
          if (adminUserObj) {
            const adminToken = jwt.sign(adminUserObj, config.jwtSecret);
            await DB.loginUser(adminUserObj.id, adminToken);
            global.adminToken = adminToken;
            global.adminUser = adminUserObj;

            const dinerUserObj = await fetchUserByEmail(dinerData.email);
            const dinerToken = jwt.sign(dinerUserObj, config.jwtSecret);
            await DB.loginUser(dinerUserObj.id, dinerToken);
            global.dinerToken = dinerToken;
            global.dinerUser = dinerUserObj;

            const otherUserObj = await fetchUserByEmail(otherDinerData.email);
            const otherToken = jwt.sign(otherUserObj, config.jwtSecret);
            await DB.loginUser(otherUserObj.id, otherToken);
            global.otherDinerToken = otherToken;
            global.otherDinerUser = otherUserObj;

            success = true;
            break;
          }
        } catch {
          // likely user not created yet; wait and retry
        }
        // wait
        await new Promise((r) => setTimeout(r, delayMs));
        attempt += 1;
      }

      if (!success) {
        throw new Error('Timed out waiting for test users to be created by primary worker');
      }
    }
  } catch (error) {
    console.error('--- FATAL ERROR IN TEST SETUP ---', error);
    // Force the test process to exit because setup failed
    throw error;
  }
});

beforeEach(() => {
  fetch.mockClear();
});

afterAll(async () => {
  // It's good practice to close the database connection pool if your DB class supports it.
  // If your DB.js doesn't have a method like this, you can remove this line.
  if (DB.pool) {
    await DB.pool.end();
  }
});