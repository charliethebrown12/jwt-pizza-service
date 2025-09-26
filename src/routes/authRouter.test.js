const request = require('supertest');
const app = require('../service');
const { DB } = require('../database/database.js');

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function cleanup() {
  const conn = await DB.getConnection();
  await conn.query('DELETE FROM users');
  await conn.end();
}

const testUser = { name: 'pizza diner', email: '', password: 'a' };
let testUserAuthToken;

beforeAll(async () => {
  testUser.email = randomName() + '@test.com';
  await cleanup();

  const registerRes = await request(app).post('/api/auth').send(testUser);
  expect(registerRes.status).toBe(200);
  testUserAuthToken = registerRes.body.token;
});

afterAll(async () => {
  await cleanup();
});

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expectValidJwt(loginRes.body.token);

  const { password, ...user } = { ...testUser, roles: [{ role: 'diner' }] };
  expect(loginRes.body.user).toMatchObject(user);
});

test('logout', async () => {
  const logoutRes = await request(app)
    .delete('/api/auth')
    .set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(logoutRes.status).toBe(200);
  expect(logoutRes.body.message).toBe('logout successful');
});

test('logout without auth fails', async () => {
  const logoutRes = await request(app).delete('/api/auth');
  expect(logoutRes.status).toBe(401);
  expect(logoutRes.body.message).toBe('unauthorized');
});

test('register without required fields fails', async () => {
  const registerRes = await request(app).post('/api/auth').send({ name: 'a' });
  expect(registerRes.status).toBe(400);
  expect(registerRes.body.message).toBe('name, email, and password are required');
});

test('login with bad credentials fails', async () => {
  const loginRes = await request(app).put('/api/auth').send({ email: 'x', password: 'y' });
  expect(loginRes.status).toBe(500);
});

test('register with duplicate email fails', async () => {
  const registerRes = await request(app).post('/api/auth').send(testUser);
  expect(registerRes.status).toBe(500);
});

test('login with missing fields fails', async () => {
  const loginRes = await request(app).put('/api/auth').send({ email: 'x' });
  expect(loginRes.status).toBe(500);
});

test('login with wrong password fails', async () => {
  const loginRes = await request(app).put('/api/auth').send({ email: testUser.email, password: 'x' });
  expect(loginRes.status).toBe(500);
});
