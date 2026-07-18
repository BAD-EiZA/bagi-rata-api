import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { Webhook } from 'svix';
import { Public } from '../common/decorators/public.decorator';
import { ApiError } from '../common/errors/api-error';
import { ErrorCodes } from '../common/errors/error-codes';
import { UsersService } from '../users/users.service';

type ClerkEmailAddress = {
  id: string;
  email_address: string;
};

type ClerkUserEventData = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  image_url?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: ClerkEmailAddress[];
};

type ClerkWebhookEvent = {
  type: string;
  data: ClerkUserEventData;
};

@ApiExcludeController()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Post('clerk')
  @HttpCode(200)
  async handleClerk(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('svix-id') svixId?: string,
    @Headers('svix-timestamp') svixTimestamp?: string,
    @Headers('svix-signature') svixSignature?: string,
  ) {
    const secret = this.config.get<string>('CLERK_WEBHOOK_SIGNING_SECRET');
    if (!secret) {
      this.logger.error('CLERK_WEBHOOK_SIGNING_SECRET is not configured');
      throw new ApiError(
        ErrorCodes.INTERNAL_ERROR,
        'Webhook belum dikonfigurasi.',
        500,
      );
    }

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new ApiError(
        ErrorCodes.WEBHOOK_SIGNATURE_INVALID,
        'Header webhook tidak lengkap.',
        400,
      );
    }

    const payload = req.rawBody
      ? req.rawBody.toString('utf8')
      : JSON.stringify(req.body);

    let event: ClerkWebhookEvent;
    try {
      const wh = new Webhook(secret);
      event = wh.verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as ClerkWebhookEvent;
    } catch (error) {
      this.logger.warn(
        `Invalid Clerk webhook signature: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ApiError(
        ErrorCodes.WEBHOOK_SIGNATURE_INVALID,
        'Signature webhook tidak valid.',
        400,
      );
    }

    if (
      event.type === 'user.created' ||
      event.type === 'user.updated' ||
      event.type === 'user.deleted'
    ) {
      const data = event.data;
      const primaryEmail =
        data.email_addresses?.find(
          (item) => item.id === data.primary_email_address_id,
        )?.email_address ??
        data.email_addresses?.[0]?.email_address ??
        null;

      const displayName =
        [data.first_name, data.last_name].filter(Boolean).join(' ') ||
        data.username ||
        primaryEmail ||
        'Pengguna';

      await this.usersService.upsertFromClerkEvent({
        clerkUserId: data.id,
        displayName,
        primaryEmail,
        avatarUrl: data.image_url ?? null,
        deleted: event.type === 'user.deleted',
      });
    } else {
      this.logger.debug(`Ignored Clerk event type: ${event.type}`);
    }

    return { received: true };
  }
}
