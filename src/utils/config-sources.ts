import { readFile } from 'fs/promises'
import * as path from 'path'

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
