#!/usr/bin/env bash

cd "$(dirname "$0")/.." || exit 1

ssh -i ../keys/prometheus_key.pem ec2-user@ec2-100-55-4-105.compute-1.amazonaws.com
