import { Injectable } from '@nestjs/common';

/**
 * Injectable clock so time-dependent logic (suntime, TTLs, D-day,
 * trending windows) is deterministic and testable with a fixed clock.
 */
@Injectable()
export class ClockService {
  now(): Date {
    return new Date();
  }

  epochMs(): number {
    return this.now().getTime();
  }
}
