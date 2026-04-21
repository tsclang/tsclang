tsclang build funcs.tsc --emit c --sourcemap
node -e "
const fs = require('fs');
const map = JSON.parse(fs.readFileSync('funcs.tsc.map','utf8'));
console.log('version:', map.version);
console.log('file:', map.file);
const lines = map.mappings.map(m => m[0]);
const unique = [...new Set(lines)].length;
console.log('tsc-lines-mapped:', unique);
"
