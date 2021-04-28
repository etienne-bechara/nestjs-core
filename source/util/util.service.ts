import { Injectable } from '@nestjs/common';
import axios from 'axios';
import os from 'os';
import requestIp from 'request-ip';

import { AppRequest } from '../app/app.interface';
import { LoggerService } from '../logger/logger.service';
import { UtilAppStatus } from './util.interface';
import { UtilRetryParams } from './util.interface/util.retry.params';

@Injectable()
export class UtilService {

  private cachedServerIp: string;

  public constructor(
    private readonly loggerService: LoggerService,
  ) { }

  /**
   * Asynchronously wait for desired amount of milliseconds.
   * @param ms
   */
  public async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Retry a method for configured times or until desired timeout.
   * @param params
   */
  public async retryOnException<T>(params: UtilRetryParams): Promise<T> {
    const txtPrefix = `[UtilService] ${params.name || 'retryOnException()'}:`;
    const txtRetry = params.retries || params.retries === 0 ? params.retries : '∞';
    const txtTimeout = params.timeout ? params.timeout / 1000 : '∞ ';
    const msgStart = `${txtPrefix} running with ${txtRetry} retries and ${txtTimeout}s timeout...`;
    const startTime = Date.now();
    let tentative = 1;
    let result: T;

    this.loggerService.debug(msgStart);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        result = await params.method();
        break;
      }
      catch (e) {
        const elapsed = Date.now() - startTime;

        if (
          (params.retries || params.retries === 0) && tentative > params.retries
          || params.timeout && elapsed > params.timeout
          || params.breakIf?.(e)
        ) {
          throw e;
        }

        tentative++;

        const txtElapsed = `${elapsed / 1000}/${txtTimeout}`;
        const msgRetry = `${txtPrefix} ${e.message} | Retry #${tentative}/${txtRetry}, elapsed ${txtElapsed}s...`;

        this.loggerService.debug(msgRetry);

        await this.sleep(params.delay || 0);
      }
    }

    this.loggerService.debug(`${txtPrefix} finished successfully!`);
    return result;
  }

  /**
   * Given a request object, extracts the client ip.
   * @param req
   */
  public getClientIp(req: AppRequest): string {
    const forwardedIpRegex = /by.+?for=(.+?);/g;
    let forwardedIp;

    if (req.headers.forwarded) {
      forwardedIp = forwardedIpRegex.exec(req.headers.forwarded);
    }

    return forwardedIp
      ? forwardedIp[1]
      : requestIp.getClientIp(req);
  }

  /**
   * Returns current server ip and caches result for future use.
   * In case of error log an exception but do not throw.
   */
  public async getServerIp(): Promise<string> {
    if (!this.cachedServerIp) {
      try {
        const { data } = await axios.get('https://api64.ipify.org', { timeout: 5000 });
        this.cachedServerIp = data;
      }
      catch (e) {
        this.loggerService.warning('[UtilService] Failed to acquire server ip address', e);
      }
    }

    return this.cachedServerIp;
  }

  /**
   * Reads data regarding current runtime and network.
   * Let network acquisition fail if unable to fetch ips.
   */
  public async getAppStatus(): Promise<UtilAppStatus> {
    return {
      system: {
        version: os.version(),
        type: os.type(),
        release: os.release(),
        architecture: os.arch(),
        endianness: os.endianness(),
        uptime: os.uptime(),
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
      },
      cpus: os.cpus(),
      network: {
        publicIp: await this.getServerIp(),
        interfaces: os.networkInterfaces(),
      },
    };
  }

}
