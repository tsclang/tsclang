import type { Stmt, Expression, Switch, ObjLitProp, ArrayPatternElement, Argument, Call, Ident, Block } from '@tsclang/ast';
import type { CodeGenContext } from '../../codegen.js';
import type { AsyncEmitCtx } from './async-emit.js';
import type { SpawnInfo } from './scan.js';
// async-stmt.ts

interface AsyncSub { stateType: string; pollFn: string; resultCType?: string | null; }

export function _emitAsyncStmt(ctx: CodeGenContext, s: Stmt, lines: string[], actx: AsyncEmitCtx, I: string) {
    if (!s) return;

    // ── spawn VarDecl: emit call site using pre-emitted env/fn ──
    if (s.kind === 'VarDecl' && s.init?.kind === 'Spawn') {
      const si = ctx._selfCtx?.spawnInfos?.find((info: SpawnInfo) => info.userVar === s.name);
      if (!si) return;
      // Patch previous line (e.g. "        case 0:") to open a block
      if (lines.length > 0) lines[lines.length - 1] += ' {';
      lines.push(`${I}${si.envType} *${si.envVar} = malloc(sizeof(${si.envType}));`);
      for (const fv of si.freeVars) {
        lines.push(`${I}${si.envVar}->${fv.name} = ${fv.name};`);
      }
      lines.push(`${I}self->${si.threadVar} = tsc_thread_spawn(${si.fnName}, ${si.envVar});`);
      lines.push(`${I}self->_state = ${actx.nextCase};`);
      lines.push('        }');
      lines.push(`        case ${actx.nextCase}:`);
      actx.nextCase++;
      ctx.define(s.name, { ctype: 'tsc_thread_t', varKind: s.varKind, _isThread: true });
      return;
    }

    // ── await in VarDecl ──
    if (s.kind === 'VarDecl' && s.init?.kind === 'Await') {
      ctx._checkAwaitTarget(s.init);
      ctx._checkBorrowsAcrossAwait(s.init);
      const ai = ctx._awaitInfoOf(s.init);
      if (!ai) return;

      // Promise.race / Promise.any: poll all, take first done's result
      if (ai.kind === 'promise-race' || ai.kind === 'promise-any') {
        const baseIdx = actx.awaitIdx;
        const doneConds: { idx: number; sub: AsyncSub }[] = [];
        for (const item of ai!.items!) {
          const callName = item?.expr?.callee?.kind === 'Ident' ? item.expr.callee.name : null;
          const sub = callName && ctx._asyncFuncs?.has(callName) ? ctx._asyncFuncs.get(callName) : null;
          if (sub) {
            lines.push(`${I}self->_await_${actx.awaitIdx++} = (${sub.stateType}){0};`);
            doneConds.push({ idx: baseIdx + doneConds.length, sub });
          }
        }
        ctx._emitAsyncTransition(lines, actx, I);
        for (const { idx, sub } of doneConds) lines.push(`${I}${sub.pollFn}(&self->_await_${idx});`);
        if (doneConds.length) {
          lines.push(`${I}if (${doneConds.map(({ idx }) => `!self->_await_${idx}._done`).join(' && ')}) return;`);
        }
        if (ai.resultCType) {
          let rhs = `self->_await_${doneConds[doneConds.length - 1].idx}._result`;
          for (let j = doneConds.length - 2; j >= 0; j--) {
            rhs = `self->_await_${doneConds[j].idx}._done ? self->_await_${doneConds[j].idx}._result : ${rhs}`;
          }
          if (ctx._selfCtx!.promoted.has(s.name)) {
            lines.push(`${I}self->${s.name} = ${rhs};`);
          } else {
            lines.push(`${I}${ai.resultCType} ${s.name} = ${rhs};`);
          }
        }
        if (ai.resultCType) ctx.define(s.name, { ctype: ai.resultCType, varKind: s.varKind });
        return;
      }

      const awaitIdx = actx.awaitIdx++;

      if (ai.kind === 'sleep') {
        const argC = ctx._selfE(ai.args?.[0]?.expr);
        lines.push(`${I}self->_await_${awaitIdx} = tsc_sleep_awaitable(${argC});`);
      } else if (ai.kind === 'net-fetch') {
        // fetch(url, opts?) — special handling for options object
        const urlArg = ai.args?.[0]?.expr;
        const urlC = urlArg ? ctx._selfE(urlArg) : 'STR_LIT("")';
        const optsArg = ai.args?.[1]?.expr;
        if (optsArg && optsArg.kind === 'ObjLit') {
          // Wrap case in {} for local opts var
          if (lines.length > 0) lines[lines.length - 1] += ' {';
          const optsIdx = ctx._fetchOptsCount ?? 0;
          ctx._fetchOptsCount = optsIdx + 1;
          const optsVar = `_opts_${optsIdx}`;
          const optsFields = (optsArg.props ?? []).map((p: ObjLitProp) => `.${p.key} = ${ctx._selfE(p.value)}`);
          lines.push(`${I}TscFetchOptions ${optsVar} = { ${optsFields.join(', ')} };`);
          lines.push(`${I}self->_await_${awaitIdx} = tsc_fetch_async(${urlC}, &${optsVar});`);
          lines.push(`${I}self->_state = ${actx.nextCase};`);
          lines.push(`${I}/* fall through */`);
          lines.push('        }');
          lines.push(`        case ${actx.nextCase}:`);
          actx.nextCase++;
        } else {
          lines.push(`${I}self->_await_${awaitIdx} = tsc_fetch_async(${urlC}, NULL);`);
          ctx._emitAsyncTransition(lines, actx, I);
        }
      } else if (ai.initFn) {
        const callArgs = [...(ai.rawArgs ?? [])];
        for (const arg of (ai.args ?? [])) {
          const argExpr = arg?.expr;
          if (!argExpr) continue;
          const argC = ctx._selfE(argExpr);
          const argType = ctx.inferType(argExpr);
          if (argType === 'Array_u8' || argType?.startsWith('Array_')) {
            callArgs.push(`${argC}.data`, `${argC}.length`);
          } else {
            callArgs.push(argC);
          }
        }
        lines.push(`${I}self->_await_${awaitIdx} = ${ai.initFn}(${callArgs.join(', ')});`);
        ctx._emitAsyncTransition(lines, actx, I);
      } else {
        lines.push(`${I}self->_await_${awaitIdx} = (${ai.stateType}){0};`);
        ctx._emitAsyncTransition(lines, actx, I);
      }
      lines.push(`${I}${ai.pollFn}(&self->_await_${awaitIdx});`);
      lines.push(`${I}if (!self->_await_${awaitIdx}._done) return;`);
      if (ai.isResult) {
        if (!ctx._inAsyncTryCatch) {
          if (ctx._selfCtx!.hasCleanup) {
            lines.push(`${I}if (!self->_await_${awaitIdx}._result.ok) { goto _cleanup; }`);
          } else {
            lines.push(`${I}if (!self->_await_${awaitIdx}._result.ok) { self->_done = true; return; }`);
          }
        }
        if (ctx._selfCtx!.promoted.has(s.name) && ai.resultCType) {
          lines.push(`${I}self->${s.name} = self->_await_${awaitIdx}._result.value;`);
        } else if (ai.resultCType) {
          lines.push(`${I}${ai.resultCType} ${s.name} = self->_await_${awaitIdx}._result.value;`);
        }
      } else if (ai.resultCType) {
        if (ctx._selfCtx!.promoted.has(s.name)) {
          lines.push(`${I}self->${s.name} = self->_await_${awaitIdx}._result;`);
        } else {
          lines.push(`${I}${ai.resultCType} ${s.name} = self->_await_${awaitIdx}._result;`);
        }
      }
      // Define var in scope so subsequent expressions can infer its type
      if (ai.resultCType) ctx.define(s.name, { ctype: ai.resultCType, varKind: s.varKind });
      return;
    }

    // ── await in VarDestructArr (const [x,y] = await Promise.all([...])) ──
    if (s.kind === 'VarDestructArr' && s.init?.kind === 'Await') {
      ctx._checkBorrowsAcrossAwait(s.init);
      const ai = ctx._awaitInfoOf(s.init);
      if (!ai || ai.kind !== 'promise-all') return;

      const baseIdx = actx.awaitIdx;
      // Init all sub-states
      for (let j = 0; j < ai!.items!.length; j++) {
        const callName = ai!.items![j]?.expr?.callee?.kind === 'Ident'
          ? ai!.items![j].expr.callee.name : null;
        const sub = callName && ctx._asyncFuncs?.has(callName)
          ? ctx._asyncFuncs.get(callName) : null;
        if (sub) lines.push(`${I}self->_await_${actx.awaitIdx++} = (${sub.stateType}){0};`);
      }
      ctx._emitAsyncTransition(lines, actx, I);

      // Poll all + combined done check
      const notDone: string[] = [];
      for (let j = 0; j < ai!.items!.length; j++) {
        const callName = ai!.items![j]?.expr?.callee?.kind === 'Ident'
          ? ai!.items![j].expr.callee.name : null;
        const sub = callName && ctx._asyncFuncs?.has(callName)
          ? ctx._asyncFuncs.get(callName) : null;
        if (sub) {
          lines.push(`${I}${sub.pollFn}(&self->_await_${baseIdx + j});`);
          notDone.push(`!self->_await_${baseIdx + j}._done`);
        }
      }
      if (notDone.length) lines.push(`${I}if (${notDone.join(' || ')}) return;`);

      // Assign results to destructured vars (unwrap .value for Result_T_Err types)
      // NOTE: VarDestructArr.pattern is an array at runtime (parser emits elems directly)
      const patElems = s.pattern as unknown as (ArrayPatternElement | null)[];
      for (let j = 0; j < (patElems || []).length; j++) {
        const elem = patElems[j];
        if (!elem) continue;
        const callName = ai!.items![j]?.expr?.callee?.kind === 'Ident'
          ? ai!.items![j].expr.callee.name : null;
        const sub = callName && ctx._asyncFuncs?.has(callName)
          ? ctx._asyncFuncs.get(callName) : null;
        if (sub) {
          const needsUnwrap = sub.resultCType?.startsWith('Result_');
          const rhs = needsUnwrap
            ? `self->_await_${baseIdx + j}._result.value`
            : `self->_await_${baseIdx + j}._result`;
          if (ctx._selfCtx!.promoted.has(elem.name!)) {
            lines.push(`${I}self->${elem.name} = ${rhs};`);
          } else {
            let et;
            if (needsUnwrap) {
              const valIdent = sub.resultCType!.slice(7, sub.resultCType!.lastIndexOf('_'));
              et = ctx._arrIdentToCType(valIdent);
            } else {
              et = sub.resultCType || 'int32_t';
            }
            lines.push(`${I}${et} ${elem.name} = ${rhs};`);
          }
        }
      }
      return;
    }

    // ── await in ExprStmt (no result) ──
    if (s.kind === 'ExprStmt' && s.expr?.kind === 'Await') {
      // Special case: await t.join() on a spawned thread handle
      const awaitInner = s.expr.expr;
      if (awaitInner?.kind === 'Call' && awaitInner.callee?.kind === 'Member' && awaitInner.callee.prop === 'join') {
        const tObj = awaitInner.callee.object;
        const alias = ctx._selfCtx?.spawnVarAlias?.get((tObj as Ident | undefined)?.name ?? '');
        if (alias) {
          lines.push(`${I}if (!tsc_thread_done(self->${alias})) return;`);
          lines.push(`${I}tsc_thread_join(self->${alias});`);
          return;
        }
      }
      ctx._checkAwaitTarget(s.expr);
      ctx._checkBorrowsAcrossAwait(s.expr);
      const ai = ctx._awaitInfoOf(s.expr);
      if (!ai) return;

      // Promise.allSettled / race / any as statement (no result capture)
      if (ai.kind === 'promise-allSettled' || ai.kind === 'promise-race' || ai.kind === 'promise-any') {
        const baseIdx = actx.awaitIdx;
        const subItems: { idx: number; sub: AsyncSub }[] = [];
        for (const item of ai!.items!) {
          const callName = item?.expr?.callee?.kind === 'Ident' ? item.expr.callee.name : null;
          const sub = callName && ctx._asyncFuncs?.has(callName) ? ctx._asyncFuncs.get(callName) : null;
          if (sub) { lines.push(`${I}self->_await_${actx.awaitIdx++} = (${sub.stateType}){0};`); subItems.push({ idx: baseIdx + subItems.length, sub }); }
        }
        ctx._emitAsyncTransition(lines, actx, I);
        const notDone: string[] = [];
        for (const { idx, sub } of subItems) {
          lines.push(`${I}${sub.pollFn}(&self->_await_${idx});`);
          notDone.push(`!self->_await_${idx}._done`);
        }
        if (notDone.length) {
          const op = ai.kind === 'promise-allSettled' ? ' || ' : ' && ';
          lines.push(`${I}if (${notDone.join(op)}) return;`);
        }
        return;
      }

      const awaitIdx = actx.awaitIdx++;

      if (ai.kind === 'sleep') {
        const argC = ctx._selfE(ai.args?.[0]?.expr);
        lines.push(`${I}self->_await_${awaitIdx} = tsc_sleep_awaitable(${argC});`);
      } else if (ai.initFn) {
        const callArgs = [...(ai.rawArgs ?? [])];
        for (const arg of (ai.args ?? [])) {
          const argExpr = arg?.expr;
          if (!argExpr) continue;
          const argC = ctx._selfE(argExpr);
          const argType = ctx.inferType(argExpr);
          if (argType === 'Array_u8' || argType?.startsWith('Array_')) {
            callArgs.push(`${argC}.data`, `${argC}.length`);
          } else {
            callArgs.push(argC);
          }
        }
        lines.push(`${I}self->_await_${awaitIdx} = ${ai.initFn}(${callArgs.join(', ')});`);
      } else {
        lines.push(`${I}self->_await_${awaitIdx} = (${ai.stateType}){0};`);
      }
      ctx._emitAsyncTransition(lines, actx, I);
      lines.push(`${I}${ai.pollFn}(&self->_await_${awaitIdx});`);
      lines.push(`${I}if (!self->_await_${awaitIdx}._done) return;`);
      return;
    }

    // ── try/catch/finally with await ──
    if (s.kind === 'TryCatch') {
      const savedInTryCatch = ctx._inAsyncTryCatch;
      ctx._inAsyncTryCatch = true;
      for (const ts of s.body?.body || []) ctx._emitAsyncStmt(ts, lines, actx, I);
      ctx._inAsyncTryCatch = savedInTryCatch;
      const lastAwaitIdx = actx.awaitIdx - 1;

      const catchClause = s.catches?.[0];
      if (catchClause) {
        const { param, body: catchBody } = catchClause;
        if (param && !catchClause.typeAnn) {
          throw ctx.error(`TypeError: catch clause requires explicit error type`, catchClause);
        }
        lines.push(`${I}if (!self->_await_${lastAwaitIdx}._result.ok) {`);
        if (param) {
          const pct = catchClause.typeAnn ? ctx.resolveType(catchClause.typeAnn) : 'void *';
          const bodyStr = JSON.stringify(catchBody);
          const paramUsed = bodyStr.includes(`"name":"${param}"`);
          if (paramUsed) {
            lines.push(`${I}    ${pct} ${param} = self->_await_${lastAwaitIdx}._result.error;`);
          } else {
            lines.push(`${I}    (void)self->_await_${lastAwaitIdx}._result.error;`);
          }
        }
        for (const cs of catchBody?.body || []) ctx._emitAsyncRegStmt(cs, lines, I + '    ');
        const catchEndsControl = (catchBody?.body || []).some((cs: Stmt) => cs.kind === 'Return' || cs.kind === 'Break' || cs.kind === 'Throw');
        if (!catchEndsControl) {
          if (ctx._selfCtx!.hasCleanup) {
            lines.push(`${I}    goto _cleanup;`);
          } else {
            lines.push(`${I}    self->_done = true;`);
            lines.push(`${I}    return;`);
          }
        }
        lines.push(`${I}}`);
      }
      if (s.finally) {
        for (const fs of s.finally.body || []) ctx._emitAsyncRegStmt(fs, lines, I);
      }
      return;
    }

    // ── for await ──
    if (s.kind === 'ForOf' && s.await) {
      // NOTE: ForOf.binding is an Ident-like node at runtime (parser emits {kind:'Ident',name})
      const iter = s.iterable as Call | Ident | undefined;
      const iterCallee = (iter as Call | undefined)?.callee;
      const genName = iterCallee?.kind === 'Ident' ? iterCallee.name
                    : iter?.kind === 'Ident' ? iter.name : null;
      const gi = genName && ctx._generatorFuncs?.has(genName)
        ? ctx._generatorFuncs.get(genName) : null;
      if (!gi) return;

      const genIdx = actx.genIdx++;
      const genArgs = iter?.kind === 'Call' ? (iter.args || []) : [];
      const loopCase = actx.nextCase;

      lines.push(`${I}self->_gen_${genIdx} = (${gi.stateType}){0};`);
      lines.push(`${I}self->_state = ${loopCase};`);
      lines.push(`${I}/* fall through */`);
      lines.push(`case_${loopCase}:`);
      lines.push(`        case ${loopCase}: {`);
      actx.nextCase++;

      const genArgsC = genArgs.map((a: Argument) => ctx._selfE(a.expr)).join(', ');
      const nextArgs = genArgsC ? `&self->_gen_${genIdx}, ${genArgsC}` : `&self->_gen_${genIdx}`;
      const nrVar = `_nr_${genIdx}`;
      lines.push(`${I}    ${gi.resultType} ${nrVar} = ${gi.nextFn}(${nextArgs});`);
      if (ctx._selfCtx!.hasCleanup) {
        lines.push(`${I}    if (${nrVar}.done) { goto _cleanup; }`);
      } else {
        lines.push(`${I}    if (${nrVar}.done) { self->_done = true; return; }`);
      }

      const bnd = s.binding as unknown as Ident | undefined;
      if (bnd?.kind === 'Ident') {
        lines.push(`${I}    const ${gi.valueType} ${bnd.name} = ${nrVar}.value;`);
      }

      for (const bs of (s.body as Block).body || []) {
        const tmp: string[] = [];
        ctx.visitStmt(bs, tmp, 0);
        for (const l of tmp) lines.push(`${I}    ${l.trim()}`);
      }

      lines.push(`${I}    goto case_${loopCase};`);
      lines.push(`        }`);
      actx.terminated = true; // loop handles done internally via _nr.done check
      return;
    }

    // ── throw (in async throws function) ──
    if (s.kind === 'Throw' && ctx._selfCtx?.hasThrows) {
      lines.push(`${I}self->_result = (${ctx._selfCtx.resultCType}){.ok = false, .error = ${ctx._selfE(s.value)}};`);
      if (ctx._selfCtx!.hasCleanup) {
        lines.push(`${I}goto _cleanup;`);
      } else {
        lines.push(`${I}self->_done = true;`);
        lines.push(`${I}return;`);
      }
      actx.terminated = true;
      return;
    }

    // ── return ──
    if (s.kind === 'Return') {
      const retCtx = ctx._selfCtx;
      if (s.value) {
        if (retCtx?.hasThrows) {
          lines.push(`${I}self->_result = (${retCtx.resultCType}){.ok = true, .value = ${ctx._selfE(s.value)}};`);
        } else {
          lines.push(`${I}self->_result = ${ctx._selfE(s.value)};`);
        }
      } else if (retCtx?.hasThrows) {
        lines.push(`${I}self->_result = (${retCtx.resultCType}){.ok = true};`);
      }
      if (ctx._selfCtx!.hasCleanup) {
        lines.push(`${I}goto _cleanup;`);
      } else {
        lines.push(`${I}self->_done = true;`);
        lines.push(`${I}return;`);
      }
      actx.terminated = true;
      return;
    }

    // ── switch → if/else if in async context ──
    if (s.kind === 'Switch') {
      ctx._emitAsyncSwitch(s, lines, actx, I);
      return;
    }

    // ── break/continue in async while/do-while → goto ──
    if (s.kind === 'Break' && !s.label && ctx._asyncBreakStack?.length) {
      lines.push(`${I}goto ${ctx._asyncBreakStack[ctx._asyncBreakStack.length - 1]};`);
      return;
    }
    if (s.kind === 'Continue' && !s.label && ctx._asyncContinueStack?.length) {
      lines.push(`${I}goto ${ctx._asyncContinueStack[ctx._asyncContinueStack.length - 1]};`);
      return;
    }

    // ── regular statement ──
    ctx._emitAsyncRegStmt(s, lines, I);
}

  // Emit a regular statement (non-VarDecl, non-Return, non-Await) in async context
export function _emitAsyncRegStmt(ctx: CodeGenContext, stmt: Stmt, lines: string[], I: string) {
    if (!stmt) return;
    if (stmt.kind === 'VarDecl') {
      const { name, init } = stmt;
      const sctx = ctx._selfCtx;
      if (sctx?.inlined.has(name)) return;
      if (sctx?.promoted.has(name)) {
        if (init) {
          const ct = stmt.typeAnn ? ctx.resolveType(stmt.typeAnn)
                   : (init ? (ctx.inferType(init) || null) : null);
          const prevExpected = ctx._expectedType;
          if (ct?.startsWith('Array_')) ctx._expectedType = ct;
          let initC = ctx._selfE(init);
          ctx._expectedType = prevExpected;
          if (initC === '{0}' && ct) initC = `(${ct}){0}`;
          lines.push(`${I}self->${name} = ${initC};`);
          if (sctx!.stringFields.includes(name) &&
              (init.kind === 'Ident' || init.kind === 'Member' || init.kind === 'Index')) {
            lines.push(`${I}tsc_string_retain(self->${name});`);
          }
          if (ct) ctx.define(name, { ctype: ct, varKind: stmt.varKind ?? 'const' });
        }
      } else {
        const tmp: string[] = [];
        ctx.visitStmt(stmt, tmp, 0);
        for (const l of tmp) lines.push(I + l.trim());
      }
    } else if (stmt.kind === 'Return') {
      const sctx = ctx._selfCtx;
      if (stmt.value) {
        if (sctx?.hasThrows) {
          lines.push(`${I}self->_result = (${sctx.resultCType}){.ok = true, .value = ${ctx._selfE(stmt.value)}};`);
        } else {
          lines.push(`${I}self->_result = ${ctx._selfE(stmt.value)};`);
        }
      } else if (sctx?.hasThrows) {
        lines.push(`${I}self->_result = (${sctx.resultCType}){.ok = true};`);
      }
      if (sctx?.hasCleanup) {
        lines.push(`${I}goto _cleanup;`);
      } else {
        lines.push(`${I}self->_done = true;`);
        lines.push(`${I}return;`);
      }
    } else if (stmt.kind === 'Throw') {
      const sctx = ctx._selfCtx;
      if (sctx?.hasThrows) {
        lines.push(`${I}self->_result = (${sctx.resultCType}){.ok = false, .error = ${ctx._selfE(stmt.value)}};`);
        if (sctx.hasCleanup) {
          lines.push(`${I}goto _cleanup;`);
        } else {
          lines.push(`${I}self->_done = true;`);
          lines.push(`${I}return;`);
        }
      } else {
        const tmp: string[] = [];
        ctx.visitStmt(stmt, tmp, 0);
        for (const l of tmp) lines.push(I + l.trim());
      }
    } else {
      const tmp: string[] = [];
      ctx.visitStmt(stmt, tmp, 0);
      for (const l of tmp) lines.push(I + l.trim());
    }
}

export function _emitAsyncSwitch(ctx: CodeGenContext, node: Switch, lines: string[], actx: AsyncEmitCtx, I: string) {
    ctx._validateSwitchFallthrough(node);
    const discC = ctx._selfE(node.discriminant);
    const discType = ctx.inferType(node.discriminant);
    const discEnumDef = ctx.classes.get(discType);

    // Build grouped cases: consecutive empty cases + final non-empty case
    const groups: { tests: Expression[]; hasBody: boolean; body?: Stmt[] }[] = [];
    // NOTE: SwitchCase.consequent in AST, but parser emits { test, body } at runtime
    const cases = node.cases as unknown as { test: Expression | null; body: Stmt[] }[];
    for (const c of cases) {
      if (c.body.length === 0) {
        // Empty case — starts a new group or extends current one
        if (groups.length === 0 || groups[groups.length - 1].hasBody) {
          groups.push({ tests: [], hasBody: false });
        }
        if (c.test) groups[groups.length - 1].tests.push(c.test);
      } else {
        // Non-empty case
        if (groups.length === 0 || groups[groups.length - 1].hasBody) {
          groups.push({ tests: [], hasBody: true, body: c.body });
        } else {
          groups[groups.length - 1].hasBody = true;
          groups[groups.length - 1].body = c.body;
        }
        if (c.test) groups[groups.length - 1].tests.push(c.test);
      }
    }

    // Emit if/else if/else chain
    let first = true;
    for (const g of groups) {
      const isDefault = g.tests.length === 0;
      const condParts: string[] = [];
      for (const t of g.tests) {
        if (discEnumDef?.isStringLiteralUnion && t.kind === 'Literal' && t.litType === 'string') {
          condParts.push(`${discC} == ${discType}_${t.value}`);
        } else {
          condParts.push(`${discC} == ${ctx._selfE(t)}`);
        }
      }
      const cond = condParts.length > 1 ? `(${condParts.join(' || ')})` : condParts[0];

      if (isDefault) {
        lines.push(`${I}} else {`);
      } else if (first) {
        lines.push(`${I}if (${cond}) {`);
        first = false;
      } else {
        lines.push(`${I}} else if (${cond}) {`);
      }

      // Emit body statements through async path
      if (g.body) {
        for (const bs of g.body) {
          if (bs.kind === 'Break' && !bs.label) {
            // break inside switch = end of case branch, skip
            continue;
          }
          if (bs.kind === 'Continue' && !bs.label) {
            // continue to outer while loop — use goto
            const loopLabel = actx.loopLabels?.length > 0 ? actx.loopLabels[actx.loopLabels.length - 1] : null;
            if (loopLabel) {
              lines.push(`${I}    goto case_${loopLabel};`);
            } else {
              // No outer while — bare continue is an error in switch
              lines.push(`${I}    /* continue without outer loop */`);
            }
            continue;
          }
          if (bs.kind === 'Break' && bs.label) {
            lines.push(`${I}    goto ${bs.label}_break;`);
            continue;
          }
          if (bs.kind === 'Continue' && bs.label) {
            lines.push(`${I}    goto ${bs.label}_continue;`);
            continue;
          }
          ctx._emitAsyncStmt(bs, lines, actx, I + '    ');
        }
      }
    }
    if (!first) {
      lines.push(`${I}}`);
    }
}

  // Evaluate an expression with the current _selfCtx substitution
export function _selfE(ctx: CodeGenContext, expr: Expression | null | undefined) {
    if (!expr) return '0';
    const r = ctx.exprToC(expr, [], 0);
    return r;
}

