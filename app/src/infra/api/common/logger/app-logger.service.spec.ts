import { AppLoggerService } from './app-logger.service';

describe('AppLoggerService', () => {
  let service: AppLoggerService;

  beforeEach(() => {
    service = new AppLoggerService();

    (service as unknown as { logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock } }).logger =
      {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
  });

  it('info() deve chamar logger.log com JSON string', () => {
    service.info('hello', { correlationId: 'c1', foo: 123 });

    const logger = (service as unknown as { logger: { log: jest.Mock } }).logger;
    expect(logger.log).toHaveBeenCalledTimes(1);

    const arg = logger.log.mock.calls[0][0] as string;
    expect(JSON.parse(arg)).toEqual({
      message: 'hello',
      correlationId: 'c1',
      foo: 123,
    });
  });

  it('warn() deve chamar logger.warn com JSON string', () => {
    service.warn('warn-msg', { a: 'b' });

    const logger = (service as unknown as { logger: { warn: jest.Mock } }).logger;
    const arg = logger.warn.mock.calls[0][0] as string;

    expect(JSON.parse(arg)).toEqual({ message: 'warn-msg', a: 'b' });
  });

  it('error() deve chamar logger.error com JSON string', () => {
    service.error('err', { x: true });

    const logger = (service as unknown as { logger: { error: jest.Mock } }).logger;
    const arg = logger.error.mock.calls[0][0] as string;

    expect(JSON.parse(arg)).toEqual({ message: 'err', x: true });
  });
});
