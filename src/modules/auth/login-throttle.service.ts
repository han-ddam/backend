import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '@platform/redis/redis.module';

/**
 * Per-email brute-force protection for password login: counts consecutive
 * failures in Redis and locks the account for a window once the threshold is hit.
 */
@Injectable()
export class LoginThrottleService {
  private readonly maxFailures = 5;
  private readonly windowSeconds = 900; // 15 minutes

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(email: string): string {
    return `login:fail:${email.toLowerCase()}`;
  }

  async assertNotLocked(email: string): Promise<void> {
    const count = Number(await this.redis.get(this.key(email))) || 0;
    if (count >= this.maxFailures) {
      throw new HttpException(
        'Too many failed login attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordFailure(email: string): Promise<void> {
    const key = this.key(email);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.windowSeconds);
    }
  }

  async reset(email: string): Promise<void> {
    await this.redis.del(this.key(email));
  }
}
