import 'source-map-support/register';
import 'reflect-metadata';

import { ClassSerializerInterceptor, DynamicModule, Global, INestApplication, MiddlewareConsumer, Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE, NestFactory } from '@nestjs/core';
import { json } from 'body-parser';

import { ConfigModule } from '../config/config.module';
import { LoggerConfig } from '../logger/logger.config';
import { LoggerModule } from '../logger/logger.module';
import { LoggerService } from '../logger/logger.service';
import { ConsoleConfig } from '../logger/logger.transport/console/console.config';
import { ConsoleModule } from '../logger/logger.transport/console/console.module';
import { SentryConfig } from '../logger/logger.transport/sentry/sentry.config';
import { SentryModule } from '../logger/logger.transport/sentry/sentry.module';
import { SlackConfig } from '../logger/logger.transport/slack/slack.config';
import { SlackModule } from '../logger/logger.transport/slack/slack.module';
import { UtilModule } from '../util/util.module';
import { AppConfig } from './app.config';
import { AppFilter } from './app.filter';
import { AppLoggerInterceptor, AppTimeoutInterceptor } from './app.interceptor';
import { AppBootOptions } from './app.interface/app.boot.options';
import { AppMiddleware } from './app.middleware';

@Global()
@Module({ })
export class AppModule {

  private static bootOptions: AppBootOptions;

  /**
   * Returns final boot options after applying default values.
   */
  public static getBootOptions(): AppBootOptions {
    return this.bootOptions;
  }

  /**
   * Applies a global middleware that acts on
   * request before anything else.
   * @param consumer
   */
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AppMiddleware).forRoutes('*');
  }

  /**
   * Starts Express server through Nest JS framework.
   * Apply the following customizations according to config:
   * • Configure CORS
   * • Set JSON limit
   * • Disable timeout (handled in custom interceptor).
   * @param options
   */
  public static async bootServer(options: AppBootOptions = { }): Promise<INestApplication> {
    const entryModule = this.buildEntryModule(options);

    const nestApp = await NestFactory.create(entryModule, {
      logger: [ 'error', 'warn' ],
    });

    const appConfig: AppConfig = nestApp.get(AppConfig);
    const loggerService: LoggerService = nestApp.get(LoggerService);

    options.jsonLimit ??= appConfig.APP_DEFAULT_JSON_LIMIT;
    options.cors ??= appConfig.APP_DEFAULT_CORS_OPTIONS;
    options.timeout ??= appConfig.APP_DEFAULT_TIMEOUT;
    options.httpErrors ??= appConfig.APP_DEFAULT_HTTP_ERRORS;

    nestApp.setGlobalPrefix(appConfig.APP_GLOBAL_PREFIX);
    nestApp.use(json({ limit: options.jsonLimit }));
    nestApp.enableCors(options.cors);

    const httpServerPort = appConfig.APP_PORT;
    const httpServer = await nestApp.listen(httpServerPort);

    const timeoutStr = options.timeout ? `set to ${(options.timeout / 1000).toString()}s` : 'disabled';
    httpServer.setTimeout(0);

    loggerService.debug(`[AppService] Server timeout ${timeoutStr}`);
    loggerService.notice(`[AppService] Server listening on port ${httpServerPort}`);

    this.bootOptions = options;
    return nestApp;
  }

  /**
   * Given desired boot options, build the module that will act
   * as entry point for the cascade initialization.
   * @param options
   */
  private static buildEntryModule(options: AppBootOptions = { }): DynamicModule {
    if (!options.configs) options.configs = [ ];
    if (!options.modules) options.modules = [ ];
    if (!options.controllers) options.controllers = [ ];
    if (!options.providers) options.providers = [ ];
    if (!options.imports) options.imports = [ ];
    if (!options.exports) options.exports = [ ];

    return {
      module: AppModule,
      controllers: options.controllers,
      providers: this.buildEntryProviders(options),
      imports: this.buildEntryModules(options, 'imports'),
      exports: [
        AppConfig,
        ...options.providers,
        ...this.buildEntryModules(options, 'exports'),
      ],
    };
  }

  /**
   * Merge default, project source and user provided configs.
   * @param options
   */
  private static buildEntryConfigs(options: AppBootOptions): any[] {
    const preloadedConfigs = [
      AppConfig,
      LoggerConfig,
      ConsoleConfig,
      SentryConfig,
      SlackConfig,
    ];

    if (!options.disableConfigScan) {
      const sourceConfigs = UtilModule.globRequire([
        's*rc*/**/*.config.{js,ts}',
        '!**/*test*',
      ]);
      preloadedConfigs.push(...sourceConfigs);
    }

    return [ ...preloadedConfigs, ...options.configs ];
  }

  /**
   * Merge defaults, project source and user provided modules.
   * @param options
   * @param type
   */
  private static buildEntryModules(options: AppBootOptions, type: 'imports' | 'exports'): any[] {
    const preloadedModules: any[] = [ ];

    const defaultModules: any[] = [
      ConsoleModule,
      LoggerModule,
      SentryModule,
      SlackModule,
      UtilModule,
    ];

    if (type === 'imports') {
      preloadedModules.push(
        ConfigModule.registerAsync({
          envPath: options.envPath,
          configs: this.buildEntryConfigs(options),
        }),
        ...defaultModules,
      );
    }
    else {
      preloadedModules.push(
        ConfigModule,
        ...defaultModules,
      );
    }

    if (!options.disableModuleScan) {
      const sourceModules = UtilModule.globRequire([
        's*rc*/**/*.module.{js,ts}',
        '!**/*test*',
      ]).reverse();
      preloadedModules.push(...sourceModules);
    }

    if (type === 'imports') {
      preloadedModules.push(...options.imports);
    }
    else {
      preloadedModules.push(...options.exports);
    }

    return [ ...preloadedModules, ...options.modules ];
  }

  /**
   * Adds exception filter, serializer, logger, timeout
   * and validation pipe.
   * @param options
   */
  private static buildEntryProviders(options: AppBootOptions): any[] {
    const preloadedProviders: any[] = [ AppConfig ];

    if (!options.disableFilters) {
      preloadedProviders.push({
        provide: APP_FILTER,
        useClass: AppFilter,
      });
    }

    if (!options.disableInterceptors) {
      preloadedProviders.push(
        { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
        { provide: APP_INTERCEPTOR, useClass: AppLoggerInterceptor },
        { provide: APP_INTERCEPTOR, useClass: AppTimeoutInterceptor },
      );
    }

    if (!options.disablePipes) {
      preloadedProviders.push({
        provide: APP_PIPE,
        useFactory: (): ValidationPipe => new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      });
    }

    return [ ...preloadedProviders, ...options.providers ];
  }

}
