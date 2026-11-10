mkdir -p src
echo 'console.log("hi")' > src/main.tsc
cat > tsc.package.json <<'EOF'
{ "name": "myapp", "version": "0.1.0", "type": "executable", "main": "src/main.tsc" }
EOF
# --fix applies the preset builds/scripts without asking; PATH is never touched.
# NB: the runner rewrites every literal `tsclang` token into the CLI path, so the
# grep pattern below must not spell the command name — match its shape instead.
TSC_DOCTOR_NO_UPDATE=1 tsclang doctor --project --fix > doctor.out 2>&1
echo "exit=$?"
grep -E "^  fixed" doctor.out
grep -o '"start".*exec"' tsc.package.json
grep -o '"desktop"' tsc.package.json | head -1
