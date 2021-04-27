#!/bin/bash
MY_PATH=`dirname "$0"`
MY_PATH=`( cd "$MY_PATH" && pwd )`
# Check used system variable set
BEE_ENV_PREFIX=`$MY_PATH/utils/env-variable-value.sh BEE_ENV_PREFIX`
BEE_IMAGE_PREFIX=`$MY_PATH/utils/env-variable-value.sh BEE_IMAGE_PREFIX`
BEE_VERSION=`$MY_PATH/utils/env-variable-value.sh BEE_VERSION`

NAME="$BEE_ENV_PREFIX-blockchain"

echo "Make a snapshot from the blockchain..."
docker commit $NAME $BEE_IMAGE_PREFIX/$NAME:$BEE_VERSION
