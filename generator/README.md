# Bee Factory Generator
This project builds up a test environment with Bee clients and with a test blockchain.
The created environment is runnable on local machine as well.

All services run in `Docker` containers only.

Currently, the repository supports running Bee nodes up to 5 by default.

## Maintainers

- [nugaon](https://github.com/nugaon)
- [Cafe137](https://github.com/Cafe137)

See what "Maintainer" means [here](https://github.com/ethersphere/repo-maintainer).

## Usage
The whole Bee environment (with blockchain) can be started by [running one script](###Run-Environment),
but for that you need to have the necessary Docker images, which is possible to build yourself by [running some scripts](###Setup-the-environment)

First you may want to set all global variables that the scripts will use.
For that, there is a [.env](scripts/.env) file which contains all necessary variables that you need.

```sh
set -a && source ./scripts/.env && set +a
```

If you do not set these global variables, the scripts will use those which are available in the [.env](scripts/.env) file.

## Setup the environment

Create the common Docker network for the environment with

```sh
./scripts/network.sh
```

To start the blockchain, run the following command in the root directory of the project:

```sh
./scripts/blockchain.sh
```

After that, it's possible to deploy Swarm smart contracts

```sh
npm run migrate:contracts
```

Before you start the Bee nodes with the deployed Swap Factory, you have to fund your overlay addresses of your Bee nodes for the successful start.
The [supply.js](src/supply.js) script can fund the addresses which are defined in [bee-overlay-addresses.json](bee-overlay-addresses.json) file.
To run this script just execute

```sh
npm run supply
```

and the configured accounts will get 1 ether and 100 BZZ Token.

After all above went successfully you can start the Bee nodes

```sh
./scripts/bee.sh start --workers=4
```

OR it is possible to build docker images on a desired state, so that a fresh environment can be started on each run.

### Build Docker Images

Basically, a full-featured Bee environment has 2 types of Docker image:

- Bee images: Bee clients with pre-defined keys (and optionally including the state which you nodes have in its [data-dirs](scripts/bee-data-dirs))
```sh
./scripts/bee-docker-build.sh
```
- Blockchain image: Ganache blockchain which you may want to take a snapshot of after the contracts are deployed and the pre-defined Bee client keys are funded already.
```sh
./scripts/blockchain-docker-build.sh
```

## Index Environment

If you have all Docker images that your [environment file](scripts/.env) requires,
start the Bee cluster

```sh
./scripts/environment.sh start
```

### Restricted API

If you want to enable permission check feature of Bee on the API endpoints you can use `--restrict` flag. This will
use default password `SwarmToTheMoon` or if you want you can pass your own password as `--restrict=someOtherPassword`.

This feature requires to have `htpasswd` command available which is part of the `apache2-utils` package.

### Pull images

Bee Factory can build images for CIs, but it is also possible to pull image to your computer as well.

For that you have to login to the Github docker registry with

```sh
docker login docker.pkg.github.com
```

it will ask for your _GitHub_ username and for the password. For the latter you can generate a [Personal Access Token](https://github.com/settings/tokens).
The suggested permissions for the token are `read:org` and `read:packages`.

## Utilities

It is possible to generate random traffic in your cluster:

```sh
$ npm run gen:traffic
```

The script is in an infinite loop, so if you want to stop the generation you have to terminate it manually in your terminal by pressing `Ctrl^C`.

If you don't specify any parameters it will produce 400 chunks/0.5 sec that the script tries to upload on the `http://localhost:1633` - that is the binded port of the queen node if you orchestrated the environment with the `envrionment.sh`.

The following way you can pass parameter

1. MIN_CHEQUE_NUMBER - Minimum required cheques for Bee under the given BEE_DEBUG_API_URL. If -1 then it does not check for cheques [Number,Default:-1]
2. BEE_API_URL;BEE_DEBUG_API_URL - Bee API and Debug API URL separated by semicolon. The random data will sent to the Bee API URL, and the generated cheques will be checked on the Bee Debug URL. The two URLs should belong to different Bee clients as the generated data will propagate from that client to the network. [string,Default:'http://localhost:1633;http://localhost:11635']

```sh
$ npm run gen:traffic -- <MIN_CHEQUE_NUMBER> <BEE_API_URL;BEE_DEBUG_API_URL> <BEE_API_URL;BEE_DEBUG_API_URL> (...)
```

e.g.

```sh
$ npm run gen:traffic -- 2 http://localhost:1633;http://localhost:11635
```

With the example above, random data will be generated until _minimum_ two cheques will generated on Bee client that serves debug endpoint `http://localhost:11635`
