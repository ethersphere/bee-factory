# Bee Factory
This project builds up a test environment with Bee clients and with a test blockchain.
The created environment is runnable on local machine as well.

All services run in `Docker` containers only.

Currently, the repository supports running Bee nodes up to 5 by default.

# Usage
You can setup the whole environment that Bee needs by running some scripts

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
$ npm run migrate:chequebook
```

Before you start the Bee nodes with the deployed Swap Factory, you have to fund your overlay addresses of your Bee nodes for the successful start.
The [supply.js](src/supply.js) script can fund the addresses which are defined in [bee-overlay-addresses.json](bee-overlay-addresses.json) file.
To run this script just execute

```sh
$ npm run supply
```

and the configured accounts will get 1 ether and 100 BZZ Token.

After all above went successfully you can start the Bee nodes.

```sh
$ ./scripts/bee.sh start --workers=4
```
