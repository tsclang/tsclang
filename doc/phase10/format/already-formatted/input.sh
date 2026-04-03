cp main.tsc main.tsc.bak
tsclang format main.tsc
diff main.tsc main.tsc.bak && echo "unchanged"
