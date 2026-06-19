# Install from local .tspkg archive (fixture file copied from test dir)
tsclang install greetlib-2.0.0.tspkg

# Verify the package was extracted
tsclang build main.tsc --emit c --no-cache && echo "build-ok"
