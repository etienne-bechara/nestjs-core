import { HttpException, Injectable } from '@nestjs/common';
import { decycle } from 'cycle';

import { LoggerConfig } from './logger.config';
import { LoggerLevel } from './logger.enum';
import { LoggerParams, LoggerTransport } from './logger.interface';

@Injectable()
export class LoggerService {

  private transports: LoggerTransport[] = [ ];
  private pendingLogs: LoggerParams[] = [ ];

  public constructor(
    private readonly loggerConfig: LoggerConfig,
  ) {
    this.setupLogger();
  }

  /**
   * Adds an event listener to catch uncaught exceptions.
   */
  private setupLogger(): void {
    const env = this.loggerConfig.NODE_ENV;
    this.debug(`[LoggerService] Environment configured as ${env}`);

    process.on('uncaughtException', (err) => {
      this.error(err, { unexpected: true });
    });
  }

  /**
   * Given an already instantiated transport, check if it is
   * enabled for current environment and register it at the
   * array of publishers.
   * @param transport
   */
  public registerTransport(transport: LoggerTransport): void {
    const level = transport.getLevel();

    if (level || level === 0) {
      this.transports.push(transport);
    }
  }

  /**
   * Isolates incoming message, error and data, and publishes
   * the event to all registered transports with configured
   * severity equal or lower.
   * @param level
   * @param message
   * @param data
   */
  private log(level: LoggerLevel, message: string | Error, ...data: (Error | Record<string, any>)[]): void {
    const logBatch: LoggerParams[] = [ ...this.pendingLogs ];

    const logMessage: LoggerParams = {
      level,
      message: this.getLogMessage(message),
      error: this.getLogError(message, ...data),
      data: this.getLogData(message, ...data),
    };

    if (this.transports.length === 0) {
      this.pendingLogs.push(logMessage);
      return;
    }

    this.pendingLogs = [ ];
    logBatch.push(logMessage);

    for (const transport of this.transports) {
      const transportLevel = transport.getLevel();

      for (const logRecord of logBatch) {
        if (logRecord.level <= transportLevel) {
          transport.log(logRecord);
        }
      }
    }
  }

  /**
   * Given an event to log, extract it message.
   * @param message
   */
  private getLogMessage(message: string | Error): string {
    return typeof message === 'string'
      ? message
      : message.message;
  }

  /**
   * Given an event to log, extract its error or exception.
   * If not available in provided argument, generate a new
   * Error object and remove top stack levels.
   * @param message
   * @param data
   */
  private getLogError(message: string | Error, ...data: (Error | Record<string, any>)[]): Error {
    let error = message instanceof Error ? message : undefined;

    if (!error) {
      for (const detail of data) {
        if (detail instanceof Error) error = detail;
      }

      if (!error) {
        error = new Error(message as string);
        error.stack = error.stack.split('\n').filter((e, i) => i < 1 || i > 3).join('\n');
      }
    }

    return error;
  }

  /**
   * Given an event to log, extract it details.
   * @param message
   * @param data
   */
  private getLogData(message: string | Error, ...data: (Error | Record<string, any>)[]): Record<string, any> {
    if (message instanceof HttpException) {
      data.push(message);
    }

    let dataObject = { };

    for (const record of data) {
      if (record instanceof HttpException) {
        const details = record.getResponse();

        if (details && typeof details === 'object') {
          dataObject = { ...dataObject, ...details };
        }
      }
      else if (!(record instanceof Error)) {
        dataObject = { ...dataObject, ...record };
      }
    }

    return Object.keys(dataObject).length > 0
      ? this.sanitize(dataObject)
      : undefined;
  }

  /**
   * Check if object has any keys matching blacklist and remove them.
   * If any key value is undefined, delete it.
   * @param object
   * @param decycled
   */
  public sanitize(object: any, decycled: boolean = false): any {
    if (typeof object !== 'object') return object;
    if (!decycled) object = decycle(object);

    if (Array.isArray(object)) {
      const clone = [ ...object ];
      return clone.map((o) => this.sanitize(o, true));
    }

    const clone = { ...object };

    for (const key in clone) {
      const alphaKey = key.toLowerCase().replace(/[^a-z]+/g, '');

      if (clone[key] === undefined) {
        delete clone[key];
      }
      else if (this.loggerConfig.LOGGER_SENSITIVE_KEYS.includes(alphaKey)) {
        clone[key] = '[filtered]';
      }
      else if (typeof clone[key] === 'object') {
        clone[key] = this.sanitize(clone[key], true);
      }
    }

    return clone;
  }

  /**
   * Logs a FATAL event and KILLS the application.
   * @param message
   * @param data
   */
  public fatal(message: string | Error, ...data: (Error | Record<string, any>)[]): void {
    this.log(LoggerLevel.FATAL, message, ...data);
    // eslint-disable-next-line unicorn/no-process-exit
    setTimeout(() => process.exit(1), 2000);
  }

  /**
   * Logs a CRITICAL event.
   * @param message
   * @param data
   */
  public critical(message: string | Error, ...data: (Error | Record<string, any>)[]): void {
    return this.log(LoggerLevel.CRITICAL, message, ...data);
  }

  /**
   * Logs an ERROR event.
   * @param message
   * @param data
   */
  public error(message: string | Error, ...data: (Error | Record<string, any>)[]): void {
    return this.log(LoggerLevel.ERROR, message, ...data);
  }

  /**
   * Logs a WARNING event.
   * @param message
   * @param data
   */
  public warning(message: string | Error, ...data: (Error | Record<string, any>)[]): void {
    return this.log(LoggerLevel.WARNING, message, ...data);
  }

  /**
   * Logs a NOTICE event.
   * @param message
   * @param data
   */
  public notice(message: string | Error, ...data: (Error | Record<string, any>)[]): void {
    return this.log(LoggerLevel.NOTICE, message, ...data);
  }

  /**
   * Logs an INFO event.
   * @param message
   * @param data
   */
  public info(message: string | Error, ...data: (Error | Record<string, any>)[]): void {
    return this.log(LoggerLevel.INFO, message, ...data);
  }

  /**
   * Logs a HTTP event.
   * @param message
   * @param data
   */
  public http(message: string | Error, ...data: (Error | Record<string, any>)[]): void {
    return this.log(LoggerLevel.HTTP, message, ...data);
  }

  /**
   * Logs a DEBUG event.
   * @param message
   * @param data
   */
  public debug(message: string | Error, ...data: (Error | Record<string, any>)[]): void {
    return this.log(LoggerLevel.DEBUG, message, ...data);
  }

  /**
   * Logs a TRACE event.
   * @param message
   * @param data
   */
  public trace(message: string | Error, ...data: (Error | Record<string, any>)[]): void {
    return this.log(LoggerLevel.TRACE, message, ...data);
  }

}
