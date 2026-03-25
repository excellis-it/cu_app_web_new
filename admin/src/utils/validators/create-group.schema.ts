import { z } from 'zod';
import { messages } from '@/config/messages';
import { validateEmail } from '@/utils/validators/common-rules';

// form zod validation schema
export const createGroupSchema = z.object({
  groupName: z.string().min(1, { message: messages.groupNameIsRequired }),
  groupDescription: z.string().optional(),
  admins: z.array(z.any()).optional(),
  members: z.array(z.any()).optional(),
  // members: z.array(z.string().min(1, { message: messages.memberIsRequired })),
  // admins: z.any().optional(),
  // members: z.any().optional(),
  groupImage: z.string().optional(),
});

// generate form types from zod validation schema
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
