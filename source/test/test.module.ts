import { Test } from '@nestjs/testing';
import dotenv from 'dotenv';

import { ConfigModule } from '../config/config.module';
import { UtilModule } from '../util/util.module';
import { TestSandboxOptions } from './test.interface';

/**
 * This does not work as a NestJS module, it serves the purpose
 * of exposing static methods that facilitates execution of tests.
 */
export class TestModule {

  /**
   * Creates a testing sandbox abstracting the instantiation of
   * mandatory providers and adding custom skip conditions.
   * @param options
   */
  public static createSandbox(options: TestSandboxOptions): void {
    const envPath = options.envPath || UtilModule.searchEnvFile();
    const envFile = dotenv.config({ path: envPath }).parsed || { };
    process.env = { ...process.env, ...envFile };

    if (options.skip?.()) {
      // eslint-disable-next-line jest/valid-title, jest/no-disabled-tests
      describe.skip(options.name, () => options.descriptor(null));
      return;
    }

    if (!options.imports) options.imports = [ ];

    if (options.configs) {
      options.imports.unshift(
        ConfigModule.registerAsync({
          configs: options.configs,
        }),
      );
    }

    const testingBuilder = Test.createTestingModule({
      imports: options.imports,
      providers: [
        ...options.providers ? options.providers : [ ],
      ],
      controllers: [
        ...options.controllers ? options.controllers : [ ],
      ],
      exports: [
        ...options.exports ? options.exports : [ ],
      ],
    });

    describe(options.name, () => { // eslint-disable-line jest/valid-title
      console.log = jest.fn(); console.warn = jest.fn(); // eslint-disable-line no-console
      options.descriptor(testingBuilder);
    });
  }

}
