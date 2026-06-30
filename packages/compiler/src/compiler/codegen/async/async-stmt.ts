import type { CodeGenThis } from '../../codegen.js';
// async-stmt.ts
export default {
  _emitAsyncStmt(this: CodeGenThis, s: any, lines: any, ctx: any, I: any) {
    if (!s) return;

    // ── spawn VarDecl: emit call site using pre-emitted env/fn ──
    if (s.kind === 'VarDecl' && s.init?.kind === 'Spawn') {
      const si = this._selfCtx?.spawnInfos?.find((info: any) => info.userVar === s.name);
      if (!si) return;
      // Patch previous line (e.g. "        case 0:") to open a block
      if (lines.length > 0) lines[lines.length - 1] += ' {';
      lines.push(`${I}${si.envType} *${si.envVar} = malloc(sizeof(${si.envType}));`);
      for (const fv of si.freeVars) {
        lines.push(`${I}${si.envVar}->${fv.name} = ${fv.name};`);
      }
      lines.push(`${I}self->${si.threadVar} = tsc_thread_spawn(${si.fnName}, ${si.envVar});`);
      lines.push(`${I}self->_state = ${ctx.nextCase};`);
      lines.push('        }');
      lines.push(`        case ${ctx.nextCase}:`);
      ctx.nextCase++;
      this.define(s.name, { ctype: 'tsc_thread_t', varKind: s.varKind, _isThread: true });
      return;
    }

    // ── await in VarDecl ──
    if (s.kind === 'VarDecl' && s.init?.kind === 'Await') {
      this._checkAwaitTarget(s.init);
      this._checkBorrowsAcrossAwait(s.init);
      const ai = this._awaitInfoOf(s.init);
      if (!ai) return;

      // Promise.race / Promise.any: poll all, take first done's result
      if (ai.kind === 'promise-race' || ai.kind === 'promise-any') {
        const baseIdx = ctx.awaitIdx;
        const doneConds: any[] = [];
        for (const item of ai.items) {
          const callName = item?.expr?.callee?.kind === 'Ident' ? item.expr.callee.name : null;
          const sub = callName && this._asyncFuncs?.has(callName) ? this._asyncFuncs.get(callName) : null;
          if (sub) {
            lines.push(`${I}self->_await_${ctx.awaitIdx++} = (${sub.stateType}){0};`);
            doneConds.push({ idx: baseIdx + doneConds.length, sub });
          }
        }
        this._emitAsyncTransition(lines, ctx, I);
        for (const { idx, sub } of doneConds) lines.push(`${I}${sub.pollFn}(&self->_await_${idx});`);
        if (doneConds.length) {
          lines.push(`${I}if (${doneConds.map(({ idx }) => `!self->_await_${idx}._done`).join(' && ')}) return;`);
        }
        if (ai.resultCType) {
          let rhs = `self->_await_${doneConds[doneConds.length - 1].idx}._result`;
          for (let j = doneConds.length - 2; j >= 0; j--) {
            rhs = `self->_await_${doneConds[j].idx}._done ? self->_await_${doneConds[j].idx}._result : ${rhs}`;
          }
          if (this._selfCtx.promoted.has(s.name)) {
            lines.push(`${I}self->${s.name} = ${rhs};`);
          } else {
            lines.push(`${I}${ai.resultCType} ${s.name} = ${rhs};`);
          }
        }
        if (ai.resultCType) this.define(s.name, { ctype: ai.resultCType, varKind: s.varKind });
        return;
      }

      const awaitIdx = ctx.awaitIdx++;

      if (ai.kind === 'sleep') {
        const argC = this._selfE(ai.args?.[0]?.expr);
        lines.push(`${I}self->_await_${awaitIdx} = tsc_sleep_awaitable(${argC});`);
      } else if (ai.kind === 'net-fetch') {
        // fetch(url, opts?) — special handling for options object
        const urlArg = ai.args?.[0]?.expr;
        const urlC = urlArg ? this._selfE(urlArg) : 'STR_LIT("")';
        const optsArg = ai.args?.[1]?.expr;
        if (optsArg && optsArg.kind === 'ObjLit') {
          // Wrap case in {} for local opts var
          if (lines.length > 0) lines[lines.length - 1] += ' {';
          const optsIdx = this._fetchOptsCount ?? 0;
          this._fetchOptsCount = optsIdx + 1;
          const optsVar = `_opts_${optsIdx}`;
          const optsFields = (optsArg.props ?? []).map((p: any) => `.${p.key} = ${this._selfE(p.value)}`);
          lines.push(`${I}TscFetchOptions ${optsVar} = { ${optsFields.join(', ')} };`);
          lines.push(`${I}self->_await_${awaitIdx} = tsc_fetch_async(${urlC}, &${optsVar});`);
          lines.push(`${I}self->_state = ${ctx.nextCase};`);
          lines.push(`${I}/* fall through */`);
          lines.push('        }');
          lines.push(`        case ${ctx.nextCase}:`);
          ctx.nextCase++;
        } else {
          lines.push(`${I}self->_await_${awaitIdx} = tsc_fetch_async(${urlC}, NULL);`);
          this._emitAsyncTransition(lines, ctx, I);
        }
      } else if (ai.initFn) {
        const callArgs = [...(ai.rawArgs ?? [])];
        for (const arg of (ai.args ?? [])) {
          const argExpr = arg?.expr;
          if (!argExpr) continue;
          const argC = this._selfE(argExpr);
          const argType = this.inferType(argExpr);
          if (argType === 'Array_u8' || argType?.startsWith('Array_')) {
            callArgs.push(`${argC}.data`, `${argC}.length`);
          } else {
            callArgs.push(argC);
          }
        }
        lines.push(`${I}self->_await_${awaitIdx} = ${ai.initFn}(${callArgs.join(', ')});`);
        this._emitAsyncTransition(lines, ctx, I);
      } else {
        lines.push(`${I}self->_await_${awaitIdx} = (${ai.stateType}){0};`);
        this._emitAsyncTransition(lines, ctx, I);
      }
      lines.push(`${I}${ai.pollFn}(&self->_await_${awaitIdx});`);
      lines.push(`${I}if (!self->_await_${awaitIdx}._done) return;`);
      if (ai.isResult) {
        if (!this._inAsyncTryCatch) {
          if (this._selfCtx.hasCleanup) {
            lines.push(`${I}if (!self->_await_${awaitIdx}._result.ok) { goto _cleanup; }`);
          } else {
            lines.push(`${I}if (!self->_await_${awaitIdx}._result.ok) { self->_done = true; return; }`);
          }
        }
        if (this._selfCtx.promoted.has(s.name) && ai.resultCType) {
          lines.push(`${I}self->${s.name} = self->_await_${awaitIdx}._result.value;`);
        } else if (ai.resultCType) {
          lines.push(`${I}${ai.resultCType} ${s.name} = self->_await_${awaitIdx}._result.value;`);
        }
      } else if (ai.resultCType) {
        if (this._selfCtx.promoted.has(s.name)) {
          lines.push(`${I}self->${s.name} = self->_await_${awaitIdx}._result;`);
        } else {
          lines.push(`${I}${ai.resultCType} ${s.name} = self->_await_${awaitIdx}._result;`);
        }
      }
      // Define var in scope so subsequent expressions can infer its type
      if (ai.resultCType) this.define(s.name, { ctype: ai.resultCType, varKind: s.varKind });
      return;
    }

    // ── await in VarDestructArr (const [x,y] = await Promise.all([...])) ──
    if (s.kind === 'VarDestructArr' && s.init?.kind === 'Await') {
      this._checkBorrowsAcrossAwait(s.init);
      const ai = this._awaitInfoOf(s.init);
      if (!ai || ai.kind !== 'promise-all') return;

      const baseIdx = ctx.awaitIdx;
      // Init all sub-states
      for (let j = 0; j < ai.items.length; j++) {
        const callName = ai.items[j]?.expr?.callee?.kind === 'Ident'
          ? ai.items[j].expr.callee.name : null;
        const sub = callName && this._asyncFuncs?.has(callName)
          ? this._asyncFuncs.get(callName) : null;
        if (sub) lines.push(`${I}self->_await_${ctx.awaitIdx++} = (${sub.stateType}){0};`);
      }
      this._emitAsyncTransition(lines, ctx, I);

      // Poll all + combined done check
      const notDone: any[] = [];
      for (let j = 0; j < ai.items.length; j++) {
        const callName = ai.items[j]?.expr?.callee?.kind === 'Ident'
          ? ai.items[j].expr.callee.name : null;
        const sub = callName && this._asyncFuncs?.has(callName)
          ? this._asyncFuncs.get(callName) : null;
        if (sub) {
          lines.push(`${I}${sub.pollFn}(&self->_await_${baseIdx + j});`);
          notDone.push(`!self->_await_${baseIdx + j}._done`);
        }
      }
      if (notDone.length) lines.push(`${I}if (${notDone.join(' || ')}) return;`);

      // Assign results to destructured vars (unwrap .value for Result_T_Err types)
      for (let j = 0; j < (s.pattern || []).length; j++) {
        const elem = s.pattern[j];
        if (!elem) continue;
        const callName = ai.items[j]?.expr?.callee?.kind === 'Ident'
          ? ai.items[j].expr.callee.name : null;
        const sub = callName && this._asyncFuncs?.has(callName)
          ? this._asyncFuncs.get(callName) : null;
        if (sub) {
          const needsUnwrap = sub.resultCType?.startsWith('Result_');
          const rhs = needsUnwrap
            ? `self->_await_${baseIdx + j}._result.value`
            : `self->_await_${baseIdx + j}._result`;
          if (this._selfCtx.promoted.has(elem.name)) {
            lines.push(`${I}self->${elem.name} = ${rhs};`);
          } else {
            let et;
            if (needsUnwrap) {
              const valIdent = sub.resultCType.slice(7, sub.resultCType.lastIndexOf('_'));
              et = this._arrIdentToCType(valIdent);
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
        const alias = this._selfCtx?.spawnVarAlias?.get(tObj?.name);
        if (alias) {
          lines.push(`${I}if (!tsc_thread_done(self->${alias})) return;`);
          lines.push(`${I}tsc_thread_join(self->${alias});`);
          return;
        }
      }
      this._checkAwaitTarget(s.expr);
      this._checkBorrowsAcrossAwait(s.expr);
      const ai = this._awaitInfoOf(s.expr);
      if (!ai) return;

      // Promise.allSettled / race / any as statement (no result capture)
      if (ai.kind === 'promise-allSettled' || ai.kind === 'promise-race' || ai.kind === 'promise-any') {
        const baseIdx = ctx.awaitIdx;
        const subItems: any[] = [];
        for (const item of ai.items) {
          const callName = item?.expr?.callee?.kind === 'Ident' ? item.expr.callee.name : null;
          const sub = callName && this._asyncFuncs?.has(callName) ? this._asyncFuncs.get(callName) : null;
          if (sub) { lines.push(`${I}self->_await_${ctx.awaitIdx++} = (${sub.stateType}){0};`); subItems.push({ idx: baseIdx + subItems.length, sub }); }
        }
        this._emitAsyncTransition(lines, ctx, I);
        const notDone: any[] = [];
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

      const awaitIdx = ctx.awaitIdx++;

      if (ai.kind === 'sleep') {
        const argC = this._selfE(ai.args?.[0]?.expr);
        lines.push(`${I}self->_await_${awaitIdx} = tsc_sleep_awaitable(${argC});`);
      } else if (ai.initFn) {
        const callArgs = [...(ai.rawArgs ?? [])];
        for (const arg of (ai.args ?? [])) {
          const argExpr = arg?.expr;
          if (!argExpr) continue;
          const argC = this._selfE(argExpr);
          const argType = this.inferType(argExpr);
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
      this._emitAsyncTransition(lines, ctx, I);
      lines.push(`${I}${ai.pollFn}(&self->_await_${awaitIdx});`);
      lines.push(`${I}if (!self->_await_${awaitIdx}._done) return;`);
      return;
    }

    // ── try/catch/finally with await ──
    if (s.kind === 'TryCatch') {
      const savedInTryCatch = this._inAsyncTryCatch;
      this._inAsyncTryCatch = true;
      for (const ts of s.body?.body || []) this._emitAsyncStmt(ts, lines, ctx, I);
      this._inAsyncTryCatch = savedInTryCatch;
      const lastAwaitIdx = ctx.awaitIdx - 1;

      const catchClause = s.catches?.[0];
      if (catchClause) {
        const { param, body: catchBody } = catchClause;
        if (param && !catchClause.typeAnn) {
          throw this.error(`TypeError: catch clause requires explicit error type`, catchClause);
        }
        lines.push(`${I}if (!self->_await_${lastAwaitIdx}._result.ok) {`);
        if (param) {
          const pct = catchClause.typeAnn ? this.resolveType(catchClause.typeAnn) : 'void *';
          const bodyStr = JSON.stringify(catchBody);
          const paramUsed = bodyStr.includes(`"name":"${param}"`);
          if (paramUsed) {
            lines.push(`${I}    ${pct} ${param} = self->_await_${lastAwaitIdx}._result.error;`);
          } else {
            lines.push(`${I}    (void)self->_await_${lastAwaitIdx}._result.error;`);
          }
        }
        for (const cs of catchBody?.body || []) this._emitAsyncRegStmt(cs, lines, I + '    ');
        const catchEndsControl = (catchBody?.body || []).some((cs: any) => cs.kind === 'Return' || cs.kind === 'Break' || cs.kind === 'Throw');
        if (!catchEndsControl) {
          if (this._selfCtx.hasCleanup) {
            lines.push(`${I}    goto _cleanup;`);
          } else {
            lines.push(`${I}    self->_done = true;`);
            lines.push(`${I}    return;`);
          }
        }
        lines.push(`${I}}`);
      }
      if (s.finally) {
        for (const fs of s.finally.body || []) this._emitAsyncRegStmt(fs, lines, I);
      }
      return;
    }

    // ── for await ──
    if (s.kind === 'ForOf' && s.await) {
      const genName = s.iterable?.callee?.kind === 'Ident' ? s.iterable.callee.name
                    : s.iterable?.kind === 'Ident' ? s.iterable.name : null;
      const gi = genName && this._generatorFuncs?.has(genName)
        ? this._generatorFuncs.get(genName) : null;
      if (!gi) return;

      const genIdx = ctx.genIdx++;
      const genArgs = s.iterable?.kind === 'Call' ? (s.iterable.args || []) : [];
      const loopCase = ctx.nextCase;

      lines.push(`${I}self->_gen_${genIdx} = (${gi.stateType}){0};`);
      lines.push(`${I}self->_state = ${loopCase};`);
      lines.push(`${I}/* fall through */`);
      lines.push(`case_${loopCase}:`);
      lines.push(`        case ${loopCase}: {`);
      ctx.nextCase++;

      const genArgsC = genArgs.map((a: any) => this._selfE(a.expr)).join(', ');
      const nextArgs = genArgsC ? `&self->_gen_${genIdx}, ${genArgsC}` : `&self->_gen_${genIdx}`;
      const nrVar = `_nr_${genIdx}`;
      lines.push(`${I}    ${gi.resultType} ${nrVar} = ${gi.nextFn}(${nextArgs});`);
      if (this._selfCtx.hasCleanup) {
        lines.push(`${I}    if (${nrVar}.done) { goto _cleanup; }`);
      } else {
        lines.push(`${I}    if (${nrVar}.done) { self->_done = true; return; }`);
      }

      if (s.binding?.kind === 'Ident') {
        lines.push(`${I}    const ${gi.valueType} ${s.binding.name} = ${nrVar}.value;`);
      }

      for (const bs of s.body?.body || []) {
        const tmp: any[] = [];
        this.visitStmt(bs, tmp, 0);
        for (const l of tmp) lines.push(`${I}    ${l.trim()}`);
      }

      lines.push(`${I}    goto case_${loopCase};`);
      lines.push(`        }`);
      ctx.terminated = true; // loop handles done internally via _nr.done check
      return;
    }

    // ── throw (in async throws function) ──
    if (s.kind === 'Throw' && this._selfCtx?.hasThrows) {
      lines.push(`${I}self->_result = (${this._selfCtx.resultCType}){.ok = false, .error = ${this._selfE(s.value)}};`);
      if (this._selfCtx.hasCleanup) {
        lines.push(`${I}goto _cleanup;`);
      } else {
        lines.push(`${I}self->_done = true;`);
        lines.push(`${I}return;`);
      }
      ctx.terminated = true;
      return;
    }

    // ── return ──
    if (s.kind === 'Return') {
      const retCtx = this._selfCtx;
      if (s.value) {
        if (retCtx?.hasThrows) {
          lines.push(`${I}self->_result = (${retCtx.resultCType}){.ok = true, .value = ${this._selfE(s.value)}};`);
        } else {
          lines.push(`${I}self->_result = ${this._selfE(s.value)};`);
        }
      } else if (retCtx?.hasThrows) {
        lines.push(`${I}self->_result = (${retCtx.resultCType}){.ok = true};`);
      }
      if (this._selfCtx.hasCleanup) {
        lines.push(`${I}goto _cleanup;`);
      } else {
        lines.push(`${I}self->_done = true;`);
        lines.push(`${I}return;`);
      }
      ctx.terminated = true;
      return;
    }

    // ── switch → if/else if in async context ──
    if (s.kind === 'Switch') {
      this._emitAsyncSwitch(s, lines, ctx, I);
      return;
    }

    // ── break/continue in async while/do-while → goto ──
    if (s.kind === 'Break' && !s.label && this._asyncBreakStack?.length) {
      lines.push(`${I}goto ${this._asyncBreakStack[this._asyncBreakStack.length - 1]};`);
      return;
    }
    if (s.kind === 'Continue' && !s.label && this._asyncContinueStack?.length) {
      lines.push(`${I}goto ${this._asyncContinueStack[this._asyncContinueStack.length - 1]};`);
      return;
    }

    // ── regular statement ──
    this._emitAsyncRegStmt(s, lines, I);
  },

  // Emit a regular statement (non-VarDecl, non-Return, non-Await) in async context
  _emitAsyncRegStmt(this: CodeGenThis, stmt: any, lines: any, I: any) {
    if (!stmt) return;
    if (stmt.kind === 'VarDecl') {
      const { name, init } = stmt;
      const ctx = this._selfCtx;
      if (ctx?.inlined.has(name)) return;
      if (ctx?.promoted.has(name)) {
        if (init) {
          const ct = stmt.typeAnn ? this.resolveType(stmt.typeAnn)
                   : (init ? (this.inferType(init) || null) : null);
          const prevExpected = this._expectedType;
          if (ct?.startsWith('Array_')) this._expectedType = ct;
          let initC = this._selfE(init);
          this._expectedType = prevExpected;
          if (initC === '{0}' && ct) initC = `(${ct}){0}`;
          lines.push(`${I}self->${name} = ${initC};`);
          if (ctx.stringFields.includes(name) &&
              (init.kind === 'Ident' || init.kind === 'Member' || init.kind === 'Index')) {
            lines.push(`${I}tsc_string_retain(self->${name});`);
          }
          // Define in scope so subsequent _awaitInfoOf lookups see the correct type
          if (ct) this.define(name, { ctype: ct, varKind: stmt.varKind ?? 'const' });
        }
      } else {
        const tmp: any[] = [];
        this.visitStmt(stmt, tmp, 0);
        for (const l of tmp) lines.push(I + l.trim());
      }
    } else if (stmt.kind === 'Return') {
      const ctx = this._selfCtx;
      if (stmt.value) {
        if (ctx?.hasThrows) {
          // Wrap in Result ok=true
          lines.push(`${I}self->_result = (${ctx.resultCType}){.ok = true, .value = ${this._selfE(stmt.value)}};`);
        } else {
          lines.push(`${I}self->_result = ${this._selfE(stmt.value)};`);
        }
      } else if (ctx?.hasThrows) {
        lines.push(`${I}self->_result = (${ctx.resultCType}){.ok = true};`);
      }
      if (ctx?.hasCleanup) {
        lines.push(`${I}goto _cleanup;`);
      } else {
        lines.push(`${I}self->_done = true;`);
        lines.push(`${I}return;`);
      }
    } else if (stmt.kind === 'Throw') {
      const ctx = this._selfCtx;
      if (ctx?.hasThrows) {
        lines.push(`${I}self->_result = (${ctx.resultCType}){.ok = false, .error = ${this._selfE(stmt.value)}};`);
        if (ctx.hasCleanup) {
          lines.push(`${I}goto _cleanup;`);
        } else {
          lines.push(`${I}self->_done = true;`);
          lines.push(`${I}return;`);
        }
      } else {
        const tmp: any[] = [];
        this.visitStmt(stmt, tmp, 0);
        for (const l of tmp) lines.push(I + l.trim());
      }
    } else {
      const tmp: any[] = [];
      this.visitStmt(stmt, tmp, 0);
      for (const l of tmp) lines.push(I + l.trim());
    }
  },

  _emitAsyncSwitch(this: CodeGenThis, node: any, lines: any, ctx: any, I: any) {
    this._validateSwitchFallthrough(node);
    const discC = this._selfE(node.discriminant);
    const discType = this.inferType(node.discriminant);
    const discEnumDef = this.classes.get(discType);

    // Build grouped cases: consecutive empty cases + final non-empty case
    const groups: any[] = [];
    for (const c of node.cases) {
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
      const condParts: any[] = [];
      for (const t of g.tests) {
        if (discEnumDef?.isStringLiteralUnion && t.kind === 'Literal' && t.litType === 'string') {
          condParts.push(`${discC} == ${discType}_${t.value}`);
        } else {
          condParts.push(`${discC} == ${this._selfE(t)}`);
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
            const loopLabel = ctx.loopLabels?.length > 0 ? ctx.loopLabels[ctx.loopLabels.length - 1] : null;
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
          this._emitAsyncStmt(bs, lines, ctx, I + '    ');
        }
      }
    }
    if (!first) {
      lines.push(`${I}}`);
    }
  },

  // Evaluate an expression with the current _selfCtx substitution
  _selfE(this: CodeGenThis, expr: any) {
    if (!expr) return '0';
    const r = this.exprToC(expr, [], 0);
    return r;
  },
};
