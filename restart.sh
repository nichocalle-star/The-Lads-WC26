#!/bin/bash
echo "Stopping dev server..."
kill $(lsof -ti :3000) 2>/dev/null
sleep 1
echo "Clearing cache..."
rm -rf .next
echo "Starting..."
npm run dev
