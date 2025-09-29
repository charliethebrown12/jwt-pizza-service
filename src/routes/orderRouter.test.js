let menu, testFranchise, testStore;

beforeAll(async () => {
  // Create a franchise for the order tests
  const franchiseData = { name: 'Order Test Pizza', admins: [] };
  const franchiseRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(franchiseData);
  testFranchise = franchiseRes.body;

  // Create a store for the order tests
  const storeData = { name: 'Order Test Store' };
  const storeRes = await request(app)
    .post(`/api/franchise/${testFranchise.id}/store`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send(storeData);
  testStore = storeRes.body;

  // --- FIX STARTS HERE ---
  // 1. Add a new menu item so the menu is not empty
  const newItem = { title: 'Test Pizza', description: 'A pizza for testing', image: 'test.png', price: 10.00 };
  await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(newItem);

  // 2. Fetch the menu, which will now contain the item we just added
  const menuRes = await request(app).get('/api/order/menu');
  menu = menuRes.body;
  // --- FIX ENDS HERE ---
});

describe('Order API', () => {
  describe('POST /api/order', () => {
    test('should create an order and handle a successful factory response', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ reportUrl: 'some-url', jwt: 'factory-jwt' }),
      });

      const newOrder = {
        franchiseId: testFranchise.id,
        storeId: testStore.id,
        items: [{ menuId: menu[0].id, description: menu[0].description, price: menu[0].price }],
      };

      const res = await request(app)
        .post('/api/order')
        .set('Authorization', `Bearer ${dinerToken}`)
        .send(newOrder);

      expect(res.status).toBe(200);
      expect(res.body.order.id).toBeDefined();
    });

    test('should return 500 if the factory response is not ok', async () => {
      fetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ reportUrl: 'error-url' }),
      });
      
      const newOrder = {
        franchiseId: testFranchise.id,
        storeId: testStore.id,
        items: [{ menuId: menu[0].id, description: menu[0].description, price: menu[0].price }],
      };

      const res = await request(app)
        .post('/api/order')
        .set('Authorization', `Bearer ${dinerToken}`)
        .send(newOrder);

      expect(res.status).toBe(500);
    });
  });
});
