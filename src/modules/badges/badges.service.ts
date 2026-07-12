import { Injectable } from '@nestjs/common';
import type { localeEnum } from '@db/schema';
import { levelFromExp } from '@modules/stats/level';
import { BadgesRepository } from './badges.repository';

type Locale = (typeof localeEnum.enumValues)[number];

export interface BadgeItem {
  code: string;
  name: string;
  iconKey: string | null;
  tier: number;
  earnedAt: string;
}

export interface RepresentativeBadge {
  code: string;
  name: string;
  iconKey: string | null;
}

@Injectable()
export class BadgesService {
  constructor(private readonly repo: BadgesRepository) {}

  /** 조건 충족 뱃지 부여(멱등). 이벤트 시점·안전망에서 호출. */
  async evaluate(userId: string): Promise<void> {
    const [{ score, visitCount }, active] = await Promise.all([
      this.repo.userFacts(userId),
      this.repo.activeBadges(),
    ]);
    const level = levelFromExp(score).level;
    const qualified = active
      .filter((b) =>
        b.criteriaType === 'LEVEL'
          ? level >= b.criteriaValue
          : visitCount >= b.criteriaValue,
      )
      .map((b) => b.id);
    if (qualified.length > 0) {
      await this.repo.grantMany(userId, qualified);
    }
  }

  async listMine(userId: string, locale: Locale): Promise<{ items: BadgeItem[] }> {
    const earned = await this.repo.earnedBadges(userId);
    if (earned.length === 0) return { items: [] };
    const trans = await this.repo.badgeTransFor(
      earned.map((e) => e.badgeId),
      [locale, 'KO'],
    );
    const items = earned.map((e) => {
      const t = this.pickName(trans.filter((x) => x.badgeId === e.badgeId), locale);
      return {
        code: e.code,
        name: t ?? '',
        iconKey: e.iconKey ?? null,
        tier: e.tier,
        earnedAt: e.earnedAt.toISOString(),
      };
    });
    return { items };
  }

  /** 유저별 대표 뱃지(tier 최고). 미획득 유저는 맵에 없음(null 취급). */
  async representativeFor(
    userIds: string[],
    locale: Locale,
  ): Promise<Map<string, RepresentativeBadge | null>> {
    const map = new Map<string, RepresentativeBadge | null>();
    if (userIds.length === 0) return map;
    const rows = await this.repo.representativeRows(userIds); // tier DESC
    const topByUser = new Map<string, { badgeId: string; code: string; iconKey: string | null }>();
    for (const r of rows) {
      if (!topByUser.has(r.userId)) {
        topByUser.set(r.userId, { badgeId: r.badgeId, code: r.code, iconKey: r.iconKey });
      }
    }
    const badgeIds = [...new Set([...topByUser.values()].map((b) => b.badgeId))];
    const trans = await this.repo.badgeTransFor(badgeIds, [locale, 'KO']);
    for (const [userId, b] of topByUser) {
      const name = this.pickName(trans.filter((x) => x.badgeId === b.badgeId), locale) ?? '';
      map.set(userId, { code: b.code, name, iconKey: b.iconKey ?? null });
    }
    return map;
  }

  private pickName(rows: { locale: string; name: string }[], locale: Locale): string | undefined {
    return (rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === 'KO'))?.name;
  }
}
