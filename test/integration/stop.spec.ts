/* eslint-disable no-console */
import Dockerode from 'dockerode'
import crypto from 'crypto'

import { run } from '../utils/run'
import { ENV_ENV_PREFIX_KEY } from '../../src/command/start'
import { findContainer } from '../utils/docker'

describe('stop command', () => {
  let docker: Dockerode
  const envPrefix = `bee-factory-test-${crypto.randomBytes(4).toString('hex')}`

  beforeAll(() => {
    docker = new Dockerode()

    // This will force Bee Factory to create
    process.env[ENV_ENV_PREFIX_KEY] = envPrefix
  })

  afterAll(async () => {
    await run(['stop', '--rm']) // Cleanup the testing containers
  })

  describe('should stop cluster', () => {
    beforeAll(async () => {
      // As spinning the cluster with --detach the command will exit once the cluster is up and running
      await run(['start', '--detach'])
    })

    it('', async () => {
      await expect(findContainer(docker, 'queen')).resolves.toHaveProperty('State.Status', 'running')
      await expect(findContainer(docker, 'blockchain')).resolves.toHaveProperty('State.Status', 'running')
      await expect(findContainer(docker, 'worker-1')).resolves.toHaveProperty('State.Status', 'running')
      await expect(findContainer(docker, 'worker-2')).resolves.toHaveProperty('State.Status', 'running')
      await expect(findContainer(docker, 'worker-3')).resolves.toHaveProperty('State.Status', 'running')
      await expect(findContainer(docker, 'worker-4')).resolves.toHaveProperty('State.Status', 'running')

      await run(['stop'])

      await expect(findContainer(docker, 'queen')).resolves.toHaveProperty('State.Status', 'exited')
      await expect(findContainer(docker, 'blockchain')).resolves.toHaveProperty('State.Status', 'exited')
      await expect(findContainer(docker, 'worker-1')).resolves.toHaveProperty('State.Status', 'exited')
      await expect(findContainer(docker, 'worker-2')).resolves.toHaveProperty('State.Status', 'exited')
      await expect(findContainer(docker, 'worker-3')).resolves.toHaveProperty('State.Status', 'exited')
      await expect(findContainer(docker, 'worker-4')).resolves.toHaveProperty('State.Status', 'exited')
    })
  })

  describe('should stop cluster and remove containers', () => {
    beforeAll(async () => {
      // As spinning the cluster with --detach the command will exit once the cluster is up and running
      await run(['start', '--detach'])
    })

    it('', async () => {
      await expect(findContainer(docker, 'queen')).resolves.toHaveProperty('State.Status', 'running')
      await expect(findContainer(docker, 'blockchain')).resolves.toHaveProperty('State.Status', 'running')
      await expect(findContainer(docker, 'worker-1')).resolves.toHaveProperty('State.Status', 'running')
      await expect(findContainer(docker, 'worker-2')).resolves.toHaveProperty('State.Status', 'running')
      await expect(findContainer(docker, 'worker-3')).resolves.toHaveProperty('State.Status', 'running')
      await expect(findContainer(docker, 'worker-4')).resolves.toHaveProperty('State.Status', 'running')

      await run(['stop', '--rm'])

      await expect(findContainer(docker, 'queen')).rejects.toHaveProperty('statusCode', 404)
      await expect(findContainer(docker, 'blockchain')).rejects.toHaveProperty('statusCode', 404)
      await expect(findContainer(docker, 'worker-1')).rejects.toHaveProperty('statusCode', 404)
      await expect(findContainer(docker, 'worker-2')).rejects.toHaveProperty('statusCode', 404)
      await expect(findContainer(docker, 'worker-3')).rejects.toHaveProperty('statusCode', 404)
      await expect(findContainer(docker, 'worker-4')).rejects.toHaveProperty('statusCode', 404)
    })
  })
})
