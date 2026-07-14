import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DogamService } from '@modules/dogam/dogam.service';
import { BadgesService, type RepresentativeBadge } from '@modules/badges/badges.service';
import type { Locale } from '@platform/context/request-context';
import { levelFromExp } from './level';
import { StatsRepository, type Period } from './stats.repository';

export interface SummaryStats {
  score: number;
  nationalRank: number | null;
  totalUsers: number;
}

export interface ProfileResult {
  handle: string;
  displayName: string;
  avatarUrl: null;
  level: number;
  exp: number;
  expForNextLevel: number;
  dogamPercent: number;
  visitedCount: number;
  nationalRank: number | null;
  totalUsers: number;
}

export interface LeaderboardItem {
  rank: number;
  handle: string;
  score: number;
  dogamPercent: number;
}
export interface RankingsResult {
  topPercent: number | null;
  top3: { rank: number; handle: string; score: number; badge: RepresentativeBadge | null }[];
  leaderboard: { items: LeaderboardItem[]; nextCursor: string | null };
  me: { rank: number | null; score: number; dogamPercent: number; pointsToNext: number };
}

function encodeRankCursor(score: string, userId: string): string {
  return Buffer.from(`${score}|${userId}`).toString('base64url');
}
function decodeRankCursor(c?: string): { score: string; userId: string } | null {
  if (!c) return null;
  try {
    const [score, userId] = Buffer.from(c, 'base64url').toString('utf8').split('|');
    if (!score || !userId) return null;
    if (!/^\d+(\.\d+)?$/.test(score)) return null;
    if (!/^[0-9a-fA-F-]{36}$/.test(userId)) return null;
    return { score, userId };
  } catch {
    return null;
  }
}

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    private readonly repo: StatsRepository,
    private readonly dogam: DogamService,
    private readonly badges: BadgesService,
  ) {}

  async profile(userId: string): Promise<ProfileResult> {
    try {
      await this.badges.evaluate(userId); // 안전망: 놓친 부여 보정
    } catch (e) {
      this.logger.warn(`badge evaluate failed for ${userId}: ${e}`);
    }
    const basic = await this.repo.userBasic(userId);
    if (!basic) throw new NotFoundException('User not found');
    const me = await this.repo.myStats(userId, 'CUMULATIVE');
    const lvl = levelFromExp(me.score);
    const dg = await this.dogam.overview(userId);
    return {
      handle: basic.handle,
      displayName: basic.displayName,
      avatarUrl: null,
      level: lvl.level,
      exp: lvl.exp,
      expForNextLevel: lvl.expForNextLevel,
      dogamPercent: dg.percent,
      visitedCount: dg.collected,
      nationalRank: me.rank,
      totalUsers: me.totalRankers,
    };
  }

  async rankings(
    userId: string,
    _scope: 'NATIONAL',
    period: Period,
    cursor?: string,
    limit?: number,
    locale: Locale = 'KO',
  ): Promise<RankingsResult> {
    const lim = Math.min(Math.max(limit ?? 20, 1), 100);

    const top3rows = await this.repo.rankPage(period, 3, null);
    let repMap: Map<string, RepresentativeBadge | null> = new Map();
    try {
      repMap = await this.badges.representativeFor(top3rows.map((r) => r.userId), locale);
    } catch (e) {
      this.logger.warn(`rankings representativeFor failed: ${e}`);
    }
    const top3 = top3rows.map((r) => ({
      rank: r.rank,
      handle: r.handle,
      score: Number(r.score),
      badge: repMap.get(r.userId) ?? null,
    }));

    const pageRows = await this.repo.rankPage(period, lim + 1, decodeRankCursor(cursor));
    const hasNext = pageRows.length > lim;
    const pageItems = hasNext ? pageRows.slice(0, lim) : pageRows;
    const last = pageItems.at(-1);
    const nextCursor = hasNext && last ? encodeRankCursor(last.score, last.userId) : null;

    const dogamMap = await this.repo.dogamPercentFor(pageItems.map((r) => r.userId));
    const items: LeaderboardItem[] = pageItems.map((r) => ({
      rank: r.rank,
      handle: r.handle,
      score: Number(r.score),
      dogamPercent: dogamMap.get(r.userId) ?? 0,
    }));

    const me = await this.repo.myStats(userId, period);
    const myDogam = await this.dogam.overview(userId);
    const topPercent =
      me.rank != null && me.totalRankers > 0
        ? Math.round((me.rank / me.totalRankers) * 100)
        : null;

    return {
      topPercent,
      top3,
      leaderboard: { items, nextCursor },
      me: {
        rank: me.rank,
        score: me.score,
        dogamPercent: myDogam.percent,
        pointsToNext: me.pointsToNext,
      },
    };
  }

  /** 홈 요약용 누적 통계 (raw 점수 포함). */
  async summaryStats(userId: string): Promise<SummaryStats> {
    const s = await this.repo.myStats(userId, 'CUMULATIVE');
    return { score: s.score, nationalRank: s.rank, totalUsers: s.totalRankers };
  }
}
