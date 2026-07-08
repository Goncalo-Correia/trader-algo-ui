import { AppError, isAppError } from './app-error';

describe('isAppError', () => {
  it('accepts a well-formed AppError', () => {
    const err: AppError = { message: 'boom', status: 500, cause: new Error('x') };
    expect(isAppError(err)).toBe(true);
  });

  it('rejects null, non-objects, and shapes missing message/status', () => {
    expect(isAppError(null)).toBe(false);
    expect(isAppError('nope')).toBe(false);
    expect(isAppError({ status: 500 })).toBe(false);
    expect(isAppError({ message: 'x' })).toBe(false);
    expect(isAppError({ message: 'x', status: '500' })).toBe(false);
  });
});
