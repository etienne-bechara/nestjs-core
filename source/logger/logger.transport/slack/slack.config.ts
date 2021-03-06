import { Injectable } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

import { AppEnvironment } from '../../../app/app.enum';
import { InjectSecret } from '../../../config/config.decorator';
import { LoggerConfig } from '../../logger.config';
import { LoggerLevel } from '../../logger.enum';

@Injectable()
export class SlackConfig extends LoggerConfig {

  @InjectSecret()
  @IsOptional()
  @IsUrl()
  public readonly SLACK_WEBHOOK: string;

  @InjectSecret()
  @IsOptional()
  @IsString() @IsNotEmpty()
  public readonly SLACK_CHANNEL: string;

  @InjectSecret()
  @IsOptional()
  @IsString() @IsNotEmpty()
  public readonly SLACK_USERNAME: string;

  @InjectSecret()
  @IsOptional()
  @IsUrl()
  public readonly SLACK_ICON_URL: string;

  @InjectSecret({
    default: (nodeEnv) => {
      switch (nodeEnv) {
        case AppEnvironment.LOCAL: return null;
        case AppEnvironment.DEVELOPMENT: return LoggerLevel.WARNING;
        case AppEnvironment.STAGING: return LoggerLevel.WARNING;
        case AppEnvironment.PRODUCTION: return LoggerLevel.WARNING;
      }
    },
  })
  public readonly SLACK_LEVEL: LoggerLevel;

}
