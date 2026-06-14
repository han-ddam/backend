import { UnauthorizedException } from '@nestjs/common';
import { TokenService } from './token.service';

/** Minimal chainable mock of the Drizzle query builder used by TokenService. */
function makeDb() {
  const insertValues = jest.fn().mockResolvedValue(undefined);
  const insert = jest.fn(() => ({ values: insertValues }));
  const selectWhere = jest.fn();
  const select = jest.fn(() => ({ from: () => ({ where: selectWhere }) }));
  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const update = jest.fn(() => ({ set: () => ({ where: updateWhere }) }));
  return {
    db: { insert, select, update } as any,
    insert,
    insertValues,
    select,
    selectWhere,
    update,
    updateWhere,
  };
}

describe('TokenService', () => {
  const fixed = new Date('2026-01-01T00:00:00Z');
  const clock = { now: () => fixed, epochMs: () => fixed.getTime() } as any;
  const id = { generate: () => 'rt-id' } as any;
  const config = { get: jest.fn().mockReturnValue(1000) } as any; // refresh TTL = 1000s
  let jwt: any;

  beforeEach(() => {
    jwt = { signAsync: jest.fn().mockResolvedValue('access.jwt') };
  });

  describe('issueTokens', () => {
    it('signs an access token and persists a hashed refresh token', async () => {
      const m = makeDb();
      const svc = new TokenService(m.db, jwt, config, clock, id);

      const pair = await svc.issueTokens({ id: 'u1' });

      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'u1' });
      expect(pair.accessToken).toBe('access.jwt');
      // raw refresh token is 32 random bytes hex = 64 chars, returned once
      expect(pair.refreshToken).toMatch(/^[0-9a-f]{64}$/);

      const values = m.insertValues.mock.calls[0][0];
      expect(values.userId).toBe('u1');
      expect(values.tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
      expect(values.tokenHash).not.toBe(pair.refreshToken); // stored hash != raw
      expect(values.expiresAt).toEqual(new Date(fixed.getTime() + 1000 * 1000));
    });
  });

  describe('consumeRefreshToken', () => {
    const validRow = {
      id: 'rt1',
      userId: 'u1',
      tokenHash: 'h',
      revokedAt: null,
      expiresAt: new Date(fixed.getTime() + 5000),
    };

    it('returns the userId and revokes the token (single-use)', async () => {
      const m = makeDb();
      m.selectWhere.mockResolvedValue([validRow]);
      const svc = new TokenService(m.db, jwt, config, clock, id);

      const userId = await svc.consumeRefreshToken('raw');

      expect(userId).toBe('u1');
      expect(m.updateWhere).toHaveBeenCalledTimes(1); // revoked on use
    });

    it('throws when the token is unknown', async () => {
      const m = makeDb();
      m.selectWhere.mockResolvedValue([]);
      const svc = new TokenService(m.db, jwt, config, clock, id);

      await expect(svc.consumeRefreshToken('raw')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws when the token is expired', async () => {
      const m = makeDb();
      m.selectWhere.mockResolvedValue([
        { ...validRow, expiresAt: new Date(fixed.getTime() - 1) },
      ]);
      const svc = new TokenService(m.db, jwt, config, clock, id);

      await expect(svc.consumeRefreshToken('raw')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('detects reuse of a revoked token and revokes all of the users sessions', async () => {
      const m = makeDb();
      m.selectWhere.mockResolvedValue([{ ...validRow, revokedAt: fixed }]);
      const svc = new TokenService(m.db, jwt, config, clock, id);

      await expect(svc.consumeRefreshToken('raw')).rejects.toThrow(
        UnauthorizedException,
      );
      // revoke-all-for-user was triggered (theft response)
      expect(m.update).toHaveBeenCalledTimes(1);
      expect(m.updateWhere).toHaveBeenCalledTimes(1);
    });
  });

  describe('revoke', () => {
    it('marks the matching token revoked', async () => {
      const m = makeDb();
      const svc = new TokenService(m.db, jwt, config, clock, id);

      await svc.revoke('raw');

      expect(m.update).toHaveBeenCalledTimes(1);
      expect(m.updateWhere).toHaveBeenCalledTimes(1);
    });
  });
});
