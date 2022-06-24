#!/bin/bash
echo "Build started"
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

echo "Building env: ${env}"
echo "Replacing content..."

rm -r build
mkdir -p build
declare -a dirs=("api" "auth")
for d in "${dirs[@]}"; do cp -r "$d" build; done
cp env/$env/env.js favicon.ico build

echo "...Replaced content"

aws_profile='default'
cognito_user_pool_name='dev.yipcode.com'

if [[ $env = prod ]]; then
    aws_profile='root'
    cognito_user_pool_name='yipcode.com'
fi

echo "Retreiving & writing client ID for aws_profile ${aws_profile} and user pool ${cognito_user_pool_name}..."

user_pool_info=$(aws cognito-idp list-user-pools --max-results 1 --profile $aws_profile)
if grep -q "$cognito_user_pool_name" <<< $user_pool_info; then
    user_pool_id=$(aws cognito-idp list-user-pools --max-results 1 --profile $aws_profile | grep -Po '(?<="Id": ")(.+)(?=")')
    echo "Found user pool ID: ${user_pool_id}"
    client_info=$(aws cognito-idp list-user-pool-clients --user-pool-id $user_pool_id --profile $aws_profile --max-items 1)
    if grep -q "$StandardClient" <<< $client_info; then
        client_id=$(aws cognito-idp list-user-pool-clients --user-pool-id $user_pool_id --profile $aws_profile --max-items 1 | grep -Po '(?<="ClientId": ")(.+)(?=")')
        echo "Found client ID: ${client_id}"
        sed -i -e "s/COGNITO_CLIENT_ID_PLACEHOLDER/${client_id}/g" build/env.js
    else
        echo "Error: standard client not found"
        exit 1
    fi
else
    echo "Error: user pool not found"
    exit 1
fi

echo "...client ID written."