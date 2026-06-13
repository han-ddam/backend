import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

/**
 * Time-sortable UUIDv7 generator (index-friendly primary keys).
 * Injected rather than called directly so it can be stubbed in tests.
 */
@Injectable()
export class IdService {
  generate(): string {
    return uuidv7();
  }
}
