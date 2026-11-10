mkdir -p src
echo 'console.log("hi")' > src/main.tsc
cat > tsc.package.json <<'EOF'
{ "name": "myapp", "version": "0.1.0", "type": "executable", "main": "src/main.tsc" }
EOF
# non-TTY report: stdin of the script is not a terminal → no questions, manual hints.
# Platform/Version/Update lines are machine-dependent → grep keeps the deterministic part.
TSC_DOCTOR_NO_UPDATE=1 tsclang doctor --project > doctor.out 2>&1
echo "exit=$?"
grep -E "^Project|^  ok:|^  \[!\]|^    manual:|^      scripts:|^      builds:|^problems found" doctor.out
