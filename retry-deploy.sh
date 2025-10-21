#!/bin/bash

MAX_RETRIES=10
RETRY_DELAY=10

for i in $(seq 1 $MAX_RETRIES); do
    echo "🚀 Deployment attempt $i/$MAX_RETRIES..."

    OUTPUT=$(vercel --prod 2>&1)
    EXIT_CODE=$?

    echo "$OUTPUT"

    if echo "$OUTPUT" | grep -q "Production:"; then
        echo "✅ Deployment successful!"
        exit 0
    elif echo "$OUTPUT" | grep -q "internal error"; then
        echo "⚠️  Vercel API error, retrying in ${RETRY_DELAY}s..."
        sleep $RETRY_DELAY
    else
        echo "❌ Unexpected error, retrying in ${RETRY_DELAY}s..."
        sleep $RETRY_DELAY
    fi
done

echo "❌ Failed after $MAX_RETRIES attempts"
exit 1
