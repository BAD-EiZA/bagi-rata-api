import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';

/**
 * Clerk webhooks removed after Kinde migration.
 * Optional Kinde event webhooks can be added here later.
 */
@ApiExcludeController()
@Controller('webhooks')
export class WebhooksController {
  @Public()
  @Get('health')
  health() {
    return { ok: true, provider: 'kinde' };
  }
}
