#!/bin/bash
NAME=swarm-test-blockchain
CONTAINER_IN_DOCKER=`docker container ls -qaf name=$NAME`

if [ -z "$CONTAINER_IN_DOCKER" ]; then
  docker run \
    -p 127.0.0.1:9545:9545 \
    --network swarm-test-network \
    --name swarm-test-blockchain -d \
    trufflesuite/ganache-cli ganache-cli \
      -d -i 4020 -h 0.0.0.0 -p 9545 \
      --db swarm-testchain --gasLimit 6721975
else
  docker start $NAME
fi