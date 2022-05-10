#!/bin/bash
set -o errexit
set -o pipefail

MY_PATH=$(dirname "$0")
MY_PATH=$( cd "$MY_PATH" && pwd )
# Check used system variable set
BEE_ENV_PREFIX=$("$MY_PATH/utils/env-variable-value.sh" BEE_ENV_PREFIX)

NETWORK="$BEE_ENV_PREFIX-network"
NAME="$BEE_ENV_PREFIX-blockchain"
CONTAINER_IN_DOCKER=$(docker container ls -qaf name=$NAME)

if [ -z "$CONTAINER_IN_DOCKER" ]; then
  # necessary "-b 1" because anyway the Bee throws Error: waiting backend sync: Post "http://swarm-test-blockchain:9545": EOF
  docker run \
    -p 9545:9545 \
    --network $NETWORK \
    --name $NAME -d \
    trufflesuite/ganache \
      --wallet.deterministic --chain.networkId 4020 -h 0.0.0.0 -p 9545 \
      --miner.blockTime 2 \
      --chain.chainId 4020 \
      --database.dbPath swarm-testchain --miner.blockGasLimit 6721975
else
  docker start $NAME
fi
