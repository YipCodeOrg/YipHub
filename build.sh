#!/bin/bash
cd "$(dirname "$0")"
if [ $# -eq 0 ]; then
    echo "No arguments provided"
    exit 1
fi

#First arg passed in is the enivornment for which to build e.g. "dev", "local", "prod"
env=$(echo $1 | tr [:upper:] [:lower:])

if ! [[ $env =~ ^dev|prod|local ]]; then
    echo "Invalid ENV: $env"
    exit 1
fi

rm -r build
mkdir -p build
cp *.html build

cp env/$env/env.js build