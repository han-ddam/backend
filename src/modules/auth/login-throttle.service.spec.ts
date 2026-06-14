import { HttpException } from '@nestjs/common';
import { LoginThrottleService } from './login-throttle.service';

describe('LoginThrottleService', () => {
  let redis: any;
  let service: LoginThrottleService;

  beforeEach(() => {
    redis = {
      get: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      del: jest.fn(),
    };
    service = new LoginThrottleService(redis);
  });

  it('does not throw below the failure threshold', async () => {
    redis.get.mockResolvedValue('4');
    await expect(service.assertNotLocked('a@x.com')).resolves.toBeUndefined();
  });

  it('throws (429) once the threshold is reached', async () => {
    redis.get.mockResolvedValue('5');
    await expect(service.assertNotLocked('a@x.com')).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('sets a TTL on the first failure only', async () => {
    redis.incr.mockResolvedValueOnce(1);
    await service.recordFailure('a@x.com');
    expect(redis.expire).toHaveBeenCalledWith('login:fail:a@x.com', 900);

    redis.expire.mockClear();
    redis.incr.mockResolvedValueOnce(2);
    await service.recordFailure('a@x.com');
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it('clears the counter on reset', async () => {
    await service.reset('A@X.com');
    expect(redis.del).toHaveBeenCalledWith('login:fail:a@x.com');
  });
});
