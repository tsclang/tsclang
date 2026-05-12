tsclang install mylib@1.0.0
cp tsc.lock tsc.lock.bak
tsclang install mylib@1.0.0
[ "$(md5sum tsc.lock | cut -d' ' -f1)" = "$(md5sum tsc.lock.bak | cut -d' ' -f1)" ] && echo "identical"
