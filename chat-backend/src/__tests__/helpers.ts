import User  from '../db/schemas/users.schema';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

export const createTestUser = async (overrides = {}) => {
  const hashedPassword = await bcrypt.hash('password123', 10);
  const userData = {
    name: 'Test User',
    email: 'test@example.com',
    password: hashedPassword,
    phoneNumber: '+1234567890',
    ...overrides
  };

  const user = await User.create(userData);
  return user;
};

export const generateTestToken = (userId: string) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'test-secret', {
    expiresIn: '1d'
  });
};

export const clearDatabase = async () => {
  await User.deleteMany({});
};

export const getAuthHeader = (token: string) => ({
  Authorization: `Bearer ${token}`
});
