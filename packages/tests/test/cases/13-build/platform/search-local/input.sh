# Local registry fixture (zero network): search hit, miss, whole catalog,
# and the quiet offline failure (no registry, no cache, TSC_NO_NETWORK=1).
export TSC_REGISTRY=catalog.json

tsclang platform search zxdev
tsclang platform search frobnicate
tsclang platform search

# Offline without a local registry and without a cache: a stderr notice,
# an empty stdout result and exit 0 — never a crash.
unset TSC_REGISTRY
TSC_NO_NETWORK=1 TSC_CATALOG_CACHE=./no-such-cache.json tsclang platform search zxdev
echo "offline-exit=$?"
