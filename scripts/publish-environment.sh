#!/bin/bash
MY_PATH=$(dirname "$0")
MY_PATH=$( cd "$MY_PATH" && pwd )

BEE_VERSION=$("$MY_PATH/utils/build-image-tag.sh" get)
BEE_ENV_PREFIX=$("$MY_PATH/utils/env-variable-value.sh" BEE_ENV_PREFIX)
BLOCKCHAIN_VERSION=$("$MY_PATH/utils/env-variable-value.sh" BLOCKCHAIN_VERSION)
BEE_IMAGE_PREFIX=$("$MY_PATH/utils/env-variable-value.sh" BEE_IMAGE_PREFIX)
BLOCKCHAIN_NAME="$BEE_ENV_PREFIX-blockchain"
BLOCKCHAIN_IMAGE_NAME="$BEE_IMAGE_PREFIX/$BLOCKCHAIN_NAME:$BLOCKCHAIN_VERSION"

echo "Search Docker built images with the following parameters: $BEE_IMAGE_PREFIX/$BEE_ENV_PREFIX*:$BEE_VERSION"
DOCKER_IMAGES=$(docker image ls --format "{{.Repository}}:{{.Tag}}" -af reference="$BEE_IMAGE_PREFIX/$BEE_ENV_PREFIX*:$BEE_VERSION")
echo "Push Bee docker images: $DOCKER_IMAGES"
for DOCKER_IMAGE in $DOCKER_IMAGES
do
  echo "$DOCKER_IMAGE"
  docker push "$DOCKER_IMAGE"
done

echo "Push Blockchain docker image: $BLOCKCHAIN_IMAGE_NAME"
docker push "$BLOCKCHAIN_IMAGE_NAME"
