import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorage } from './local-storage';

function make(dir: string) {
  let n = 0;
  const id = { generate: () => `id-${++n}` } as any;
  const config = { get: () => dir } as any; // STORAGE_DIR
  return new LocalStorage(config, id);
}

describe('LocalStorage', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'handdam-store-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('saves a buffer and returns a certifications/<id>.<ext> key', async () => {
    const store = make(dir);
    const { key } = await store.save(Buffer.from('abc'), 'image/jpeg');
    expect(key).toBe('certifications/id-1.jpg');
    expect(existsSync(join(dir, key))).toBe(true);
  });

  it('exists() reflects saved keys', async () => {
    const store = make(dir);
    const { key } = await store.save(Buffer.from('abc'), 'image/png');
    expect(await store.exists(key)).toBe(true);
    expect(await store.exists('certifications/nope.png')).toBe(false);
  });

  it('read() returns a stream + mime for a saved key, null for missing', async () => {
    const store = make(dir);
    const { key } = await store.save(Buffer.from('hello'), 'image/webp');
    const got = await store.read(key);
    expect(got?.mime).toBe('image/webp');
    const chunks: Buffer[] = [];
    for await (const c of got!.stream) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('hello');
    expect(await store.read('certifications/missing.jpg')).toBeNull();
  });

  it('rejects an unsupported mime on save', async () => {
    const store = make(dir);
    await expect(store.save(Buffer.from('x'), 'image/gif')).rejects.toThrow();
  });

  it('saves under a custom folder when provided', async () => {
    const store = make(dir);
    const { key } = await store.save(Buffer.from('x'), 'image/jpeg', 'compositions');
    expect(key).toBe('compositions/id-1.jpg');
    expect(existsSync(join(dir, key))).toBe(true);
  });
});
