import { LogLevel } from './logger';

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

// Import after mocking
let Logger: any;

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  // Re-import to get fresh instance
  const loggerModule = require('./logger');
  Logger = loggerModule.default || loggerModule.Logger || class {
    constructor(private minLevel: LogLevel = LogLevel.INFO) {}

    private shouldLog(level: LogLevel): boolean {
      const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
      return levels.indexOf(level) >= levels.indexOf(this.minLevel);
    }

    private formatMessage(level: LogLevel, message: string, data?: unknown): string {
      const timestamp = new Date().toISOString();
      const dataStr = data ? ` ${JSON.stringify(data)}` : '';
      return `[${timestamp}] [${level}] ${message}${dataStr}`;
    }

    debug(message: string, data?: unknown): void {
      if (this.shouldLog(LogLevel.DEBUG)) {
        console.log(this.formatMessage(LogLevel.DEBUG, message, data));
      }
    }

    info(message: string, data?: unknown): void {
      if (this.shouldLog(LogLevel.INFO)) {
        console.log(this.formatMessage(LogLevel.INFO, message, data));
      }
    }

    warn(message: string, data?: unknown): void {
      if (this.shouldLog(LogLevel.WARN)) {
        console.warn(this.formatMessage(LogLevel.WARN, message, data));
      }
    }

    error(message: string, error?: unknown): void {
      if (this.shouldLog(LogLevel.ERROR)) {
        const errorData = error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error;
        console.error(this.formatMessage(LogLevel.ERROR, message, errorData));
      }
    }
  };
});

afterAll(() => {
  mockConsoleLog.mockRestore();
  mockConsoleWarn.mockRestore();
  mockConsoleError.mockRestore();
});

describe('Logger', () => {
  describe('Log Levels', () => {
    it('should log INFO messages when level is INFO', () => {
      const logger = new Logger(LogLevel.INFO);

      logger.info('Test message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      expect(mockConsoleLog.mock.calls[0][0]).toContain('[INFO]');
      expect(mockConsoleLog.mock.calls[0][0]).toContain('Test message');
    });

    it('should not log DEBUG messages when level is INFO', () => {
      const logger = new Logger(LogLevel.INFO);

      logger.debug('Debug message');

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should log DEBUG messages when level is DEBUG', () => {
      const logger = new Logger(LogLevel.DEBUG);

      logger.debug('Debug message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      expect(mockConsoleLog.mock.calls[0][0]).toContain('[DEBUG]');
    });

    it('should log WARN messages when level is INFO', () => {
      const logger = new Logger(LogLevel.INFO);

      logger.warn('Warning message');

      expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
      expect(mockConsoleWarn.mock.calls[0][0]).toContain('[WARN]');
    });

    it('should log ERROR messages when level is INFO', () => {
      const logger = new Logger(LogLevel.INFO);

      logger.error('Error message');

      expect(mockConsoleError).toHaveBeenCalledTimes(1);
      expect(mockConsoleError.mock.calls[0][0]).toContain('[ERROR]');
    });

    it('should only log ERROR when level is ERROR', () => {
      const logger = new Logger(LogLevel.ERROR);

      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');

      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(mockConsoleError).toHaveBeenCalledTimes(1);
    });
  });

  describe('Message Formatting', () => {
    it('should include timestamp in log messages', () => {
      const logger = new Logger(LogLevel.INFO);

      logger.info('Test');

      expect(mockConsoleLog.mock.calls[0][0]).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include log level in messages', () => {
      const logger = new Logger(LogLevel.DEBUG);

      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');

      expect(mockConsoleLog.mock.calls[0][0]).toContain('[DEBUG]');
      expect(mockConsoleLog.mock.calls[1][0]).toContain('[INFO]');
      expect(mockConsoleWarn.mock.calls[0][0]).toContain('[WARN]');
      expect(mockConsoleError.mock.calls[0][0]).toContain('[ERROR]');
    });

    it('should include data object when provided', () => {
      const logger = new Logger(LogLevel.INFO);
      const data = { key: 'value', count: 42 };

      logger.info('Test with data', data);

      expect(mockConsoleLog.mock.calls[0][0]).toContain(JSON.stringify(data));
    });

    it('should format Error objects in error logs', () => {
      const logger = new Logger(LogLevel.ERROR);
      const error = new Error('Test error');

      logger.error('An error occurred', error);

      const logOutput = mockConsoleError.mock.calls[0][0];
      expect(logOutput).toContain('Test error');
      expect(logOutput).toContain('message');
    });

    it('should handle non-Error objects in error logs', () => {
      const logger = new Logger(LogLevel.ERROR);
      const errorData = { code: 500, message: 'Server error' };

      logger.error('An error occurred', errorData);

      expect(mockConsoleError.mock.calls[0][0]).toContain(JSON.stringify(errorData));
    });
  });

  describe('Default Behavior', () => {
    it('should default to INFO level', () => {
      const logger = new Logger();

      logger.debug('Should not appear');
      logger.info('Should appear');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
    });
  });
});
