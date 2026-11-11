# Re-install is idempotent: nothing changes in the manifest or the lock
# (the second summary has no +/- lines — every entry is a silent "keep").
export TSC_REGISTRY=catalog.json

tsclang platform install @nes/zxdev
cp tsc.package.lock lock.before
cp tsc.package.json manifest.before

tsclang platform install @nes/zxdev
node -e "const fs=require('fs');if(fs.readFileSync('tsc.package.lock','utf8')!==fs.readFileSync('lock.before','utf8'))throw new Error('lock changed')" && echo "lock-stable"
node -e "const fs=require('fs');if(fs.readFileSync('tsc.package.json','utf8')!==fs.readFileSync('manifest.before','utf8'))throw new Error('manifest changed')" && echo "manifest-stable"
