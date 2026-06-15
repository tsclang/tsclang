import { lex } from '../src/compiler/lexer.js';
import { parse } from '../src/compiler/parser.js';
import { IRGenerator } from '../src/compiler/ir/generator.js';
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

function ir(src) {
  const tokens = lex(src, '<test>');
  const { ast, errors } = parse(tokens, '<test>', src);
  if (errors && errors.length > 0) throw new Error(`Parse errors: ${errors.map(e => e.msg || e.message || JSON.stringify(e)).join('; ')}`);
  const gen = new IRGenerator();
  return gen.generate(ast);
}

function fn(src) { return ir(src).functions[0]; }

function ops(block) {
  return [
    ...block.instructions.map(i => i.op),
    ...(block.terminator ? [block.terminator.op] : []),
  ];
}

// ---------------------------------------------------------------------------
console.log('IRGenerator — Basic Functions\n');

describe('empty function', () => {
  const f = fn('function foo() {}');
  assert(f.name === 'foo', `name should be foo, got ${f.name}`);
  assert(f.returnType === 'void', `returnType should be void, got ${f.returnType}`);
  assert(f.params.length === 0, 'should have 0 params');
  assert(f.blocks.length >= 1, 'should have at least entry block');
  assert(f.entryBlock.label === 'entry', 'entry block label');
  assert(f.entryBlock.terminator?.op === 'return', 'should have implicit return');
  assert(f.entryBlock.terminator?.value === undefined, 'implicit return should be void');
});

describe('function with return literal', () => {
  const f = fn('function foo(): i32 { return 42 }');
  assert(f.returnType === 'i32', 'returnType should be i32');
  assert(f.entryBlock.terminator?.op === 'return', 'should have return');
  assert(f.entryBlock.terminator?.value === 42, `return value should be 42, got ${f.entryBlock.terminator?.value}`);
  assert(f.entryBlock.instructions.length === 0, 'no instructions before return');
});

describe('function with params', () => {
  const f = fn('function add(a: i32, b: i32): i32 { return a + b }');
  assert(f.params.length === 2, 'should have 2 params');
  assert(f.params[0].name === 'a', 'first param name');
  assert(f.params[1].name === 'b', 'second param name');
  assert(f.entryBlock.terminator?.value === 'a + b', `return value should be "a + b", got "${f.entryBlock.terminator?.value}"`);
});

describe('multiple functions', () => {
  const mod = ir('function foo() { return 1 }\nfunction bar() { return 2 }');
  assert(mod.functions.length === 2, 'should have 2 functions');
  assert(mod.functions[0].name === 'foo', 'first function name');
  assert(mod.functions[1].name === 'bar', 'second function name');
});

// ---------------------------------------------------------------------------
console.log('\nIRGenerator — Variables\n');

describe('var decl with literal init', () => {
  const f = fn('function foo() { let x = 5 }');
  const instrs = f.entryBlock.instructions;
  assert(instrs.length === 1, `should have 1 instruction, got ${instrs.length}`);
  assert(instrs[0].op === 'alloc', 'should be alloc');
  assert(instrs[0].dest === 'x_0', `dest should be x_0, got ${instrs[0].dest}`);
  assert(instrs[0].type === 'auto', `type should be auto, got ${instrs[0].type}`);
  assert(instrs[0].value === 5, `value should be 5, got ${instrs[0].value}`);
});

describe('var decl with type annotation', () => {
  const f = fn('function foo() { let x: i32 = 5 }');
  const i = f.entryBlock.instructions[0];
  assert(i.type === 'i32', `type should be i32, got ${i.type}`);
});

describe('var decl without init', () => {
  const f = fn('function foo() { let x: i32 }');
  const i = f.entryBlock.instructions[0];
  assert(i.op === 'alloc', 'should be alloc');
  assert(i.value === undefined, 'value should be undefined for no init');
});

describe('variable assignment', () => {
  const f = fn('function foo() { let x = 5; x = 10 }');
  const instrs = f.entryBlock.instructions;
  assert(instrs.length === 2, `should have 2 instructions, got ${instrs.length}`);
  assert(instrs[0].op === 'alloc' && instrs[0].dest === 'x_0', 'first should be alloc x_0');
  assert(instrs[1].op === 'assign', 'second should be assign');
  assert(instrs[1].dest === 'x_0', 'assign dest should be x_0');
  assert(instrs[1].value === 10, `assign value should be 10, got ${instrs[1].value}`);
});

describe('multiple variables', () => {
  const f = fn('function foo() { let x = 5; let y = 10; return x + y }');
  const instrs = f.entryBlock.instructions;
  assert(instrs.length === 2, `should have 2 allocs, got ${instrs.length}`);
  assert(instrs[0].dest === 'x_0', 'first alloc x_0');
  assert(instrs[1].dest === 'y_0', 'second alloc y_0');
  assert(f.entryBlock.terminator.value === 'x_0 + y_0', `return should be "x_0 + y_0", got "${f.entryBlock.terminator.value}"`);
});

// ---------------------------------------------------------------------------
console.log('\nIRGenerator — Expressions\n');

describe('binary expression in return', () => {
  const f = fn('function foo() { return 1 + 2 }');
  assert(f.entryBlock.terminator.value === '1 + 2', `got "${f.entryBlock.terminator.value}"`);
});

describe('nested binary expression', () => {
  const f = fn('function foo() { return 1 + 2 * 3 }');
  assert(f.entryBlock.terminator.value === '1 + 2 * 3', `got "${f.entryBlock.terminator.value}"`);
});

describe('parenthesized binary', () => {
  const f = fn('function foo() { return (1 + 2) * 3 }');
  const v = f.entryBlock.terminator.value;
  assert(v.includes('1 + 2') && v.includes('* 3'), `should have "(1 + 2) * 3" pattern, got "${v}"`);
});

describe('comparison expression', () => {
  const f = fn('function foo(x: i32) { return x > 0 }');
  assert(f.entryBlock.terminator.value === 'x > 0', `got "${f.entryBlock.terminator.value}"`);
});

describe('unary negation', () => {
  const f = fn('function foo(x: i32) { return -x }');
  assert(f.entryBlock.terminator.value === '-x', `got "${f.entryBlock.terminator.value}"`);
});

describe('unary not', () => {
  const f = fn('function foo(x: bool) { return !x }');
  assert(f.entryBlock.terminator.value === '!x', `got "${f.entryBlock.terminator.value}"`);
});

describe('function call void (statement)', () => {
  const f = fn('function foo() { bar() }');
  const instrs = f.entryBlock.instructions;
  assert(instrs.length === 1, `should have 1 instruction, got ${instrs.length}`);
  assert(instrs[0].op === 'call', 'should be call');
  assert(instrs[0].dest === null, 'void call dest should be null');
  assert(instrs[0].fn === 'bar', 'fn should be bar');
  assert(instrs[0].args.length === 0, 'should have 0 args');
});

describe('function call with args', () => {
  const f = fn('function foo() { bar(1, 2) }');
  const i = f.entryBlock.instructions[0];
  assert(i.args.length === 2, `should have 2 args, got ${i.args.length}`);
  assert(i.args[0] === 1, 'first arg should be 1');
  assert(i.args[1] === 2, 'second arg should be 2');
});

describe('function call with result', () => {
  const f = fn('function foo() { let x = bar() }');
  const instrs = f.entryBlock.instructions;
  assert(instrs.length === 2, `should have 2 instructions (call + alloc), got ${instrs.length}`);
  assert(instrs[0].op === 'call', 'first should be call');
  assert(instrs[0].dest !== null && instrs[0].dest !== undefined, 'call should have dest');
  assert(instrs[1].op === 'alloc', 'second should be alloc');
  assert(instrs[1].value === instrs[0].dest, 'alloc value should be call dest');
});

describe('member access', () => {
  const f = fn('function foo() { let x = obj.field }');
  const i = f.entryBlock.instructions[0];
  assert(i.op === 'alloc', 'should be alloc');
  assert(i.value === 'obj.field', `value should be "obj.field", got "${i.value}"`);
});

describe('index access', () => {
  const f = fn('function foo() { return arr[0] }');
  assert(f.entryBlock.terminator.value === 'arr[0]', `got "${f.entryBlock.terminator.value}"`);
});

describe('assignment expression', () => {
  const f = fn('function foo() { let x = 5; x = x + 1 }');
  const instrs = f.entryBlock.instructions;
  assert(instrs[1].op === 'assign', 'second should be assign');
  assert(instrs[1].value === 'x_0 + 1', `assign value should be "x_0 + 1", got "${instrs[1].value}"`);
});

describe('compound assignment (+=)', () => {
  const f = fn('function foo() { let x = 5; x += 3 }');
  const i = f.entryBlock.instructions[1];
  assert(i.op === 'assign', 'should be assign');
  assert(i.value === 'x_0 + 3', `value should be "x_0 + 3", got "${i.value}"`);
});

// ---------------------------------------------------------------------------
console.log('\nIRGenerator — Control Flow (if)\n');

describe('if without else', () => {
  const f = fn('function foo(x: i32) { if (x > 0) { bar() } }');
  assert(f.blocks.length >= 3, `should have entry + then + end (3+ blocks), got ${f.blocks.length}`);
  assert(f.entryBlock.terminator?.op === 'branch', 'entry should end with branch');
  assert(f.entryBlock.terminator?.cond === 'x > 0', `cond should be "x > 0", got "${f.entryBlock.terminator?.cond}"`);
  const thenBlock = f.getBlockByLabel(f.entryBlock.terminator.thenLabel);
  assert(thenBlock !== undefined, 'then block should exist');
  assert(thenBlock.instructions.some(i => i.op === 'call'), 'then block should have call');
  const endBlock = f.getBlockByLabel(f.entryBlock.terminator.elseLabel);
  assert(endBlock !== undefined, 'end/else block should exist');
});

describe('if/else', () => {
  const f = fn('function foo(x: i32) { if (x > 0) { bar() } else { baz() } }');
  assert(f.entryBlock.terminator?.op === 'branch', 'entry should end with branch');
  const thenLabel = f.entryBlock.terminator.thenLabel;
  const elseLabel = f.entryBlock.terminator.elseLabel;
  assert(thenLabel !== elseLabel, 'then and else should be different blocks');
  const thenBlock = f.getBlockByLabel(thenLabel);
  const elseBlock = f.getBlockByLabel(elseLabel);
  assert(thenBlock.instructions.some(i => i.fn === 'bar'), 'then should call bar');
  assert(elseBlock.instructions.some(i => i.fn === 'baz'), 'else should call baz');
});

describe('if/else both branches return (no merge)', () => {
  const f = fn('function foo(x: i32): i32 { if (x > 0) { return 1 } else { return 2 } }');
  const thenBlock = f.getBlockByLabel(f.entryBlock.terminator.thenLabel);
  const elseBlock = f.getBlockByLabel(f.entryBlock.terminator.elseLabel);
  assert(thenBlock.terminator?.op === 'return', 'then should return');
  assert(elseBlock.terminator?.op === 'return', 'else should return');
});

describe('if/else with merge — end block exists', () => {
  const f = fn('function foo(x: i32) { if (x > 0) { bar() } else { baz() } qux() }');
  const thenBlock = f.getBlockByLabel(f.entryBlock.terminator.thenLabel);
  const elseBlock = f.getBlockByLabel(f.entryBlock.terminator.elseLabel);
  assert(thenBlock.terminator?.op === 'jump', 'then should jump to merge');
  assert(elseBlock.terminator?.op === 'jump', 'else should jump to merge');
  assert(thenBlock.terminator.label === elseBlock.terminator.label, 'both should jump to same merge block');
  const mergeBlock = f.getBlockByLabel(thenBlock.terminator.label);
  assert(mergeBlock.instructions.some(i => i.fn === 'qux'), 'merge block should call qux');
});

describe('if without else followed by statement', () => {
  const f = fn('function foo(x: i32) { if (x > 0) { bar() } qux() }');
  const endBlock = f.getBlockByLabel(f.entryBlock.terminator.elseLabel);
  assert(endBlock.instructions.some(i => i.fn === 'qux'), 'end block should call qux');
});

// ---------------------------------------------------------------------------
console.log('\nIRGenerator — Control Flow (while)\n');

describe('basic while loop', () => {
  const f = fn('function foo(x: i32) { while (x > 0) { x = x - 1 } }');
  assert(f.entryBlock.terminator?.op === 'jump', 'entry should jump to cond block');
  const condLabel = f.entryBlock.terminator.label;
  const condBlock = f.getBlockByLabel(condLabel);
  assert(condBlock.terminator?.op === 'branch', 'cond block should branch');
  const bodyLabel = condBlock.terminator.thenLabel;
  const endLabel = condBlock.terminator.elseLabel;
  const bodyBlock = f.getBlockByLabel(bodyLabel);
  assert(bodyBlock !== undefined, 'body block should exist');
  assert(bodyBlock.instructions.some(i => i.op === 'assign'), 'body should have assignment');
  assert(bodyBlock.terminator?.op === 'jump', 'body should jump back to cond');
  assert(bodyBlock.terminator.label === condLabel, 'body should jump back to cond');
  const endBlock = f.getBlockByLabel(endLabel);
  assert(endBlock.terminator?.op === 'return', 'end block should return');
});

// ---------------------------------------------------------------------------
console.log('\nIRGenerator — Control Flow (for)\n');

describe('basic for loop', () => {
  const f = fn('function foo() { for (let i = 0; i < 10; i++) { bar() } }');
  const entryInstrs = f.entryBlock.instructions;
  assert(entryInstrs.some(i => i.op === 'alloc' && i.dest === 'i_0'), 'entry should alloc i_0');
  assert(f.entryBlock.terminator?.op === 'jump', 'entry should jump to cond');
  const condBlock = f.getBlockByLabel(f.entryBlock.terminator.label);
  assert(condBlock.terminator?.op === 'branch', 'cond should branch');
});

// ---------------------------------------------------------------------------
console.log('\nIRGenerator — Scope and Cleanup\n');

describe('variable in then block', () => {
  const f = fn('function foo(x: i32) { if (x > 0) { let y = 5; bar(y) } }');
  const thenBlock = f.getBlockByLabel(f.entryBlock.terminator.thenLabel);
  assert(thenBlock.instructions.some(i => i.op === 'alloc' && i.dest === 'y_0'), 'then block should alloc y_0');
});

describe('variable shadowing in different scopes', () => {
  const f = fn('function foo(x: i32) { let y = 1; if (x > 0) { let y = 2; bar(y) } }');
  const entryInstrs = f.entryBlock.instructions;
  assert(entryInstrs.some(i => i.dest === 'y_0'), 'entry should have y_0');
  const thenBlock = f.getBlockByLabel(f.entryBlock.terminator.thenLabel);
  assert(thenBlock.instructions.some(i => i.dest === 'y_1'), 'then block should have y_1 (different SSA)');
});

// ---------------------------------------------------------------------------
console.log('\nIRGenerator — Edge Cases\n');

describe('return identifier', () => {
  const f = fn('function foo(x: i32): i32 { return x }');
  assert(f.entryBlock.terminator.value === 'x', `should return "x", got "${f.entryBlock.terminator.value}"`);
});

describe('string literal', () => {
  const f = fn('function foo() { return "hello" }');
  assert(f.entryBlock.terminator.value === '"hello"', `should return '"hello"', got "${f.entryBlock.terminator.value}"`);
});

describe('boolean literal', () => {
  const f = fn('function foo() { return true }');
  assert(f.entryBlock.terminator.value === true, `should return true, got ${f.entryBlock.terminator.value}`);
});

describe('null literal', () => {
  const f = fn('function foo() { return null }');
  assert(f.entryBlock.terminator.value === null, `should return null, got ${f.entryBlock.terminator.value}`);
});

describe('param referenced in body', () => {
  const f = fn('function foo(a: i32, b: i32) { return a + b }');
  assert(f.entryBlock.terminator.value === 'a + b', `should return "a + b", got "${f.entryBlock.terminator.value}"`);
});

describe('IRModule is returned', () => {
  const mod = ir('function foo() {}');
  assert(mod instanceof IRModule, 'should return IRModule');
  assert(mod.functions[0] instanceof IRFunction, 'function should be IRFunction');
});

// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
