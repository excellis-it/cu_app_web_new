import { z } from 'zod';
import { validateEmail } from '@/utils/validators/common-rules';
import { messages } from '@/config/messages';

// form zod validation schema
export const editSiteSchema = z.object({
  siteName: z.string().min(1, { message: messages.fullNameIsRequired }),
  siteDescription: z.string().min(1, { message: messages.fullNameIsRequired }),  
  siteLogo: z.string().optional(),
  siteMainImage: z.string().optional(),
 
});

// generate form types from zod validation schema
export type EditSiteInput = z.infer<typeof editSiteSchema>;
