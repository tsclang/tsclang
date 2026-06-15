import { lex } from '../src/compiler/lexer.js';
import { parse } from '../src/compiler/parser.js';
import { IRGenerator } from '../src/compiler/ir/generator.js';
import { IRCodegen } from '../src/compiler/ir/codegen.js';
import { IRModule, IRFunction, IRBasicBlock, IRInstruction } from '../src/compiler/ir/index.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function describe(name, fn) {
  const before = failed;
  fn();
  if (failed === before) console.log(`  ✓ ${name}`);
  else console.log(`  ✗ ${name}`);
}

function c(src) {
  const tokens = lex(src, '<test>');
  const { ast, errors } = parse(tokens, '<test>', src);
  if (errors && errors.length > 0) throw new Error(`Parse errors: ${errors.map(e => e.msg || e.message || JSON.stringify(e)).join('; ')}`);
  const gen = new IRGenerator();
  const mod = gen.generate(ast);
  const cg = new IRCodegen();
  return cg.emit(mod);
}

// ─── Helper: emit IR directly (bypass parser) ───────────────────────────

function emitIR(mod) {
  return new IRCodegen().emit(mod);
}

// ---------------------------------------------------------------------------
console.log('IRCodegen — Function Structure\n');

describe('empty void function', () => {
  const code = c('function foo() {}');
  assert(code.includes('void foo('), `should have "void foo(", got: ${code}`);
  assert(code.includes('return;'), 'should have implicit return;');
  assert(code.includes('}'), 'should close brace');
});

describe('function with return type', () => {
  const code = c('function foo(): i32 { return 42 }');
  assert(code.includes('int32_t foo('), `should have "int32_t foo(", got: ${code}`);
  assert(code.includes('return 42;'), 'should have return 42;');
});

describe('function with params', () => {
  const code = c('function add(a: i32, b: i32): i32 { return a + b }');
  assert(code.includes('int32_t add(int32_t a, int32_t b)'), `got: ${code}`);
  assert(code.includes('return a + b;'), `should have "return a + b;", got: ${code}`);
});

describe('multiple functions', () => {
  const code = c('function foo() { return 1 }\nfunction bar() { return 2 }');
  assert(code.includes('foo(') && code.includes('bar('), 'should have both functions');
});

// ---------------------------------------------------------------------------
console.log('\nIRCodegen — Variables\n');

describe('alloc with type and literal init', () => {
  const code = c('function foo() { let x: i32 = 5 }');
  assert(code.includes('int32_t x_0 = 5;'), `should have "int32_t x_0 = 5;", got: ${code}`);
});

describe('alloc with auto and integer literal', () => {
  const code = c('function foo() { let x = 5 }');
  assert(code.includes('int32_t x_0 = 5;'), `should infer int32_t, got: ${code}`);
});

describe('alloc with auto and float literal', () => {
  const code = c('function foo() { let x = 3.14 }');
  assert(code.includes('double x_0 = 3.14;'), `should infer double, got: ${code}`);
});

describe('alloc with auto and string literal', () => {
  const code = c('function foo() { let x = "hello" }');
  assert(code.includes('String x_0 = "hello";'), `should infer String, got: ${code}`);
});

describe('alloc with auto and boolean', () => {
  const code = c('function foo() { let x = true }');
  assert(code.includes('bool x_0 = true;'), `should infer bool, got: ${code}`);
});

describe('alloc without init', () => {
  const code = c('function foo() { let x: i32 }');
  assert(code.includes('int32_t x_0;'), `should have "int32_t x_0;", got: ${code}`);
});

describe('assignment', () => {
  const code = c('function foo() { let x: i32 = 5; x = 10 }');
  assert(code.includes('x_0 = 10;'), `should have "x_0 = 10;", got: ${code}`);
});

describe('multiple variables', () => {
  const code = c('function foo() { let x: i32 = 5; let y: i32 = 10; return x + y }');
  assert(code.includes('int32_t x_0 = 5;'), 'should declare x_0');
  assert(code.includes('int32_t y_0 = 10;'), 'should declare y_0');
  assert(code.includes('return x_0 + y_0;'), 'should return x_0 + y_0');
});

// ---------------------------------------------------------------------------
console.log('\nIRCodegen — Expressions\n');

describe('binary in return', () => {
  const code = c('function foo(): i32 { return 1 + 2 }');
  assert(code.includes('return 1 + 2;'), `got: ${code}`);
});

describe('function call void', () => {
  const code = c('function foo() { bar() }');
  assert(code.includes('bar();'), `should have "bar();", got: ${code}`);
});

describe('function call with args', () => {
  const code = c('function foo() { bar(1, 2) }');
  assert(code.includes('bar(1, 2);'), `should have "bar(1, 2);", got: ${code}`);
});

describe('function call with result (auto)', () => {
  const code = c('function foo() { let x = bar() }');
  assert(code.includes('bar();'), 'should call bar()');
  assert(code.includes('x_0'), 'should reference x_0');
});

describe('member access', () => {
  const code = c('function foo() { let x: i32 = obj.field }');
  assert(code.includes('int32_t x_0 = obj.field;'), `got: ${code}`);
});

describe('index access', () => {
  const code = c('function foo() { return arr[0] }');
  assert(code.includes('return arr[0];'), `got: ${code}`);
});

describe('compound assignment', () => {
  const code = c('function foo() { let x: i32 = 5; x += 3 }');
  assert(code.includes('x_0 = x_0 + 3;'), `should have "x_0 = x_0 + 3;", got: ${code}`);
});

// ---------------------------------------------------------------------------
console.log('\nIRCodegen — Control Flow (if)\n');

describe('if without else — labels and gotos', () => {
  const code = c('function foo(x: i32) { if (x > 0) { bar() } }');
  assert(code.includes('if (x > 0)'), `should have condition, got: ${code}`);
  assert(code.includes('goto'), 'should have goto');
  assert(code.includes('then_0:'), 'should have then_0 label');
  assert(code.includes('end_0:'), 'should have end_0 label');
});

describe('if/else — both branches', () => {
  const code = c('function foo(x: i32) { if (x > 0) { bar() } else { baz() } }');
  assert(code.includes('then_0:'), 'should have then_0 label');
  assert(code.includes('else_0:'), 'should have else_0 label');
  assert(code.includes('bar();'), 'should call bar in then');
  assert(code.includes('baz();'), 'should call baz in else');
});

describe('if/else both return — no merge block', () => {
  const code = c('function foo(x: i32): i32 { if (x > 0) { return 1 } else { return 2 } }');
  assert(code.includes('return 1;'), 'should have return 1');
  assert(code.includes('return 2;'), 'should have return 2');
  assert(!code.includes('end_0:'), 'should NOT have end_0 label (both branches return)');
});

// ---------------------------------------------------------------------------
console.log('\nIRCodegen — Control Flow (while)\n');

describe('while loop', () => {
  const code = c('function foo(x: i32) { while (x > 0) { x = x - 1 } }');
  assert(code.includes('while_cond_0:'), 'should have cond label');
  assert(code.includes('while_body_0:'), 'should have body label');
  assert(code.includes('while_end_0:'), 'should have end label');
  assert(code.includes('goto while_cond_0;'), 'should have back-edge goto');
});

// ---------------------------------------------------------------------------
console.log('\nIRCodegen — Control Flow (for)\n');

describe('for loop', () => {
  const code = c('function foo() { for (let i: i32 = 0; i < 10; i++) { bar() } }');
  assert(code.includes('int32_t i_0 = 0;'), 'should declare i_0');
  assert(code.includes('for_cond_0:'), 'should have cond label');
  assert(code.includes('for_body_0:'), 'should have body label');
  assert(code.includes('for_update_0:'), 'should have update label');
  assert(code.includes('for_end_0:'), 'should have end label');
  assert(code.includes('goto for_cond_0;'), 'should have back-edge goto');
});

// ---------------------------------------------------------------------------
console.log('\nIRCodegen — Direct IR (no parser)\n');

describe('emit alloc with known type', () => {
  const mod = new IRModule('test');
  const fn = new IRFunction('foo', 'void', []);
  mod.addFunction(fn);
  const block = fn.addBlock('entry');
  block.addInstruction(IRInstruction.alloc('x_0', 'i32', 10));
  block.setTerminator(IRInstruction.ret());
  const code = emitIR(mod);
  assert(code.includes('int32_t x_0 = 10;'), `got: ${code}`);
});

describe('emit call with dest', () => {
  const mod = new IRModule('test');
  const fn = new IRFunction('foo', 'void', []);
  mod.addFunction(fn);
  const block = fn.addBlock('entry');
  block.addInstruction(IRInstruction.call('tmp_0', 'bar', [1, 2]));
  block.setTerminator(IRInstruction.ret());
  const code = emitIR(mod);
  assert(code.includes('bar(1, 2)'), `should have "bar(1, 2)", got: ${code}`);
});

describe('emit branch terminator', () => {
  const mod = new IRModule('test');
  const fn = new IRFunction('foo', 'void', []);
  mod.addFunction(fn);
  const entry = fn.addBlock('entry');
  entry.setTerminator(IRInstruction.branch('x', 'then', 'else'));
  fn.addBlock('then').setTerminator(IRInstruction.ret());
  fn.addBlock('else').setTerminator(IRInstruction.ret());
  const code = emitIR(mod);
  assert(code.includes('if (x) goto then;'), `got: ${code}`);
  assert(code.includes('else goto else;'), `got: ${code}`);
});

describe('emit jump terminator', () => {
  const mod = new IRModule('test');
  const fn = new IRFunction('foo', 'void', []);
  mod.addFunction(fn);
  const entry = fn.addBlock('entry');
  entry.setTerminator(IRInstruction.jump('end'));
  fn.addBlock('end').setTerminator(IRInstruction.ret());
  const code = emitIR(mod);
  assert(code.includes('goto end;'), `got: ${code}`);
});

describe('emit void return', () => {
  const mod = new IRModule('test');
  const fn = new IRFunction('foo', 'void', []);
  mod.addFunction(fn);
  fn.addBlock('entry').setTerminator(IRInstruction.ret());
  const code = emitIR(mod);
  assert(code.includes('return;'), `got: ${code}`);
});

describe('emit value return', () => {
  const mod = new IRModule('test');
  const fn = new IRFunction('foo', 'int32_t', []);
  mod.addFunction(fn);
  fn.addBlock('entry').setTerminator(IRInstruction.ret(42));
  const code = emitIR(mod);
  assert(code.includes('return 42;'), `got: ${code}`);
});

// ---------------------------------------------------------------------------
console.log('\nIRCodegen — Full Pipeline (AST→IR→C)\n');

describe('full pipeline: simple function', () => {
  const code = c('function add(a: i32, b: i32): i32 { return a + b }');
  assert(code.includes('int32_t add(int32_t a, int32_t b)'), 'function signature');
  assert(code.includes('return a + b;'), 'return statement');
  assert(code.includes('}'), 'closing brace');
});

describe('full pipeline: variable + return', () => {
  const code = c('function foo(): i32 { let x: i32 = 5; return x }');
  assert(code.includes('int32_t x_0 = 5;'), 'alloc');
  assert(code.includes('return x_0;'), 'return x_0');
});

describe('full pipeline: if/else with call', () => {
  const code = c('function foo(x: i32) { if (x > 0) { bar() } else { baz() } }');
  assert(code.includes('void foo(int32_t x)'), 'signature');
  assert(code.includes('if (x > 0)'), 'condition');
  assert(code.includes('bar();'), 'then body');
  assert(code.includes('baz();'), 'else body');
});

// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
