#!/bin/bash
set -e

# SealDeal End-to-End local bash script
PACKAGE="0x296df80cf0055ed6324b67d158398d25bcbeeb63eb0a1a84aa849b4d36a05fcd"
PRICE="10000000"
DEPOSIT="20000000"
FUND="30000000"

echo "=== SealDeal End To End Script ==="
echo "1. Alice is creating a deal for $PRICE MIST..."

# Step 1: Create local coin for deposit
# Note: To avoid scripting complex coin splits, we assume the user's active address has gas coins.
# Using sui client call with a split coin from gas.

RES=$(sui client call --package $PACKAGE --module escrow --function create_deal --args $PRICE "blob_123" "hash_123" "0x6" --gas-budget 50000000 --json)

echo "Deal successfully created on-chain!"
echo "View Transaction on Explorer:"
echo $RES | grep -o 'digest": "[^"]*' | cut -d'"' -f3
