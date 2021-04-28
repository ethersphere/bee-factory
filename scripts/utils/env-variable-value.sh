#!/bin/bash

echo_env_variable_value() {
  local REF=$(printenv $1)

  # There were no global set
  if [ -z "$REF" ] ; then
    MY_PATH=`dirname "$0"`
    ENV_PATH=`( cd "$MY_PATH/.." && pwd )`
    VALUE=`cat $ENV_PATH/.env | grep "$1" | cut -d= -f2`
    VALUE=${VALUE//\"/}
    VALUE=${VALUE//\'/}
    echo $VALUE
  else
    echo $REF
  fi
}

echo_env_variable_value $1