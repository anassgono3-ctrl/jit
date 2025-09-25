#!/bin/bash

# Numeric Safety Verification Script
# Fails if Number( appears in src/math/** or src/sim/**

set -e

echo "🔍 Checking for unsafe Number() usage in math and sim modules..."

# Check src/math/ - looking for Number( specifically (constructor call)
if grep -rE "(^|[^a-zA-Z0-9_\.])Number\(" src/math/ 2>/dev/null; then
    echo "❌ FAIL: Found Number() constructor usage in src/math/"
    echo "   Use BigInt, JSBI, or Decimal.js for numeric operations in math modules"
    exit 1
fi

# Check src/sim/ - looking for Number( specifically (constructor call)
if grep -rE "(^|[^a-zA-Z0-9_\.])Number\(" src/sim/ 2>/dev/null; then
    echo "❌ FAIL: Found Number() constructor usage in src/sim/"
    echo "   Use BigInt, JSBI, or Decimal.js for numeric operations in sim modules"
    exit 1
fi

echo "✅ PASS: No unsafe Number() constructor usage found in math/sim modules"
echo "   Math operations are using safe numeric types"