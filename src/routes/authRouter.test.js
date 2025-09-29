describe('Auth API', () => {
  describe('POST /api/auth (Register)', () => {
    test('should register a new user successfully', async () => {
      const newUser = {
        name: 'New Register',
        email: `newuser_${Date.now()}@test.com`,
        password: 'password123',
      };

      const res = await request(app).post('/api/auth').send(newUser);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(newUser.email);
      expect(res.body.token).toBeDefined();
    });

    test('should fail to register with missing fields', async () => {
      const incompleteUser = { name: 'Incomplete' }; // Missing email and password
      const res = await request(app).post('/api/auth').send(incompleteUser);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('name, email, and password are required');
    });
  });

  describe('PUT /api/auth (Login)', () => {
    test('should login an existing user successfully', async () => {
      const loginCredentials = { email: dinerUser.email, password: 'password' }; // Using the password from setup
      const res = await request(app).put('/api/auth').send(loginCredentials);

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(dinerUser.id);
      expect(res.body.token).toBeDefined();
    });

    test('should fail to login with an incorrect password', async () => {
      const loginCredentials = { email: dinerUser.email, password: 'wrongpassword' };
      const res = await request(app).put('/api/auth').send(loginCredentials);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('unknown user');
    });

    test('should fail to login if user does not exist', async () => {
      const loginCredentials = { email: 'nosuchuser@test.com', password: 'password' };
      const res = await request(app).put('/api/auth').send(loginCredentials);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('unknown user');
    });
  });

  describe('DELETE /api/auth (Logout)', () => {
    test('should logout an authenticated user successfully', async () => {
      // First, log in a user to get a fresh token
      const loginCredentials = { email: otherDinerUser.email, password: 'password' };
      const loginRes = await request(app).put('/api/auth').send(loginCredentials);
      const tokenToLogout = loginRes.body.token;

      // Now, use that token to log out
      const logoutRes = await request(app)
        .delete('/api/auth')
        .set('Authorization', `Bearer ${tokenToLogout}`);
      
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.message).toBe('logout successful');
    });

    test('should fail to logout without an auth token', async () => {
      const res = await request(app).delete('/api/auth');
      expect(res.status).toBe(401);
    });
  });
});