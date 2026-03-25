import request from 'supertest';
import { app } from '../../app';
import USERS from '../../db/schemas/users.schema';
import { hashPassword } from '../../controller/user/signUp';

describe('Forgot/Reset Password flow', () => {
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

  it('forgot-password should respond (email sending mocked by controller)', async () => {
    const res = await request(app)
      .post('/api/users/forgot-password')
      .send({ email: 'test@example.com' })
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('verify-email-otp should set slug and reset-password should accept matching passwords', async () => {
    // Manually set an OTP/slug-like state to avoid email dependency
    const user: any = await USERS.findOne({ email: 'test@example.com' });
    const now = Date.now();
    user.forgetPassword = { otp: '123456', expiresAt: now + 10 * 60 * 1000, createdAt: now } as any;
    await user.save();

    const verifyRes = await request(app)
      .post('/api/users/verify-email-otp')
      .send({ email: 'test@example.com', otp: '123456' })
      .expect(200);

    expect(verifyRes.body.success).toBe(true);
    const slug = verifyRes.body.data.slug;

    const resetRes = await request(app)
      .post('/api/users/reset-password')
      .send({ email: 'test@example.com', slug, password: 'newPass123', confirmPassword: 'newPass123' })
      .expect(200);

    expect(resetRes.body.success).toBe(true);
  });
});


