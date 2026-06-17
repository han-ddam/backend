import { Injectable, NotFoundException } from '@nestjs/common';
import { IdService } from '@platform/id/id.service';
import type {
  AgreementTrans,
  localeEnum,
  agreementTypeEnum,
} from '@db/schema';
import { AgreementsRepository } from './agreements.repository';

type Locale = (typeof localeEnum.enumValues)[number];
type AgreementType = (typeof agreementTypeEnum.enumValues)[number];

export interface AgreementView {
  id: string;
  type: AgreementType;
  version: string;
  required: boolean;
  title: string;
  body: string;
}

export interface ConsentView {
  agreementId: string;
  type: AgreementType;
  version: string;
  acceptedAt: Date;
}

@Injectable()
export class AgreementsService {
  constructor(
    private readonly repo: AgreementsRepository,
    private readonly id: IdService,
  ) {}

  /** 현재 약관 + locale 본문 (없으면 KO 폴백). */
  async getCurrent(type: AgreementType, locale: Locale): Promise<AgreementView> {
    const agreement = await this.repo.findCurrent(type);
    if (!agreement) {
      throw new NotFoundException(`No agreement for type ${type}`);
    }
    const trans = await this.repo.transFor(agreement.id, [locale, 'KO']);
    const t = this.pickTrans(trans, locale);
    if (!t) {
      throw new NotFoundException(`No content for agreement ${agreement.id}`);
    }
    return {
      id: agreement.id,
      type: agreement.type,
      version: agreement.version,
      required: agreement.required,
      title: t.title,
      body: t.body,
    };
  }

  /** 동의 기록 (멱등 — 이미 동의했으면 재기록 안 함). */
  async accept(userId: string, agreementId: string): Promise<void> {
    const agreement = await this.repo.findById(agreementId);
    if (!agreement) {
      throw new NotFoundException('Agreement not found');
    }
    await this.repo.recordConsent({
      id: this.id.generate(),
      userId,
      agreementId,
    });
  }

  /** 내 동의 이력. */
  async listMine(userId: string): Promise<ConsentView[]> {
    return this.repo.listConsents(userId);
  }

  private pickTrans(
    trans: AgreementTrans[],
    locale: Locale,
  ): AgreementTrans | undefined {
    return (
      trans.find((t) => t.locale === locale) ??
      trans.find((t) => t.locale === 'KO')
    );
  }
}
