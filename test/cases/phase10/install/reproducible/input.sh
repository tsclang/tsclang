tsclang install mylib@1.0.0
cp tsc.package.lock tsc.package.lock.bak
tsclang install mylib@1.0.0
[ "$(md5sum tsc.package.lock | cut -d' ' -f1)" = "$(md5sum tsc.package.lock.bak | cut -d' ' -f1)" ] && echo "identical"
