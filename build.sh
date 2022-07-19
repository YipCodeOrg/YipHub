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

build_target_dir=build/$env

echo "Cleaning directory: ${build_target_dir}..."
rm -fr $build_target_dir
mkdir -p $build_target_dir
echo "...directory cleaned."

echo "Running TS build..."
npx tsc --outDir ${build_target_dir}/modules
echo "...TS build complete"

echo "Copying env file..."
env_file=env/$env/env.js
is_env_cached=false
local_env_file=.local/env.js
if [[ $env=='local' && -f $local_env_file ]]; then
    echo "Locally cached env file detected. Will be used for local build."
    is_env_cached=true
    env_file=$local_env_file
fi
cp $env_file $build_target_dir
echo "...Env file copied"

echo "Copying other non-TS files..."
cp -a "html/." "$build_target_dir/"
cp favicon.ico $build_target_dir
echo "...Other non-TS files copied"

if [ $is_env_cached == false ]; then
    echo "No locally cached file found. Reading details from AWS."
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
            sed -i -e "s/COGNITO_CLIENT_ID_PLACEHOLDER/${client_id}/g" $build_target_dir/env.js
        else
            echo "Error: standard client not found"
            exit 1
        fi
        if [[ $env = 'local' ]]; then
            echo "Copying new env file to local cache"
            cp $build_target_dir/env.js .local/
        fi
    else
        echo "Error: user pool not found"
        exit 1
    fi

    echo "...client ID written."
fi