/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/en/configuration.html
 */
import type { Config } from '@jest/types'

export default async (): Promise<Config.InitialOptions> => {
  return {
    preset: 'ts-jest',
    runner: '@ethersphere/jest-serial-runner',
    testRegex: 'test/integration/.*\\.spec\\.ts',
    testEnvironment: 'node',

    // Indicates whether the coverage information should be collected while executing the test
    // collectCoverage: false,

    // The directory where Jest should output its coverage files
    coverageDirectory: 'coverage',

    // An array of regexp pattern strings used to skip coverage collection
    coveragePathIgnorePatterns: ['/node_modules/'],

    // An array of directory names to be searched recursively up from the requiring module's location
    moduleDirectories: ['node_modules'],

    // The root directory that Jest should scan for tests and modules within
    rootDir: 'test',

    // Increase timeout since we are spinning Bee containers
    testTimeout: 4 * 60 * 1000,

    // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
    testPathIgnorePatterns: ['/node_modules/'],
  }
}
