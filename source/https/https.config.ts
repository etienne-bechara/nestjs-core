import { Injectable } from '@nestjs/common';

import { AppEnvironment } from '../app/app.enum';
import { InjectSecret } from '../config/config.decorator';

@Injectable()
export class HttpsConfig {

  @InjectSecret()
  public readonly NODE_ENV: AppEnvironment;

  // 1 minute
  public readonly HTTPS_DEFAULT_TIMEOUT = 1 * 60 * 1000;

  // 15 minutes
  public readonly HTTPS_DEFAULT_CACHE_MAX_AGE = 15 * 60 * 1000;

  // 10.000 cached requests (per instance)
  public readonly HTTPS_DEFAULT_CACHE_LIMIT = 10000;

}