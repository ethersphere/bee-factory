#!/bin/bash

set -o errexit
set -o pipefail

MY_PATH=$(dirname "$0")
MY_PATH=$( cd "$MY_PATH" && pwd )
# Check used system variable set
BEE_ENV_PREFIX=$("$MY_PATH/utils/env-variable-value.sh" BEE_ENV_PREFIX)

NETWORK="$BEE_ENV_PREFIX-network"
if ! eval "docker network inspect $NETWORK > /dev/null" ; then
  echo "Creating $NETWORK..."
  docker network create $NETWORK
fi
