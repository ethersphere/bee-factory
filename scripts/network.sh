#!/bin/bash
NETWORK="swarm-test-network"
if ! `docker network inspect $NETWORK > /dev/null` ; then
  echo "Creating $NETWORK..."
  docker network create swarm-test-network
fi