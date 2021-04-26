#!/bin/bash
usage() {
    cat << USAGE >&2
USAGE:
    $ environment.sh [COMMAND] [PARAMETERS]
COMMANDS:
    start                       create Bee cluster with the given parameters
    stop                        stop Bee cluster
PARAMETERS:
    --ephemeral                 create ephemeral container for bee-client. Data won't be persisted.
    --workers=number            all Bee nodes in the test environment. Default is 4.
    --detach                    It will not log the output of Queen node at the end of the process.
USAGE
    exit 1
}


stop() {
    #Stop Bee nodes
    docker stop $SWARM_BLOCKCHAIN_NAME
    #Stop blockchain nodes
    $MY_PATH/bee.sh stop

    trap - SIGINT
    exit 0;
}

MY_PATH=`dirname "$0"`              # relative
MY_PATH=`( cd "$MY_PATH" && pwd )`  # absolutized and normalized
# Check used system variable set
source $MY_PATH/utils/check-variable-defined.sh BEE_ENV_PREFIX
source $MY_PATH/utils/check-variable-defined.sh BEE_VERSION

# Init variables
EPHEMERAL=false
WORKERS=4
LOG=true
SWARM_BLOCKCHAIN_NAME="$BEE_ENV_PREFIX-blockchain"
SWARM_NETWORK="$BEE_ENV_PREFIX-network"

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
        --detach)
        LOG=false
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

# Start blockchain node
echo "Start Blockchain node..."
BLOCKCHAIN_CONTAINER=`docker container ls -qaf name=$SWARM_BLOCKCHAIN_NAME`
if [ -z "$SWARM_BLOCKCHAIN_NAME" ] ; then
    docker start $SWARM_BLOCKCHAIN_NAME
else
    BLOCKCHAIN_ARGUMENTS="--name $SWARM_BLOCKCHAIN_NAME --network $SWARM_NETWORK -d"
    if $EPHEMERAL ; then
        BLOCKCHAIN_ARGUMENTS="$BLOCKCHAIN_ARGUMENTS --rm"
    fi
    docker run $BLOCKCHAIN_ARGUMENTS $SWARM_BLOCKCHAIN_NAME 
fi

# Wait for blockchain service initializes
sleep 5

# Build up bee.sh parameters
BEE_SH_ARGUMENTS="--workers=$WORKERS --own-image"
if $EPHEMERAL ; then
    BEE_SH_ARGUMENTS="$BEE_SH_ARGUMENTS --ephemeral"
fi
if $LOG ; then
    BEE_SH_ARGUMENTS="$BEE_SH_ARGUMENTS --detach"
fi

# Call bee.sh with the passed arguments
echo "Start Bee nodes..."
$MY_PATH/bee.sh start $BEE_SH_ARGUMENTS