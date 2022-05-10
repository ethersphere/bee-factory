#!/bin/bash

set -o errexit
set -o pipefail

usage() {
    cat << USAGE >&2
USAGE:
    $ environment.sh [COMMAND] [PARAMETERS]
COMMANDS:
    start                       create Bee cluster with the given parameters
    stop                        stop Bee cluster
PARAMETERS:
    --ephemeral                 create ephemeral container for bee-client. Data won't be persisted.
    --restrict(=string)         turns on Restricted API support. If string is given then it uses it as the main password otherwise 'SwarmToTheMoon' is used
    --workers=number            all Bee nodes in the test environment. Default is 4.
    --detach                    It will not log the output of Queen node at the end of the process.
    --port-maps=number          map ports of the cluster nodes to the hosting machine in the following manner:
                                1. 1633:1635
                                2. 11633:11635
                                3. 21633:21635 (...)
                                number represents the nodes number to map from. Default is 2.
    --hostname=string           Interface to which should the nodes be bound (default 127.0.0.0).
USAGE
    exit 1
}


stop() {
    #Stop Bee nodes
    docker stop "$SWARM_BLOCKCHAIN_NAME"
    #Stop blockchain nodes
    "$MY_PATH/bee.sh" stop

    trap - SIGINT
    exit 0;
}

MY_PATH=$(dirname "$0")              # relative
MY_PATH=$( cd "$MY_PATH" && pwd )  # absolutized and normalized
# Check used system variable set
BEE_ENV_PREFIX=$("$MY_PATH/utils/env-variable-value.sh" BEE_ENV_PREFIX)
BEE_IMAGE_PREFIX=$("$MY_PATH/utils/env-variable-value.sh" BEE_IMAGE_PREFIX)
BLOCKCHAIN_VERSION=$("$MY_PATH/utils/env-variable-value.sh" BLOCKCHAIN_VERSION)

# Init variables
EPHEMERAL=false
RESTRICTED=false
RESTRICTED_PASSWORD="SwarmToTheMoon"
WORKERS=4
LOG=true
SWARM_BLOCKCHAIN_NAME="$BEE_ENV_PREFIX-blockchain"
SWARM_NETWORK="$BEE_ENV_PREFIX-network"
PORT_MAPS=2
HOSTNAME="127.0.0.1"

# Decide script action
case "$1" in
    start)
    shift 1
    ;;
    stop)
    stop
    ;;
    *)
    echoerr "Unknown command: $1"
    usage
    ;;
esac


# Alter variables from flags
while [ $# -gt 0 ]
do
    case "$1" in
        --ephemeral)
        EPHEMERAL=true
        shift 1
        ;;
        --workers=*)
        WORKERS=${1#*=}
        shift 1
        ;;
        --port-maps=*)
        PORT_MAPS="${1#*=}"
        shift 1
        ;;
        --detach)
        LOG=false
        shift 1
        ;;
        --hostname=*)
        HOSTNAME="${1#*=}"
        shift 1
        ;;
        --restrict*)
        RESTRICTED=true
        if [ "${1#*=}" != "--restrict" ] ; then
          RESTRICTED_PASSWORD="${1#*=}"
        fi
        shift 1
        ;;
        --help)
        usage
        ;;
        *)
        echoerr "Unknown argument: $1"
        usage
        ;;
    esac
done

echo "Create Docker network..."
"$MY_PATH/network.sh"

# Start blockchain node
echo "Start Blockchain node..."
BLOCKCHAIN_CONTAINER=$(docker container ls -qaf name=$SWARM_BLOCKCHAIN_NAME)
if [ -z "$BLOCKCHAIN_CONTAINER" ] ; then
    BLOCKCHAIN_ARGUMENTS="--name $SWARM_BLOCKCHAIN_NAME --network $SWARM_NETWORK -p $HOSTNAME:9545:9545 -d"
    if $EPHEMERAL ; then
        BLOCKCHAIN_ARGUMENTS="$BLOCKCHAIN_ARGUMENTS --rm"
    fi
    docker run $BLOCKCHAIN_ARGUMENTS $BEE_IMAGE_PREFIX/$SWARM_BLOCKCHAIN_NAME:$BLOCKCHAIN_VERSION
else
    docker start $BLOCKCHAIN_CONTAINER
fi

# Wait for blockchain service initializes
while : ; do
    CHAINID=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"eth_chainId","id":1}' http://localhost:9545 | grep "0xfb4")
    [[ "$CHAINID" != '{"id":1,"jsonrpc":"2.0","result":"0xfb4"}' ]] || break
    echo "waiting for blockchain service is up..."
    sleep 3
done

# Build up bee.sh parameters
BEE_SH_ARGUMENTS="--workers=$WORKERS --own-image --port-maps=$PORT_MAPS --hostname=$HOSTNAME"
if $EPHEMERAL ; then
    BEE_SH_ARGUMENTS="$BEE_SH_ARGUMENTS --ephemeral"
fi
if $RESTRICTED ; then
    BEE_SH_ARGUMENTS="$BEE_SH_ARGUMENTS --restrict=$RESTRICTED_PASSWORD"
fi
if ! $LOG ; then
    BEE_SH_ARGUMENTS="$BEE_SH_ARGUMENTS --detach"
fi

# Call bee.sh with the passed arguments
echo "Start Bee nodes..."
"$MY_PATH/bee.sh" start $BEE_SH_ARGUMENTS

# If the code run reach this point without detach flag,
# then the user interrupted the log process in the bee.sh
if $LOG ; then
    docker stop $SWARM_BLOCKCHAIN_NAME
fi
