# First build (bypass cache to ensure fresh compile)
tsclang build main.tsc --emit c --outDir out1 --no-cache

# Second build — lib should be cache-hit
tsclang build main.tsc --emit c --outDir out2
