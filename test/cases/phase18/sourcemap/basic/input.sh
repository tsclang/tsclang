tsclang build prog.tsc --emit c --sourcemap
# Verify .tsc.map was created and contains required fields
node -e "
const fs = require('fs');
const map = JSON.parse(fs.readFileSync('prog.tsc.map','utf8'));
if (map.version !== 1) process.exit(1);
if (map.file !== 'prog.tsc') process.exit(1);
if (!Array.isArray(map.mappings)) process.exit(1);
console.log('sourcemap-ok');
console.log('mappings:', map.mappings.length);
"
