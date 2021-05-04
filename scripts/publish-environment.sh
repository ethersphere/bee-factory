#!/bin/bash
MY_PATH=$(dirname "$0")
MY_PATH=$( cd "$MY_PATH" && pwd )

BEE_IMAGE_PREFIX=$("$MY_PATH/utils/env-variable-value.sh" BEE_IMAGE_PREFIX)
BEE_ENV_PREFIX=$("$MY_PATH/utils/env-variable-value.sh" BEE_ENV_PREFIX)
BEE_VERSION=$("$MY_PATH/utils/env-variable-value.sh" BEE_VERSION)
echo "Search Docker built images with the following parameters: $BEE_IMAGE_PREFIX/$BEE_ENV_PREFIX*:$BEE_VERSION"
DOCKER_IMAGES=$(docker image ls -qaf reference="$BEE_IMAGE_PREFIX/$BEE_ENV_PREFIX*:$BEE_VERSION")
echo "Push docker images: $DOCKER_IMAGES"
for DOCKER_IMAGE in $DOCKER_IMAGES
do
  echo "$DOCKER_IMAGE"
  docker push "$DOCKER_IMAGE"
done
