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

let testUser = { name: 'pizza diner', email: '', password: 'a' };
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

test('service health check', async () => {
  const res = await request(app).get('/');
  expect(res.status).toBe(200);
  expect(res.text).toBe('Service is running');
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);

  const { password, ...user } = { ...testUser, roles: [{ role: 'diner' }] };
  expect(loginRes.body.user).toMatchObject(user);
});
