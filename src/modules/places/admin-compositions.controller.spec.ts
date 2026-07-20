import { BadRequestException } from '@nestjs/common';
import { AdminCompositionsController } from './admin-compositions.controller';
describe('AdminCompositionsController', () => {
  let svc: any, ctl: AdminCompositionsController;
  beforeEach(() => { svc = { importCsv: jest.fn().mockResolvedValue({ placesUpdated: 1, imported: 2, skipped: [] }) }; ctl = new AdminCompositionsController(svc); });
  it('delegates buffer to importCsv', async () => {
    const out = await ctl.import({ buffer: Buffer.from('x') } as any);
    expect(svc.importCsv).toHaveBeenCalled();
    expect(out).toEqual({ placesUpdated: 1, imported: 2, skipped: [] });
  });
  it('400 when no file', async () => {
    await expect(ctl.import(undefined)).rejects.toBeInstanceOf(BadRequestException);
  });
});
