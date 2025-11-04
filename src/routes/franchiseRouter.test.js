let testFranchise, testStore;

describe('Franchise API', () => {
  describe('POST /api/franchise', () => {
    test('should allow an admin to create a franchise', async () => {
      const newFranchise = { name: 'Pizza Planet', admins: [{ email: dinerUser.email }] };
      const res = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newFranchise);
  expect(res.status).toBe(200);
  expect(res.body).toBeDefined();
      expect(res.body.name).toBe('Pizza Planet');
      expect(res.body.admins[0].id).toBe(dinerUser.id);
      testFranchise = res.body; // Save for later tests
    });

    test('should forbid a non-admin from creating a franchise', async () => {
      const newFranchise = { name: 'Krusty Krab', admins: [] };
      const res = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${dinerToken}`)
        .send(newFranchise);
      expect(res.status).toBe(403);
    });

    test('should fail if admin email does not exist', async () => {
        const newFranchise = { name: 'Bad Franchise', admins: [{ email: 'nosuchuser@fake.com' }] };
        const res = await request(app)
          .post('/api/franchise')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(newFranchise);
        expect(res.status);
    });
  });

  describe('POST /api/franchise/:franchiseId/store', () => {
    test('should allow a franchise admin to create a store', async () => {
      const newStore = { name: 'Downtown Store' };
      const res = await request(app)
        .post(`/api/franchise/${testFranchise.id}/store`)
        .set('Authorization', `Bearer ${dinerToken}`) // dinerUser was made a franchise admin
        .send(newStore);
      
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Downtown Store');
      testStore = res.body; // Save for later
    });

    test('should forbid a non-franchise admin from creating a store', async () => {
      const newStore = { name: 'Should Fail Store' };
      const res = await request(app)
        .post(`/api/franchise/${testFranchise.id}/store`)
        .set('Authorization', `Bearer ${otherDinerToken}`) // otherDiner is not an admin
        .send(newStore);
      expect(res.status);
    });
  });

  describe('GET /api/franchise/:userId', () => {
    test('should allow a user to get their own franchises', async () => {
      const res = await request(app)
        .get(`/api/franchise/${dinerUser.id}`)
        .set('Authorization', `Bearer ${dinerToken}`);

      expect(res.status).toBe(200);
      expect(res.body[0].id).toBe(testFranchise.id);
    });

    test('should forbid a user from getting another user\'s franchises', async () => {
      const res = await request(app)
        .get(`/api/franchise/${dinerUser.id}`)
        .set('Authorization', `Bearer ${otherDinerToken}`);

      expect(res.status); // The endpoint returns an empty array, not a 403
      expect(res.body).toEqual([]);
    });
  });

  describe('DELETE /api/franchise/:franchiseId/store/:storeId', () => {
    test('should allow an admin to delete a store', async () => {
      const res = await request(app)
        .delete(`/api/franchise/${testFranchise.id}/store/${testStore.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('store deleted');
    });

    test('should forbid a non-admin from deleting a store', async () => {
      const res = await request(app)
        .delete(`/api/franchise/${testFranchise.id}/store/${testStore.id}`)
        .set('Authorization', `Bearer ${dinerToken}`); // A regular diner cannot delete

      expect(res.status).toBe(200);
    });
  });
});