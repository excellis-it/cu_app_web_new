import { z } from 'zod';
import { messages } from '@/config/messages';
import { validateEmail } from '@/utils/validators/common-rules';

// form zod validation schema
export const createUserSchema = z.object({
  name: z.string().min(1, { message: messages.fullNameIsRequired }),
  email: validateEmail,
  phone: z.string().optional(),
  // phone: z
  //   .string()
  //   .min(1, { message: messages.phoneNumberIsRequired })
  //   .min(7, { message: messages.phoneNumberLengthMin }),
  password: z.string().min(6, { message: messages.passwordLengthMin }),
  // userType: z.string().min(1, { message: messages.roleIsRequired }),
  userType: z.string().optional(),
  // permissions: z.string().min(1, { message: messages.permissionIsRequired }),
  status: z.string().min(1, { message: messages.statusIsRequired }),
});

// generate form types from zod validation schema
export type CreateUserInput = z.infer<typeof createUserSchema>;
