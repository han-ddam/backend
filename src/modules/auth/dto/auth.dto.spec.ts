import { EmailSignupDto, EmailLoginDto } from './auth.dto';

describe('EmailSignupDto', () => {
  it('accepts valid input', () => {
    expect(() => EmailSignupDto.create({ email: 't@x.com', password: 'password1', displayName: '테스터' })).not.toThrow();
  });
  it('rejects bad email', () => {
    expect(() => EmailSignupDto.create({ email: 'nope', password: 'password1' })).toThrow();
  });
  it('rejects password shorter than 8', () => {
    expect(() => EmailSignupDto.create({ email: 't@x.com', password: 'short' })).toThrow();
  });
});

describe('EmailLoginDto', () => {
  it('rejects empty password', () => {
    expect(() => EmailLoginDto.create({ email: 't@x.com', password: '' })).toThrow();
  });
});
