import { BadgesService } from './badges.service';

describe('BadgesService', () => {
  let repo: any, id: any, service: BadgesService;
  beforeEach(() => {
    repo = {
      userFacts: jest.fn(),
      activeBadges: jest.fn(),
      grantMany: jest.fn(),
      earnedBadges: jest.fn(),
      badgeTransFor: jest.fn(),
      representativeRows: jest.fn(),
      create: jest.fn(),
      updateMeta: jest.fn(),
      deleteById: jest.fn(),
      adminListPage: jest.fn(),
    };
    id = { generate: jest.fn(() => 'id-1') };
    service = new BadgesService(repo, id);
  });

  describe('evaluate', () => {
    it('grants LEVEL and VISIT_COUNT badges that are met, skips unmet', async () => {
      // level: threshold(L)=50*(L-1)*L. score 300 → level 3 (threshold(3)=300, threshold(4)=600).
      repo.userFacts.mockResolvedValue({ score: 300, visitCount: 40 });
      repo.activeBadges.mockResolvedValue([
        { id: 'b_lvl3', criteriaType: 'LEVEL', criteriaValue: 3 },   // met (level 3)
        { id: 'b_lvl5', criteriaType: 'LEVEL', criteriaValue: 5 },   // not met
        { id: 'b_v50', criteriaType: 'VISIT_COUNT', criteriaValue: 50 }, // not met (40)
        { id: 'b_v10', criteriaType: 'VISIT_COUNT', criteriaValue: 10 }, // met
      ]);
      await service.evaluate('u1');
      expect(repo.grantMany).toHaveBeenCalledWith('u1', ['b_lvl3', 'b_v10']);
    });

    it('does not call grantMany when nothing qualifies', async () => {
      repo.userFacts.mockResolvedValue({ score: 0, visitCount: 0 });
      repo.activeBadges.mockResolvedValue([{ id: 'b_lvl3', criteriaType: 'LEVEL', criteriaValue: 3 }]);
      await service.evaluate('u1');
      expect(repo.grantMany).not.toHaveBeenCalled();
    });
  });

  describe('listMine', () => {
    it('maps earned badges (tier desc from repo) with localized name', async () => {
      repo.earnedBadges.mockResolvedValue([
        { badgeId: 'b1', code: 'LEVEL_10', tier: 30, iconKey: 'trophy', earnedAt: new Date('2026-07-10T00:00:00Z') },
      ]);
      repo.badgeTransFor.mockResolvedValue([
        { badgeId: 'b1', locale: 'KO', name: '여행마스터' },
      ]);
      const out = await service.listMine('u1', 'KO');
      expect(out).toEqual({
        items: [{ code: 'LEVEL_10', name: '여행마스터', iconKey: 'trophy', tier: 30, earnedAt: '2026-07-10T00:00:00.000Z' }],
      });
    });

    it('empty when no earned badges', async () => {
      repo.earnedBadges.mockResolvedValue([]);
      const out = await service.listMine('u1', 'KO');
      expect(out).toEqual({ items: [] });
    });
  });

  describe('representativeFor', () => {
    it('picks highest-tier badge per user, null for users with none', async () => {
      repo.representativeRows.mockResolvedValue([
        { userId: 'u1', badgeId: 'b2', code: 'LEVEL_10', tier: 30, iconKey: 'trophy' },
        { userId: 'u1', badgeId: 'b1', code: 'LEVEL_5', tier: 10, iconKey: null },
        { userId: 'u2', badgeId: 'b1', code: 'LEVEL_5', tier: 10, iconKey: null },
      ]);
      repo.badgeTransFor.mockResolvedValue([
        { badgeId: 'b2', locale: 'KO', name: '여행마스터' },
        { badgeId: 'b1', locale: 'KO', name: '초보여행자' },
      ]);
      const map = await service.representativeFor(['u1', 'u2', 'u3'], 'KO');
      expect(map.get('u1')).toEqual({ code: 'LEVEL_10', name: '여행마스터', iconKey: 'trophy' });
      expect(map.get('u2')).toEqual({ code: 'LEVEL_5', name: '초보여행자', iconKey: null });
      expect(map.get('u3') ?? null).toBeNull();
    });

    it('empty userIds → empty map', async () => {
      const map = await service.representativeFor([], 'KO');
      expect(map.size).toBe(0);
      expect(repo.representativeRows).not.toHaveBeenCalled();
    });
  });

  describe('admin', () => {
    it('adminCreate requires KO translation', async () => {
      await expect(
        service.adminCreate({ code: 'X', tier: 1, criteriaType: 'LEVEL', criteriaValue: 3, seq: 1, translations: [{ locale: 'EN', name: 'x' }] }),
      ).rejects.toThrow('KO translation is required');
    });
    it('adminCreate inserts and returns id', async () => {
      repo.create.mockResolvedValue(undefined);
      const out = await service.adminCreate({ code: 'LEVEL_3', tier: 10, criteriaType: 'LEVEL', criteriaValue: 3, seq: 1, translations: [{ locale: 'KO', name: '초보' }] });
      expect(out).toEqual({ badgeId: 'id-1' });
    });
    it('adminUpdate 404 when missing', async () => {
      repo.updateMeta.mockResolvedValue(null);
      await expect(service.adminUpdate('b1', { tier: 5 })).rejects.toThrow('Badge not found');
    });
    it('adminDelete 404 when missing', async () => {
      repo.deleteById.mockResolvedValue(false);
      await expect(service.adminDelete('b1')).rejects.toThrow('Badge not found');
    });
  });
});
