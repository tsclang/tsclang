mkdir -p src
echo 'console.log("hi")' > src/main.tsc
cat > tsc.package.json <<'EOF'
{ "name": "myapp", "version": "not-semver", "type": "executable", "main": "src/main.tsc" }
EOF
TSC_DOCTOR_NO_UPDATE=1 tsclang doctor --project > doctor.out 2>&1
echo "exit=$?"
grep -E "ConfigError|^problems found" doctor.out
