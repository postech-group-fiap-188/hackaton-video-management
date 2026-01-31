import { AppError } from './app-error';

describe('AppError', () => {
  it('keeps message/code/statusCode', () => {
    const err = new AppError('Nope', 'NOPE', 418);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Nope');
    expect(err.code).toBe('NOPE');
    expect(err.statusCode).toBe(418);
  });
});
