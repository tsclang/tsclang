tsclang b main.tsc --emit c --out-dir dist
test -f dist/main.c && echo "alias-built-c"
