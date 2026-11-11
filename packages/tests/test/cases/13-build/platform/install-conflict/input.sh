# A user-owned entry under the platform's build name is never overwritten:
# non-TTY install skips it with a stderr notice and continues (exit 0).
export TSC_REGISTRY=catalog.json
cat > tsc.package.json <<'MANIFEST'
{
  "name": "conflict-fixture",
  "version": "0.0.1",
  "type": "package",
  "builds": {
    "nes:zxdev": { "profile": "user-build", "emit": "c" }
  }
}
MANIFEST

tsclang platform install @nes/zxdev

# The user entry survived verbatim; the platform's script was still added.
node -e "const m=JSON.parse(require('fs').readFileSync('tsc.package.json','utf8'));if(JSON.stringify(m.builds['nes:zxdev'])!==JSON.stringify({profile:'user-build',emit:'c'}))throw new Error('user entry overwritten');if(m.scripts['nes:zxdev:dev']===undefined)throw new Error('script not added')" && echo "conflict-ok"
