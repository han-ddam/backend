import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, lt, ne, or, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { IdService } from '@platform/id/id.service';
import { ClockService } from '@platform/clock/clock.service';
import { decodeCursor } from '@platform/pagination/cursor';
import { certifications, certificationImages, scoreEvents, visits, places, users, type Certification } from '@db/schema';
import type { ScorePreview } from '@modules/scoring/score-calculator';

interface CreateInput {
  id: string;
  userId: string;
  placeId: string;
  caption?: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  distanceM: number;
  images: { imageKey: string; seq: number; isRepresentative: boolean }[];
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

  /** (user,place)에 최근 days일 내 non-REJECTED 인증이 있나 — 재인증 쿨다운용. */
  async recentCertExists(userId: string, placeId: string, days: number): Promise<boolean> {
    const [row] = await this.db
      .select({ id: certifications.id })
      .from(certifications)
      .where(
        and(
          eq(certifications.userId, userId),
          eq(certifications.placeId, placeId),
          ne(certifications.status, 'REJECTED'),
          gt(certifications.createdAt, sql`now() - make_interval(days => ${days})`),
        ),
      );
    return !!row;
  }

  /** 쿨다운 검사 + PENDING 인증 생성을 (user,place) advisory lock으로 원자화 — 동시요청 우회 방지. */
  async createPendingGuarded(p: CreateInput, cooldownDays: number): Promise<'CREATED' | 'COOLDOWN'> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${p.userId}), hashtext(${p.placeId}))`);
      const [recent] = await tx
        .select({ id: certifications.id })
        .from(certifications)
        .where(
          and(
            eq(certifications.userId, p.userId),
            eq(certifications.placeId, p.placeId),
            ne(certifications.status, 'REJECTED'),
            gt(certifications.createdAt, sql`now() - make_interval(days => ${cooldownDays})`),
          ),
        );
      if (recent) return 'COOLDOWN';
      await tx.insert(certifications).values({
        id: p.id, userId: p.userId, placeId: p.placeId,
        caption: p.caption ?? null, visibility: p.visibility,
        status: 'PENDING', proximityPass: true, proximityDistanceM: p.distanceM.toString(),
      });
      if (p.images.length > 0) {
        await tx.insert(certificationImages).values(
          p.images.map((im) => ({
            id: this.id.generate(), certId: p.id, imageKey: im.imageKey,
            seq: im.seq, isRepresentative: im.isRepresentative,
          })),
        );
      }
      return 'CREATED';
    });
  }

  async createRejected(p: CreateInput & { reason: string }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(certifications).values({
        id: p.id, userId: p.userId, placeId: p.placeId,
        caption: p.caption ?? null, visibility: p.visibility,
        status: 'REJECTED', proximityPass: false, proximityDistanceM: p.distanceM.toString(),
        rejectReason: p.reason,
      });
      if (p.images.length > 0) {
        await tx.insert(certificationImages).values(
          p.images.map((im) => ({
            id: this.id.generate(), certId: p.id, imageKey: im.imageKey,
            seq: im.seq, isRepresentative: im.isRepresentative,
          })),
        );
      }
    });
  }

  /** 멱등/중복업로드 판정 — imageKey를 소유한 cert. 없으면 null. */
  async findCertByImageKey(
    imageKey: string,
  ): Promise<{ id: string; userId: string; status: string; proximityPass: boolean } | null> {
    const [row] = await this.db
      .select({
        id: certifications.id,
        userId: certifications.userId,
        status: certifications.status,
        proximityPass: certifications.proximityPass,
      })
      .from(certificationImages)
      .innerJoin(certifications, eq(certifications.id, certificationImages.certId))
      .where(eq(certificationImages.imageKey, imageKey));
    return row ?? null;
  }

  /** 사진 서빙 접근판정용 — imageKey → (소유자, 공개설정). 없으면 null. */
  async findByImageKey(
    imageKey: string,
  ): Promise<{ userId: string; visibility: string } | null> {
    const [row] = await this.db
      .select({ userId: certifications.userId, visibility: certifications.visibility })
      .from(certificationImages)
      .innerJoin(certifications, eq(certifications.id, certificationImages.certId))
      .where(eq(certificationImages.imageKey, imageKey));
    return row ?? null;
  }

  /** cert의 커버(is_representative) image_key. */
  async coverImageKey(certId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ imageKey: certificationImages.imageKey })
      .from(certificationImages)
      .where(and(eq(certificationImages.certId, certId), eq(certificationImages.isRepresentative, true)));
    return row?.imageKey ?? null;
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

  /** 검증 통과분 적립 — 첫 수집(×1, visit 행) / 재방문(×0.5). cert당 1건(멱등). */
  async applyAccrual(p: {
    certId: string;
    userId: string;
    placeId: string;
    type: 'VISIT' | 'PHOTO';
    preview: ScorePreview;
  }): Promise<{ awarded: boolean; weightedScore: number }> {
    return this.db.transaction(async (tx) => {
      // 동시 적립 직렬화: 같은 (user,place)의 첫수집/재방문 판정 레이스 방지(unique 제거 보완)
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${p.userId}), hashtext(${p.placeId}))`);
      const [prior] = await tx
        .select({ id: scoreEvents.id })
        .from(scoreEvents)
        .where(and(eq(scoreEvents.userId, p.userId), eq(scoreEvents.placeId, p.placeId)));
      const revisit = !!prior;
      const weighted = Math.round(p.preview.estimatedPoints * (revisit ? 0.5 : 1) * 10) / 10;
      const inserted = await tx
        .insert(scoreEvents)
        .values({
          id: this.id.generate(),
          userId: p.userId,
          placeId: p.placeId,
          certificationId: p.certId,
          type: p.type,
          basePoints: p.preview.basePoints,
          regionWeight: p.preview.regionWeight.toFixed(2),
          rarityWeight: p.preview.rarityWeight.toFixed(2),
          eventMultiplier: p.preview.eventMultiplier.toFixed(2),
          weightedScore: weighted.toString(),
        })
        .onConflictDoNothing({ target: scoreEvents.certificationId })
        .returning({ id: scoreEvents.id });
      const scored = inserted.length > 0;
      if (scored && !revisit) {
        await tx
          .insert(visits)
          .values({ id: this.id.generate(), userId: p.userId, placeId: p.placeId })
          .onConflictDoNothing({ target: [visits.userId, visits.placeId] });
      }
      await tx
        .update(certifications)
        .set({ status: 'ACCEPTED', scoredAt: this.clock.now() })
        .where(eq(certifications.id, p.certId));
      return { awarded: scored, weightedScore: scored ? weighted : 0 };
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

  /** place 공개 인증사진 피드 — PUBLIC + ACCEPTED, 최신순. cert별 images[] 포함. */
  async publicFeedForPlace(
    placeId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Array<{ id: string; createdAt: Date; handle: string; images: { imageKey: string; isRepresentative: boolean }[] }>> {
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
    const certRows = await this.db
      .select({ id: certifications.id, createdAt: certifications.createdAt, handle: users.handle })
      .from(certifications)
      .innerJoin(users, eq(users.id, certifications.userId))
      .where(and(...conds))
      .orderBy(desc(certifications.createdAt), desc(certifications.id))
      .limit(limit + 1);
    if (certRows.length === 0) return [];
    const ids = certRows.map((r) => r.id);
    const imgs = await this.db
      .select({ certId: certificationImages.certId, imageKey: certificationImages.imageKey, isRepresentative: certificationImages.isRepresentative })
      .from(certificationImages)
      .where(inArray(certificationImages.certId, ids))
      .orderBy(certificationImages.seq);
    const byCert = new Map<string, { imageKey: string; isRepresentative: boolean }[]>();
    for (const im of imgs) {
      const arr = byCert.get(im.certId) ?? [];
      arr.push({ imageKey: im.imageKey, isRepresentative: im.isRepresentative });
      byCert.set(im.certId, arr);
    }
    return certRows.map((r) => ({ id: r.id, createdAt: r.createdAt, handle: r.handle, images: byCert.get(r.id) ?? [] }));
  }
}
