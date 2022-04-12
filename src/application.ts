import { Application } from 'furious-commander/dist/application'
import PackageJson from '../package.json'

export const application: Application = {
  name: 'Bee Factory',
  command: 'bee-factory',
  description: 'Orchestration CLI for spinning up local development Bee cluster with Docker',
  version: PackageJson.version,
  autocompletion: 'fromOption',
}
