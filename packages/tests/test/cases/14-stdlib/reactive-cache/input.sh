# Library artifact cache: a fresh --no-cache pass touches nothing, the next
# build records lib.tsc, the third one hits the cache. TSCLANG_CACHE_DIR is
# pointed into the case dir so the assertions hold on a machine with a warm
# ~/.tsclang/cache too (the global cache must not leak between runs).
export TSCLANG_CACHE_DIR="$PWD/.cache"

# First build (bypass cache to ensure fresh compile)
tsclang build main.tsc --emit c --out-dir out1 --no-cache

# Second build — fresh machine: records lib.tsc into the case-local cache
tsclang build main.tsc --emit c --out-dir out2

# Third build — lib should be cache-hit
tsclang build main.tsc --emit c --out-dir out3
