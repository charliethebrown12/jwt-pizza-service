const request = require('supertest');
const app = require('../service'); // your Express app
const { DB, Role } = require('../database/database.js');

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
  let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + '@admin.com';
  user = await DB.addUser(user);
  return { ...user, password: 'toomanysecrets' };
}

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5);
}

describe('franchiseRouter', () => {
  let adminUser, adminToken;

  beforeAll(async () => {
    adminUser = await createAdminUser();

    // login admin
    const loginRes = await request(app).put('/api/auth').send({
      email: adminUser.email,
      password: adminUser.password,
    });

    expect(loginRes.status).toBe(200);
    adminToken = loginRes.body.token;
  });

  test('GET /api/franchise (no auth)', async () => {
    const res = await request(app).get('/api/franchise?page=0&limit=10');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('franchises');
    expect(Array.isArray(res.body.franchises)).toBe(true);
    expect(res.body).toHaveProperty('more');
  });

  test('POST /api/franchise (admin)', async () => {
    const name = 'fran-' + randomName();
    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name, admins: [{ email: adminUser.email }] });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toMatchObject({ name });
  });

  test('POST /api/franchise (non-admin forbidden)', async () => {
    // create diner
    const diner = {
      name: randomName(),
      email: randomName() + '@test.com',
      password: 'pw',
    };
    await request(app).post('/api/auth').send(diner);
    const loginRes = await request(app).put('/api/auth').send(diner);
    const dinerToken = loginRes.body.token;

    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${dinerToken}`)
      .send({ name: 'badFran-' + randomName() });

    expect(res.status).toBe(403);
  });

  test('GET /api/franchise/:userId (self)', async () => {
    const res = await request(app)
      .get(`/api/franchise/${adminUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/franchise/:franchiseId/store (admin)', async () => {
    // first create franchise
    const franName = 'franStore-' + randomName();
    const franRes = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: franName, admins: [{ email: adminUser.email }] });

    const franId = franRes.body.id;

    const res = await request(app)
      .post(`/api/franchise/${franId}/store`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'SLC' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toMatchObject({ name: 'SLC' });
  });

  test('DELETE /api/franchise/:franchiseId/store/:storeId (admin)', async () => {
    // create franchise with store
    const franName = 'franDel-' + randomName();
    const franRes = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: franName, admins: [{ email: adminUser.email }] });
    const franId = franRes.body.id;

    const storeRes = await request(app)
      .post(`/api/franchise/${franId}/store`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'NYC' });
    const storeId = storeRes.body.id;

    const res = await request(app)
      .delete(`/api/franchise/${franId}/store/${storeId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'store deleted' });
  });

  test('DELETE /api/franchise/:franchiseId (admin)', async () => {
    const franName = 'franKill-' + randomName();
    const franRes = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: franName, admins: [{ email: adminUser.email }] });
    const franId = franRes.body.id;

    const res = await request(app).delete(`/api/franchise/${franId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'franchise deleted' });
  });
});
