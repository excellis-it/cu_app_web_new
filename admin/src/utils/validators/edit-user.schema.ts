import { z } from 'zod';
import { validateEmail } from '@/utils/validators/common-rules';
import { messages } from '@/config/messages';

// form zod validation schema
export const editUserSchema = z.object({
  name: z.string().min(1, { message: messages.fullNameIsRequired }),
  userName: z.string().min(1, { message: messages.userNameIsRequired }),
  email: validateEmail,
  phone: z.string().optional(),
  // phone: z
  //   .string()
  //   .min(1, { message: messages.phoneNumberIsRequired })
  //   .min(7, { message: messages.phoneNumberLengthMin }),
  // password: z.string().min(6, { message: messages.passwordLengthMin }),
  newPassword: z.string().optional(),

  image: z.string().optional(),
  // userType: z.string().min(1, { message: messages.roleIsRequired }),
  userType: z.string().optional(),
  // permissions: z.string().min(1, { message: messages.permissionIsRequired }),
  accountStatus: z.string().optional(),
});

// generate form types from zod validation schema
export type EditUserInput = z.infer<typeof editUserSchema>;
