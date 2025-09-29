const request = require('supertest');
const app = require('./service');
const { DB, Role } = require('./database/database.js');

// Make key variables global
global.request = request;
global.app = app;

// Mock fetch
global.fetch = jest.fn();

beforeAll(async () => {
  try {
    console.log('--- SETUP: Initializing database and creating users... ---');
    await DB.cleanupTestDatabase();

    // Create Admin User
    const adminData = { name: 'Test Admin', email: 'admin@test.com', password: 'password', roles: [{ role: Role.Admin }] };
    await DB.addUser(adminData);
    const adminLogin = await request(app).put('/api/auth').send(adminData);
    global.adminToken = adminLogin.body.token;
    global.adminUser = adminLogin.body.user;

    // Create Diner User
    const dinerData = { name: 'Test Diner', email: 'diner@test.com', password: 'password', roles: [{ role: Role.Diner }] };
    await DB.addUser(dinerData);
    const dinerLogin = await request(app).put('/api/auth').send(dinerData);
    global.dinerToken = dinerLogin.body.token;
    global.dinerUser = dinerLogin.body.user;

    // Create Other Diner User
    const otherDinerData = { name: 'Other Diner', email: 'other@test.com', password: 'password', roles: [{ role: Role.Diner }] };
    await DB.addUser(otherDinerData);
    const otherLogin = await request(app).put('/api/auth').send(otherDinerData);
    global.otherDinerToken = otherLogin.body.token;
    global.otherDinerUser = otherLogin.body.user;

    console.log('--- SETUP: Users created successfully. ---');
  } catch (error) {
    console.error('--- FATAL ERROR IN TEST SETUP ---', error);
    // Force the test process to exit because setup failed
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