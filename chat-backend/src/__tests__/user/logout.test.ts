import request from 'supertest';
import { app } from '../../app';
import USERS from '../../db/schemas/users.schema';
import { hashPassword } from '../../controller/user/signUp';

describe('Logout endpoints', () => {
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

  it('should clear cookie on /logout', async () => {
    const loginData = { id: 'test@example.com', password: 'password123' };
    const signInRes = await request(app)
      .post('/api/users/sign-in')
      .send(loginData)
      .expect(200);

    const res = await request(app)
      .post('/api/users/logout')
      .expect(200);

    expect(res.body.success).toBe(true);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
  });

  it('should clear cookie on /logout/web', async () => {
    const res = await request(app)
      .post('/api/users/logout/web')
      .expect(200);

    expect(res.body.success).toBe(true);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
  });
});


