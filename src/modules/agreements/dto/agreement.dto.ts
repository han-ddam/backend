import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class CurrentAgreementQueryDto extends createZodDto(
  z.object({
    type: z.enum(['TOS', 'PRIVACY', 'CONTENT_LICENSE']),
  }),
) {}

export class AcceptAgreementDto extends createZodDto(
  z.object({
    agreementId: z.string().uuid(),
  }),
) {}
