cp main.tsc main.tsc.bak
tsclang lint main.tsc --format && [ "$(md5sum main.tsc | cut -d' ' -f1)" = "$(md5sum main.tsc.bak | cut -d' ' -f1)" ] && echo "unchanged"
