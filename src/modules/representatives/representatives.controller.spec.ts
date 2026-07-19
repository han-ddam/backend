import { RepresentativeController } from './representatives.controller';

describe('RepresentativeController', () => {
  let svc: any, ctl: RepresentativeController;
  beforeEach(() => {
    svc = { listPlacePhotos: jest.fn(), pinPlace: jest.fn(), unpinPlace: jest.fn(), listRegionPhotos: jest.fn(), pinRegion: jest.fn(), unpinRegion: jest.fn() };
    ctl = new RepresentativeController(svc);
  });
  it('setPlace delegates + returns pinned true', async () => {
    expect(await ctl.setPlace('p1', { certImageId: 'ci1' } as any, { userId: 'u1' } as any)).toEqual({ pinned: true });
    expect(svc.pinPlace).toHaveBeenCalledWith('u1', 'p1', 'ci1');
  });
  it('unsetRegion delegates + returns pinned false', async () => {
    expect(await ctl.unsetRegion('11', { userId: 'u1' } as any)).toEqual({ pinned: false });
    expect(svc.unpinRegion).toHaveBeenCalledWith('u1', '11');
  });
});
