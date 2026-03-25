import request from 'supertest';
import { app } from '../../app';
import USERS from '../../db/schemas/users.schema';
import { hashPassword } from '../../controller/user/signUp';

describe('Get Current User', () => {
  beforeEach(async () => {
    await USERS.deleteMany({});
    await USERS.create({
      sl: 1,
      name: 'Test User',
      lastName: 'L',
      email: 'test@example.com',
      password: await hashPassword('password123'),
      phone: '+1234567890',
      userType: 'user',
      accountStatus: 'Active'
    });
  });

  it('should return current user when authorized', async () => {
    const loginData = { id: 'test@example.com', password: 'password123' };
    const signInRes = await request(app)
      .post('/api/users/sign-in')
      .send(loginData)
      .expect(200);

    expect(signInRes.body.success).toBe(true);
    const token = signInRes.body.data.token;

    const res = await request(app)
      .get('/api/users/get-user')
      .set('access-token', token)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user.email).toBe('test@example.com');
  });

  it('should fail without token', async () => {
    const res = await request(app)
      .get('/api/users/get-user')
      .expect(200);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Unauthorized');
  });
});


