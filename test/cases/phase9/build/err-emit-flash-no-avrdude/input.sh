if ! command -v avr-gcc &>/dev/null; then
  echo "SKIP"
  exit 0
fi
tsclang build main.tsc --build avr --outDir dist 2>&1
