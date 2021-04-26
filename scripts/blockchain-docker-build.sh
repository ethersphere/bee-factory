#!/bin/bash
MY_PATH=`dirname "$0"`
MY_PATH=`( cd "$MY_PATH" && pwd )`
# Check used system variable set
source $MY_PATH/utils/check-variable-defined.sh BEE_ENV_PREFIX

NAME="$BEE_ENV_PREFIX-blockchain"

echo "Make a snapshot from the blockchain..."
docker commit $NAME $NAME
