import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdService } from '@platform/id/id.service';
import type { User } from '@db/schema';
import { UsersRepository } from './users.repository';

export interface OAuthProfile {
  provider: 'KAKAO' | 'NAVER';
  providerUserId: string;
  displayName: string;
  email?: string | null;
}

export interface PublicProfile {
  id: string;
  handle: string;
  displayName: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly id: IdService,
  ) {}

  async getById(id: string): Promise<User> {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  toPublicProfile(user: User): PublicProfile {
    return {
      id: user.id,
      handle: user.handle,
      displayName: user.displayName,
    };
  }

  /** Find the member behind a social identity, creating one on first login. */
  async provisionFromOAuth(profile: OAuthProfile): Promise<User> {
    const existing = await this.repo.findByOAuth(
      profile.provider,
      profile.providerUserId,
    );
    if (existing) return existing;

    return this.repo.createUserWithOAuth(
      {
        id: this.id.generate(),
        handle: await this.generateUniqueHandle(),
        displayName: profile.displayName,
        email: profile.email ?? null,
      },
      {
        id: this.id.generate(),
        provider: profile.provider,
        providerUserId: profile.providerUserId,
      },
    );
  }

  private async generateUniqueHandle(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const handle = `user_${randomBytes(4).toString('hex')}`;
      if (!(await this.repo.handleExists(handle))) return handle;
    }
    throw new ConflictException('Could not allocate a unique handle');
  }
}
