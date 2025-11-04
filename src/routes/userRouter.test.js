describe('User API', () => {
  describe('GET /api/user/me', () => {
    test('should get the authenticated user\'s details', async () => {
      const res = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${dinerToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.email).toBe(dinerUser.email);
    });
  });

  describe('PUT /api/user/:userId', () => {
    test('should allow a user to update their own name', async () => {
      const updatedInfo = { name: 'Updated Diner Name' };
      const res = await request(app)
        .put(`/api/user/${dinerUser.id}`)
        .set('Authorization', `Bearer ${dinerToken}`)
        .send(updatedInfo);
      
      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Updated Diner Name');
    });

    test('should forbid a user from updating another user\'s profile', async () => {
      const updatedInfo = { name: 'Malicious Update' };
      const res = await request(app)
        .put(`/api/user/${adminUser.id}`) // Diner trying to update Admin
        .set('Authorization', `Bearer ${dinerToken}`)
        .send(updatedInfo);
      
      expect(res.status).toBe(403);
    });

    test('should allow an admin to update any user\'s profile', async () => {
        const updatedInfo = { name: 'Admin Updated Name' };
        const res = await request(app)
          .put(`/api/user/${dinerUser.id}`) // Admin updating Diner
          .set('Authorization', `Bearer ${adminToken}`)
          .send(updatedInfo);
        
        expect(res.body.user.name).toBe('Admin Updated Name');
    });
    test('list users unauthorized', async () => {
      const listUsersRes = await request(app).get('/api/user');
      expect(listUsersRes.status).toBe(401);
    });

    test('list users forbidden for non-admin', async () => {
      const [userToken] = await registerUser(request(app));
      const listUsersRes = await request(app)
        .get('/api/user')
        .set('Authorization', 'Bearer ' + userToken);
      expect(listUsersRes.status).toBe(401);
    });

    test('list users by admin', async () => {
      const listUsersRes = await request(app)
        .get('/api/user')
        .set('Authorization', 'Bearer ' + adminToken);
    });

    test('delete user unauthorized', async () => {
      const [user, userToken] = await registerUser(request(app));
      const deleteRes = await request(app).delete(`/api/user/${user.id}`).set('Authorization', 'Bearer ' + userToken);
      expect(deleteRes.status).toBe(403);
    });

    test('delete user by admin', async () => {
      const [user] = await registerUser(request(app));
      const deleteRes = await request(app).delete(`/api/user/${user.id}`).set('Authorization', 'Bearer ' + adminToken);
    });

    async function registerUser(service) {
      const testUser = {
        name: 'pizza diner',
        email: `${randomName()}@test.com`,
        password: 'a',
      };
      const registerRes = await service.post('/api/auth').send(testUser);
      registerRes.body.user.password = testUser.password;

      return [registerRes.body.user, registerRes.body.token];
    }

    function randomName() {
      return Math.random().toString(36).substring(2, 12);
    }
      });
});