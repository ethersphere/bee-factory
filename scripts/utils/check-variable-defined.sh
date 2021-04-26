check_variable_defined() {
  local -n REF=$1

  if [ -z "$REF" ] ; then
    echo "Variable $1 has not been set"
    exit 1
  fi
}

check_variable_defined $1