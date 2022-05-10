#!/bin/bash
set -o errexit
set -o pipefail

echo "Removing 'localstore' and 'statestore' folders from Bee datadirs..."
echo "You may need to pass your password for sudo permission to remove the bee-data folders"

MY_PATH=$(dirname "$0")
MY_PATH=$( cd "$MY_PATH" && pwd )
BEE_DIRS=$(ls -d $MY_PATH/bee-data-dirs/*/)
for BEE_DIR in $BEE_DIRS
do
  echo "$BEE_DIR"
  rm -rf "$BEE_DIR/localstore"
  rm -rf "$BEE_DIR/statestore"
done

echo "Removing stopped Bee Docker containers..."
docker container prune -f

echo "Removing built Bee Docker images..."

BEE_VERSION=$("$MY_PATH/utils/build-image-tag.sh" get)
BEE_ENV_PREFIX=$("$MY_PATH/utils/env-variable-value.sh" BEE_ENV_PREFIX)
BEE_IMAGE_PREFIX=$("$MY_PATH/utils/env-variable-value.sh" BEE_IMAGE_PREFIX)
DOCKER_IMAGES=$(docker image ls -qaf reference="$BEE_IMAGE_PREFIX/$BEE_ENV_PREFIX*:$BEE_VERSION")
for DOCKER_IMAGE in $DOCKER_IMAGES
do
  echo "$DOCKER_IMAGE"
  docker image rm "$DOCKER_IMAGE"
done

echo "Removing built Blockchain Docker image..."
BLOCKCHAIN_DOCKER_IMAGE=$(docker image ls -qaf reference="$BEE_IMAGE_PREFIX/$BEE_ENV_PREFIX-blockchain:$BLOCKCHAIN_VERSION")

if [ -n "$BLOCKCHAIN_DOCKER_IMAGE" ] ; then
  docker image rm "$BLOCKCHAIN_DOCKER_IMAGE"
fi
