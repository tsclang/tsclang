# First build (bypass cache to ensure fresh compile)
tsclang build main.tsc --emit c --out-dir out1 --no-cache

# Second build — lib should be cache-hit
tsclang build main.tsc --emit c --out-dir out2
