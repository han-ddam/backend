import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from '@node-rs/argon2';
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
  role: User['role'];
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
      role: user.role,
    };
  }

  /** Find the user behind a social identity, creating one on first login. */
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
        role: 'USER',
      },
      {
        id: this.id.generate(),
        provider: profile.provider,
        providerUserId: profile.providerUserId,
      },
    );
  }

  /**
   * Create an email/password account. Reserved for admin-created staff accounts
   * — there is no public email signup. Defaults to ADMIN role.
   */
  async createEmailUser(input: {
    email: string;
    password: string;
    displayName: string;
    role?: User['role'];
  }): Promise<User> {
    if (await this.repo.findByEmail(input.email)) {
      throw new ConflictException('Email already in use');
    }
    return this.repo.createUser({
      id: this.id.generate(),
      handle: await this.generateUniqueHandle(),
      displayName: input.displayName,
      email: input.email,
      passwordHash: await hash(input.password),
      role: input.role ?? 'ADMIN',
    });
  }

  async findByEmail(email: string): Promise<User | undefined> {
    return this.repo.findByEmail(email);
  }

  private async generateUniqueHandle(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const handle = `user_${randomBytes(4).toString('hex')}`;
      if (!(await this.repo.handleExists(handle))) return handle;
    }
    throw new ConflictException('Could not allocate a unique handle');
  }
}
