#!/bin/bash
MY_PATH=`dirname "$0"`
MY_PATH=`( cd "$MY_PATH" && pwd )`
# Check used system variable set
source $MY_PATH/utils/check-variable-defined.sh BEE_ENV_PREFIX

NETWORK="$BEE_ENV_PREFIX-network"
if ! `docker network inspect $NETWORK > /dev/null` ; then
  echo "Creating $NETWORK..."
  docker network create $NETWORK
fi
