tsclang init mywrapper --declaration
test -f mywrapper/index.d.tsc && echo "exists"
grep -q 'declare function' mywrapper/index.d.tsc && echo "declares"
