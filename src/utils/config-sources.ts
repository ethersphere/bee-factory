import { readFile as readFileCb } from 'fs'
import * as path from 'path'
import { promisify } from 'util'

const readFile = promisify(readFileCb)
const VERSION_REGEX = /^\d\.\d\.\d(-\w+)*$/

export function stripCommit(version: string): string {
  if (!VERSION_REGEX.test(version)) {
    throw new Error('The version does not have expected format!')
  }

  // If the version contains commit ==> hash remove it
  return version.replace(/(-\w+)+$/g, '')
}

async function searchPackageJson(): Promise<string | undefined> {
  const expectedPath = path.join(process.cwd(), 'package.json')
  const pkgJson = JSON.parse(await readFile(expectedPath, { encoding: 'utf8' }))

  return pkgJson?.engines?.bee
}

async function searchBeeFactory(): Promise<string | undefined> {
  const expectedPath = path.join(process.cwd(), '.beefactory.json')
  const pkgJson = JSON.parse(await readFile(expectedPath, { encoding: 'utf8' }))

  return pkgJson?.version
}

export async function findBeeVersion(): Promise<string> {
  const packageJson = await searchPackageJson()

  if (packageJson) {
    return packageJson
  }

  const beeFactory = await searchBeeFactory()

  if (beeFactory) {
    return beeFactory
  }

  throw new Error('Bee Version was not specified nor it is present in expected external places!')
}
