import { lex } from './src/compiler/lexer.js';
const src = '@static let x: i32 = 42;\nconsole.log(x);\n';
const tokens = lex(src);
for (const t of tokens) {
  console.log(JSON.stringify({type: t.type, value: t.value}));
}
