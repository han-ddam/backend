import { NotFoundException } from '@nestjs/common';
import { AgreementsService } from './agreements.service';

describe('AgreementsService', () => {
  let repo: any;
  let id: any;
  let service: AgreementsService;

  beforeEach(() => {
    repo = {
      findCurrent: jest.fn(),
      findById: jest.fn(),
      transFor: jest.fn(),
      recordConsent: jest.fn(),
      listConsents: jest.fn(),
    };
    let seq = 0;
    id = { generate: jest.fn(() => `id-${++seq}`) };
    service = new AgreementsService(repo, id);
  });

  describe('getCurrent', () => {
    const agreement = {
      id: 'a1',
      type: 'TOS',
      version: '1.0',
      required: true,
    };

    it('throws when no agreement for the type', async () => {
      repo.findCurrent.mockResolvedValue(undefined);
      await expect(service.getCurrent('TOS', 'KO')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the locale body', async () => {
      repo.findCurrent.mockResolvedValue(agreement);
      repo.transFor.mockResolvedValue([
        { agreementId: 'a1', locale: 'EN', title: 'Terms', body: 'EN body' },
        { agreementId: 'a1', locale: 'KO', title: '약관', body: 'KO body' },
      ]);
      const v = await service.getCurrent('TOS', 'EN');
      expect(v.title).toBe('Terms');
      expect(v.version).toBe('1.0');
      expect(v.required).toBe(true);
    });

    it('falls back to KO when the locale row is missing', async () => {
      repo.findCurrent.mockResolvedValue(agreement);
      repo.transFor.mockResolvedValue([
        { agreementId: 'a1', locale: 'KO', title: '약관', body: 'KO body' },
      ]);
      const v = await service.getCurrent('TOS', 'JA');
      expect(v.title).toBe('약관');
    });

    it('throws when no content at all', async () => {
      repo.findCurrent.mockResolvedValue(agreement);
      repo.transFor.mockResolvedValue([]);
      await expect(service.getCurrent('TOS', 'KO')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('accept', () => {
    it('throws when the agreement does not exist', async () => {
      repo.findById.mockResolvedValue(undefined);
      await expect(service.accept('u1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.recordConsent).not.toHaveBeenCalled();
    });

    it('records consent with a generated id', async () => {
      repo.findById.mockResolvedValue({ id: 'a1' });
      repo.recordConsent.mockResolvedValue(true);
      await service.accept('u1', 'a1');
      expect(repo.recordConsent).toHaveBeenCalledWith({
        id: 'id-1',
        userId: 'u1',
        agreementId: 'a1',
      });
    });
  });

  describe('listMine', () => {
    it('delegates to the repository', async () => {
      const rows = [
        { agreementId: 'a1', type: 'TOS', version: '1.0', acceptedAt: new Date() },
      ];
      repo.listConsents.mockResolvedValue(rows);
      await expect(service.listMine('u1')).resolves.toBe(rows);
      expect(repo.listConsents).toHaveBeenCalledWith('u1');
    });
  });
});
