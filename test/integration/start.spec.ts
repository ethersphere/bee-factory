/* eslint-disable no-console */
import Dockerode from 'dockerode'
import crypto from 'crypto'

import { run } from '../utils/run'
import { ENV_ENV_PREFIX_KEY } from '../../src/command/start'
import { Bee, BeeDebug, Reference } from '@ethersphere/bee-js'
import { DockerError } from '../../src/utils/docker'
import { findContainer, waitForUsablePostageStamp } from '../utils/docker'

const BLOCKCHAIN_VERSION = '1.2.0'
const BEE_VERSION = '1.5.1-d0a77598-stateful'

describe('start command', () => {
  let docker: Dockerode
  let bee: Bee, beeDebug: BeeDebug
  const envPrefix = `bee-factory-test-${crypto.randomBytes(4).toString('hex')}`

  beforeAll(() => {
    docker = new Dockerode()
    bee = new Bee('http://127.0.0.1:1633')
    beeDebug = new BeeDebug('http://127.0.0.1:1635')

    // This will force Bee Factory to create
    process.env[ENV_ENV_PREFIX_KEY] = envPrefix
  })

  afterEach(async () => {
    await run(['stop'])
  })

  afterAll(async () => {
    await run(['stop', '--rm']) // Cleanup the testing containers
  })

  it('should start cluster', async () => {
    // As spinning the cluster with --detach the command will exit once the cluster is up and running
    await run(['start', '--detach', BLOCKCHAIN_VERSION, BEE_VERSION])

    await expect(findContainer(docker, 'queen')).resolves.toBeDefined()
    await expect(findContainer(docker, 'blockchain')).resolves.toBeDefined()
    await expect(findContainer(docker, 'worker-1')).resolves.toBeDefined()
    await expect(findContainer(docker, 'worker-2')).resolves.toBeDefined()
    await expect(findContainer(docker, 'worker-3')).resolves.toBeDefined()
    await expect(findContainer(docker, 'worker-4')).resolves.toBeDefined()

    await expect(beeDebug.getHealth()).resolves.toHaveProperty('status')
  })

  describe('should create docker network', () => {
    beforeAll(async () => {
      await run(['stop', '--rm']) // Cleanup the testing containers

      try {
        // Make sure the network does not exists
        await (await docker.getNetwork(`${envPrefix}-network`)).remove()
      } catch (e) {
        if ((e as DockerError).statusCode !== 404) {
          throw e
        }
      }
    })

    it('', async () => {
      await run(['start', '--detach', BLOCKCHAIN_VERSION, BEE_VERSION])

      expect(docker.getNetwork(`${envPrefix}-network`)).toBeDefined()
    })
  })

  describe('should remove containers with --fresh option', () => {
    let reference: Reference, data: string

    beforeAll(async () => {
      console.log('(before) Starting up Bee Factory')
      await run(['start', '--detach', BLOCKCHAIN_VERSION, BEE_VERSION])

      console.log('(before) Creating postage stamp ')
      const postage = await beeDebug.createPostageBatch('10', 18)

      console.log('(before) Waiting for the postage stamp to be usable')
      await waitForUsablePostageStamp(beeDebug, postage)
      data = `hello from ${Date.now()}`
      reference = (await bee.uploadData(postage, data)).reference

      // Lets just verify that it the current container has the data
      expect((await bee.downloadData(reference)).text()).toEqual(data)

      console.log('(before) Stopping the Bee Factory')
      await run(['stop'])
    })

    it('', async () => {
      console.log('(test) Starting the Bee Factory')
      await run(['start', '--fresh', '--detach', BLOCKCHAIN_VERSION, BEE_VERSION])

      console.log('(test) Trying to fetch the data')
      await expect(bee.downloadData(reference)).rejects.toHaveProperty('status', 404)
    })
  })
})
