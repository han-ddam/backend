import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { IdService } from '@platform/id/id.service';
import { ClockService } from '@platform/clock/clock.service';
import { decodeCursor } from '@platform/pagination/cursor';
import { certifications, scoreEvents, visits, places, users, type Certification } from '@db/schema';
import type { ScorePreview } from '@modules/scoring/score-calculator';

interface CreateInput {
  id: string;
  userId: string;
  placeId: string;
  imageKey: string;
  caption?: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  distanceM: number;
}

@Injectable()
export class CertificationsRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly id: IdService,
    private readonly clock: ClockService,
  ) {}

  /** ACTIVE + 좌표 보유 place의 좌표, 아니면 null. */
  async placeCoords(placeId: string): Promise<{ lat: number; lng: number } | null> {
    const [row] = await this.db
      .select({ lat: places.lat, lng: places.lng })
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.status, 'ACTIVE')));
    if (!row || row.lat === null || row.lng === null) return null;
    return { lat: row.lat, lng: row.lng };
  }

  async findByUserImageKey(
    userId: string,
    imageKey: string,
  ): Promise<{ id: string; status: string; proximityPass: boolean } | null> {
    const [row] = await this.db
      .select({
        id: certifications.id,
        status: certifications.status,
        proximityPass: certifications.proximityPass,
      })
      .from(certifications)
      .where(and(eq(certifications.userId, userId), eq(certifications.imageKey, imageKey)));
    return row ?? null;
  }

  async createPending(p: CreateInput): Promise<void> {
    await this.db.insert(certifications).values({
      id: p.id,
      userId: p.userId,
      placeId: p.placeId,
      imageKey: p.imageKey,
      caption: p.caption ?? null,
      visibility: p.visibility,
      status: 'PENDING',
      proximityPass: true,
      proximityDistanceM: p.distanceM.toString(),
    });
  }

  async createRejected(p: CreateInput & { reason: string }): Promise<void> {
    await this.db.insert(certifications).values({
      id: p.id,
      userId: p.userId,
      placeId: p.placeId,
      imageKey: p.imageKey,
      caption: p.caption ?? null,
      visibility: p.visibility,
      status: 'REJECTED',
      proximityPass: false,
      proximityDistanceM: p.distanceM.toString(),
      rejectReason: p.reason,
    });
  }

  /** 사진 서빙 접근판정용 — imageKey → (소유자, 공개설정). 없으면 null. */
  async findByImageKey(
    imageKey: string,
  ): Promise<{ userId: string; visibility: string } | null> {
    const [row] = await this.db
      .select({ userId: certifications.userId, visibility: certifications.visibility })
      .from(certifications)
      .where(eq(certifications.imageKey, imageKey));
    return row ?? null;
  }

  async findById(id: string): Promise<Certification | null> {
    const [row] = await this.db.select().from(certifications).where(eq(certifications.id, id));
    return row ?? null;
  }

  async reject(id: string, reason: string): Promise<void> {
    await this.db
      .update(certifications)
      .set({ status: 'REJECTED', rejectReason: reason })
      .where(eq(certifications.id, id));
  }

  /** 검증 통과분 적립 — 첫 수집이면 score_event+visit 생성, 아니면 스킵. cert ACCEPTED. */
  async applyAccrual(p: {
    certId: string;
    userId: string;
    placeId: string;
    preview: ScorePreview;
  }): Promise<{ awarded: boolean; weightedScore: number }> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: scoreEvents.id })
        .from(scoreEvents)
        .where(and(eq(scoreEvents.userId, p.userId), eq(scoreEvents.placeId, p.placeId)));

      let awarded = false;
      if (!existing) {
        const inserted = await tx
          .insert(scoreEvents)
          .values({
            id: this.id.generate(),
            userId: p.userId,
            placeId: p.placeId,
            certificationId: p.certId,
            basePoints: p.preview.basePoints,
            regionWeight: p.preview.regionWeight.toFixed(2),
            rarityWeight: p.preview.rarityWeight.toFixed(2),
            eventMultiplier: p.preview.eventMultiplier.toFixed(2),
            weightedScore: p.preview.estimatedPoints.toString(),
          })
          .onConflictDoNothing({ target: [scoreEvents.userId, scoreEvents.placeId] })
          .returning({ id: scoreEvents.id });
        if (inserted.length > 0) {
          awarded = true;
          await tx
            .insert(visits)
            .values({ id: this.id.generate(), userId: p.userId, placeId: p.placeId })
            .onConflictDoNothing({ target: [visits.userId, visits.placeId] });
        }
      }
      await tx
        .update(certifications)
        .set({ status: 'ACCEPTED', scoredAt: this.clock.now() })
        .where(eq(certifications.id, p.certId));
      return { awarded, weightedScore: awarded ? p.preview.estimatedPoints : 0 };
    });
  }

  /** GET 응답용 — cert + (있으면) score_event.weighted_score. 소유자 아니면 null. */
  async getResult(
    id: string,
    userId: string,
  ): Promise<{
    certId: string;
    status: string;
    placeId: string;
    awardedPoints: number;
    alreadyCollected: boolean;
    rejectReason: string | null;
  } | null> {
    const [cert] = await this.db
      .select()
      .from(certifications)
      .where(and(eq(certifications.id, id), eq(certifications.userId, userId)));
    if (!cert) return null;
    const [ev] = await this.db
      .select({ weighted: scoreEvents.weightedScore })
      .from(scoreEvents)
      .where(eq(scoreEvents.certificationId, id));
    // 이 cert가 적립원(=score_event 있음)인가 / 이미 수집(ACCEPTED인데 이 cert엔 event 없음)인가
    const [collected] = await this.db
      .select({ id: scoreEvents.id })
      .from(scoreEvents)
      .where(and(eq(scoreEvents.userId, userId), eq(scoreEvents.placeId, cert.placeId)));
    return {
      certId: cert.id,
      status: cert.status,
      placeId: cert.placeId,
      awardedPoints: ev ? Number(ev.weighted) : 0,
      alreadyCollected: cert.status === 'ACCEPTED' && !ev && !!collected,
      rejectReason: cert.rejectReason,
    };
  }

  /** place 공개 인증사진 피드 — PUBLIC + ACCEPTED, 최신순(createdAt DESC, id DESC), users.handle 조인. */
  async publicFeedForPlace(
    placeId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Array<{ id: string; createdAt: Date; imageKey: string; handle: string }>> {
    const c = decodeCursor(cursor);
    const conds = [
      eq(certifications.placeId, placeId),
      eq(certifications.status, 'ACCEPTED'),
      eq(certifications.visibility, 'PUBLIC'),
    ];
    if (c) {
      conds.push(
        or(
          lt(certifications.createdAt, c.createdAt),
          and(eq(certifications.createdAt, c.createdAt), lt(certifications.id, c.id)),
        )!,
      );
    }
    return this.db
      .select({
        id: certifications.id,
        createdAt: certifications.createdAt,
        imageKey: certifications.imageKey,
        handle: users.handle,
      })
      .from(certifications)
      .innerJoin(users, eq(users.id, certifications.userId))
      .where(and(...conds))
      .orderBy(desc(certifications.createdAt), desc(certifications.id))
      .limit(limit + 1);
  }
}
