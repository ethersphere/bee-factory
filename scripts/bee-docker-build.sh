#!/bin/bash

dockerfile() {
    cat << DOCKERFILE > $1
FROM ethersphere/bee:$2

# Sample docker file
COPY --chown=bee:bee . /home/bee/.bee
DOCKERFILE
}

dockerbuild() {
  IMAGE_NAME=`basename $1`
  docker build $1 -t ethersphere/$IMAGE_NAME:$2
}


MY_PATH=`dirname "$0"`
MY_PATH=`( cd "$MY_PATH" && pwd )`
BEE_DIRS=`ls $MY_PATH/bee-data-dirs`
BEE_VERSION=0.5.3
# Make sure we the user has permission all the files
sudo chmod 777 -R "$MY_PATH/bee-data-dirs"

echo "Init Dockerfile for Bee nodes"
for BEE_DIR in $BEE_DIRS
do
  echo "$BEE_DIR"
  dockerfile "$MY_PATH/bee-data-dirs/$BEE_DIR/Dockerfile" $BEE_VERSION
done

echo "Build Dockerfiles"
for BEE_DIR in $BEE_DIRS
do
  echo "$BEE_DIR"
  dockerbuild "$MY_PATH/bee-data-dirs/$BEE_DIR" "$BEE_VERSION"
done

echo "Docker image builds were successful!"
