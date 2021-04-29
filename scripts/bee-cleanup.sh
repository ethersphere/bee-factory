#!/bin/bash
echo "Removing 'localstore' and 'statestore' folders from Bee datadirs..."
echo "You may need to pass your password for sudo permission to remove the bee-data folders"

MY_PATH=$(dirname "$0")
MY_PATH=$( cd "$MY_PATH" && pwd )
BEE_DIRS=$(ls "$MY_PATH/bee-data-dirs")
for BEE_DIR in $BEE_DIRS
do
  echo "$BEE_DIR"
  BEE_DIR_PATH="$MY_PATH/bee-data-dirs/$BEE_DIR"
  sudo rm -rf "$BEE_DIR_PATH/localstore"
  sudo rm -rf "$BEE_DIR_PATH/statestore"
done

echo "Removing built Docker images..."

BEE_ENV_PREFIX=$("$MY_PATH/utils/env-variable-value.sh" BEE_ENV_PREFIX)
BEE_VERSION=$("$MY_PATH/utils/env-variable-value.sh" BEE_VERSION)
BEE_IMAGE_PREFIX=$("$MY_PATH/utils/env-variable-value.sh" BEE_IMAGE_PREFIX)
DOCKER_IMAGES=$(docker image ls -qaf reference="$BEE_IMAGE_PREFIX/$BEE_ENV_PREFIX*:$BEE_VERSION")
for DOCKER_IMAGE in $DOCKER_IMAGES
do
  echo "$DOCKER_IMAGE"
  docker image rm "$DOCKER_IMAGE"
done