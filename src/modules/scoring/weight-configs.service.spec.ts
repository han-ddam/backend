import { NotFoundException } from '@nestjs/common';
import { WeightConfigsService } from './weight-configs.service';

describe('WeightConfigsService', () => {
  let repo: any, id: any, svc: WeightConfigsService;
  beforeEach(() => {
    repo = { create: jest.fn(), listPage: jest.fn(), update: jest.fn(), deleteById: jest.fn(), exists: jest.fn() };
    id = { generate: jest.fn().mockReturnValue('cfg-1') };
    svc = new WeightConfigsService(repo, id);
  });
  it('create returns id', async () => {
    const out = await svc.adminCreate({ name: '기본', visitWeight: 1, photoWeight: 1.5 } as any);
    expect(out).toEqual({ configId: 'cfg-1' });
    expect(repo.create).toHaveBeenCalledWith({ id: 'cfg-1', name: '기본', visitWeight: 1, photoWeight: 1.5 });
  });
  it('update 404 when missing', async () => {
    repo.update.mockResolvedValue(false);
    await expect(svc.adminUpdate('x', { name: 'a' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('delete 404 when missing', async () => {
    repo.deleteById.mockResolvedValue(false);
    await expect(svc.adminDelete('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
