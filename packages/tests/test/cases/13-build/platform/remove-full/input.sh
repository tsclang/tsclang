# Full removal cycle: every record the platform created is cleaned up —
# builds/scripts/dependencies maps dropped entirely, lock emptied, package
# directory gone; `platform list` reports none installed.
export TSC_REGISTRY=catalog.json

tsclang platform install @nes/zxdev
tsclang platform remove @nes/zxdev

node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('tsc.package.json','utf8'));const l=JSON.parse(fs.readFileSync('tsc.package.lock','utf8'));for(const k of ['builds','scripts','dependencies'])if(m[k]!==undefined)throw new Error(k+' left behind');if(Object.keys(l.packages).length)throw new Error('lock left behind');if(fs.existsSync('tsc_packages/@nes/zxdev'))throw new Error('package dir left behind')" && echo "all-clean"
tsclang platform list
