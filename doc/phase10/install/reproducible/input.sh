tsclang install mylib@1.0.0
cp tsc.lock tsc.lock.bak
tsclang install mylib@1.0.0
diff tsc.lock tsc.lock.bak && echo "identical"
