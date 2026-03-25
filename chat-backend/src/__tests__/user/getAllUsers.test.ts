import request from 'supertest';
import { app } from '../../app';
import USERS from '../../db/schemas/users.schema';
import { hashPassword } from '../../controller/user/signUp';

describe('Get All Users', () => {
  beforeEach(async () => {
    await USERS.deleteMany({});
    const base = {
      password: await hashPassword('password123'),
      phone: '+1234567890',
      userType: 'user',
      accountStatus: 'Active'
    } as any;
    await USERS.create([
      { sl: 1, name: 'Alice', email: 'alice@example.com', ...base },
      { sl: 2, name: 'Bob', email: 'bob@example.com', ...base },
      { sl: 3, name: 'Charlie', email: 'charlie@example.com', ...base }
    ]);
  });

  it('should return paginated users list with auth', async () => {
    const loginData = { id: 'alice@example.com', password: 'password123' };
    const signInRes = await request(app)
      .post('/api/users/sign-in')
      .send(loginData)
      .expect(200);

    const token = signInRes.body.data.token;

    const res = await request(app)
      .get('/api/users/get-all-users')
      .set('access-token', token)
      .query({ searchQuery: 'a', limit: 2, offset: 0 })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  it('should fail without token', async () => {
    const res = await request(app)
      .get('/api/users/get-all-users')
      .expect(200);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Unauthorized');
  });
});


