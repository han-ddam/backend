import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { IdService } from '@platform/id/id.service';
import type { User, userStatusEnum } from '@db/schema';
import { UsersRepository } from './users.repository';

type UserStatus = (typeof userStatusEnum.enumValues)[number];

export interface OAuthProfile {
  provider: 'KAKAO' | 'NAVER' | 'GOOGLE';
  providerUserId: string;
  displayName: string;
  email?: string | null;
}

export interface PublicProfile {
  id: string;
  handle: string;
  displayName: string;
}

/** Member view for admin management (more fields than the public profile). */
export interface MemberView {
  id: string;
  handle: string;
  displayName: string;
  email: string | null;
  status: UserStatus;
  createdAt: Date;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
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

  /** 이메일 계정 가입(테스트용). 이메일 중복 시 409. */
  async signupWithEmail(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<User> {
    if (await this.repo.findByEmail(email)) {
      throw new ConflictException('Email already in use');
    }
    const passwordHash = await hash(password);
    return this.repo.createEmailUser({
      id: this.id.generate(),
      handle: await this.generateUniqueHandle(),
      displayName: displayName ?? '테스터',
      email,
      passwordHash,
    });
  }

  /** 이메일로 유저 조회(passwordHash 포함) — 로그인 검증용. */
  async findByEmail(email: string): Promise<User | undefined> {
    return this.repo.findByEmail(email);
  }

  // --- admin member management ---

  async listMembers(params: {
    page: number;
    limit: number;
    q?: string;
  }): Promise<Paginated<MemberView>> {
    const { rows, total } = await this.repo.list({
      limit: params.limit,
      offset: (params.page - 1) * params.limit,
      q: params.q,
    });
    return {
      items: rows.map((u) => this.toMemberView(u)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async getMember(id: string): Promise<MemberView> {
    return this.toMemberView(await this.getById(id));
  }

  async setStatus(id: string, status: UserStatus): Promise<MemberView> {
    const updated = await this.repo.updateStatus(id, status);
    if (!updated) throw new NotFoundException('User not found');
    return this.toMemberView(updated);
  }

  /** 회원 탈퇴(소프트): 활동 데이터 삭제 + status=WITHDRAWN. 없으면 404. */
  async withdraw(userId: string): Promise<{ withdrawn: true }> {
    const user = await this.repo.withdraw(userId);
    if (!user) throw new NotFoundException('User not found');
    return { withdrawn: true };
  }

  /** 탈퇴 계정 복원: status=ACTIVE. 없으면 404. */
  async reactivate(userId: string): Promise<User> {
    const user = await this.repo.updateStatus(userId, 'ACTIVE');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  toMemberView(user: User): MemberView {
    return {
      id: user.id,
      handle: user.handle,
      displayName: user.displayName,
      email: user.email,
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  private async generateUniqueHandle(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const handle = `user_${randomBytes(4).toString('hex')}`;
      if (!(await this.repo.handleExists(handle))) return handle;
    }
    throw new ConflictException('Could not allocate a unique handle');
  }
}
