# Watch mode should rebuild when an imported file changes
cat > main.tsc << 'ENDTSC'
import { greet } from "./helper";
console.log(greet());
ENDTSC

cat > helper.tsc << 'ENDTSC'
export function greet(): string { return "hello"; }
ENDTSC

# Start watcher in background (redirect stdout to avoid cache-hit messages)
tsclang build main.tsc --outDir build/ --watch >watch.log 2>&1 &
WPID=$!
sleep 2

# Modify the imported file (not the entry file)
cat > helper.tsc << 'ENDTSC'
export function greet(): string { return "world"; }
ENDTSC

sleep 2

# Stop watcher
kill $WPID 2>/dev/null
wait $WPID 2>/dev/null

# Verify rebuild picked up the change
grep -q "world" build/main.c
