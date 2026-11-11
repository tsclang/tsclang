# Full cycle against a local registry fixture (zero network): install → user
# edits the platform's build entry → remove keeps the edited entry (lock hash
# mismatch → ownership dropped) and cleans up the rest it owns.
export TSC_REGISTRY=catalog.json

tsclang platform install @nes/zxdev

# User edits the platform-created build entry — ownership is dropped for it.
node -e "const fs=require('fs');const p='tsc.package.json';const m=JSON.parse(fs.readFileSync(p,'utf8'));m.builds['nes:zxdev']={profile:'my-tweaks',emit:'c'};fs.writeFileSync(p,JSON.stringify(m,null,2)+'\n')"

tsclang platform remove @nes/zxdev

# Edited entry kept as-is; the platform's script, dependency and lock entry
# are gone. The package directory is removed from tsc_packages/.
node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('tsc.package.json','utf8'));const l=JSON.parse(fs.readFileSync('tsc.package.lock','utf8'));if(JSON.stringify(m.builds['nes:zxdev'])!==JSON.stringify({profile:'my-tweaks',emit:'c'}))throw new Error('edited entry lost');if(m.scripts!==undefined)throw new Error('scripts left behind');if(m.dependencies!==undefined)throw new Error('dependencies left behind');if(l.packages['@nes/zxdev']!==undefined)throw new Error('lock entry left behind');if(fs.existsSync('tsc_packages/@nes/zxdev'))throw new Error('package dir left behind')" && echo "state-ok"
