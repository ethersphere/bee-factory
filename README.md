# Bee Factory
This project builds up a test environment with Bee clients and with a test blockchain.
The created environment is runnable on local machine as well.

All services run in `Docker` containers only.

Currently, the repository supports running Bee nodes up to 5 by default.

# Usage
The whole Bee environment (with blockchain) can be started by [running one script](###Run-Environment),
but for that you need to have the necessary Docker images, which is possible to build yourself by [running some scripts](###Setup-the-environment)

First you may want to set all global variables that the scripts will use.
For that, there is a [.env](scripts/.env) file which contains all necessary variables that you need.

```sh
$ set -a && source ./scripts/.env && set +a
```

If you do not set these global variables, the scripts will use those which are available in the [.env](scripts/.env) file.

## Setup the environment

Create the common Docker network for the environment with

```sh
$ ./scripts/network.sh
```

To start the blockchain, run the following command in the root directory of the project:

```sh
$ ./scripts/blockchain.sh
```

After that, it's possible to deploy Swarm smart contracts

```sh
$ npm run migrate:contracts
```

Before you start the Bee nodes with the deployed Swap Factory, you have to fund your overlay addresses of your Bee nodes for the successful start.
The [supply.js](src/supply.js) script can fund the addresses which are defined in [bee-overlay-addresses.json](bee-overlay-addresses.json) file.
To run this script just execute

```sh
$ npm run supply
```

and the configured accounts will get 1 ether and 100 BZZ Token.

After all above went successfully you can start the Bee nodes

```sh
$ ./scripts/bee.sh start --workers=4
```

OR it is possible to build docker images on a desired state, so that a fresh environment can be started on each run.

### Build Docker Images

Basically, a full-featured Bee environment has 2 types of Docker image:

- Bee images: Bee clients with pre-defined keys (and optionally including the state which you nodes have in its [data-dirs](scripts/bee-data-dirs))
```sh
$ ./scripts/bee-docker-build.sh
```
- Blockchain image: Ganache blockchain which you may want to take a snapshot of after the contracts are deployed and the pre-defined Bee client keys are funded already.
```sh
$ ./scripts/blockchain-docker-build.sh
```

## Run Environment

If you have all Docker images that your [environment file](scripts/.env) requires,
start the Bee cluster

```sh
$ ./scripts/environment.sh start
```

## Utilities

It is possible to generate random traffic in your cluster:

```sh
$ npm run gen:traffic 
```

The script is in an infinite loop, so if you want to stop the generation you have to terminate it manually in your terminal by pressing `Ctrl^C`.

If you don't specify any parameters it will produce 400 chunks/0.5 sec that the script tries to upload on the `http://localhost:1633` - that is the binded port of the queen node if you orchestrated the environment with the `envrionment.sh`.

The following way you can pass parameters

1. HOST - Host that has reachable port to the Bee API. [string,Default:'localhost']
2. SECURE_CONNECTION - whether the connection is HTTPS. [boolean,Default:'false']
3. BEE_SH_PORTS - the traffic generation will try to go through all possible Bee node binding on the host (bee.sh port binding). [boolean,Default:'false']
4. PORT - Bee API Port number of the Bee node. [number,Default:1633]

```sh
$ npm run gen:traffic -- <HOST> <SECURE_CONNECTION> <BEE_SH_PORTS> <PORT>
```

e.g.

```sh
$ npm run gen:traffic -- localhost false false 1633
```
