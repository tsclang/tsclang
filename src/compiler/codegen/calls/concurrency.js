const ORDERING_MAP = {
  'LoadOrdering.Acquire': 'memory_order_acquire',
  'LoadOrdering.SeqCst': 'memory_order_seq_cst',
  'LoadOrdering.Relaxed': 'memory_order_relaxed',
  'StoreOrdering.Release': 'memory_order_release',
  'StoreOrdering.SeqCst': 'memory_order_seq_cst',
  'StoreOrdering.Relaxed': 'memory_order_relaxed',
  'RmwOrdering.AcqRel': 'memory_order_acq_rel',
  'RmwOrdering.SeqCst': 'memory_order_seq_cst',
  'RmwOrdering.Relaxed': 'memory_order_relaxed',
};

export default {
  _dispatchConcurrency(node, lines, depth) {
    const { callee, args } = node;
    if (callee.kind === 'Member') {
      const objName2 = callee.object?.kind === 'Ident' ? callee.object.name : null;
      const atomicSym = objName2 ? this.lookup(objName2) : null;
      if (atomicSym?._isAtomic) {
        const inner = atomicSym._atomicInner ?? 'int32_t';
        const isPtr = atomicSym._isSharedAtomic;
        const ref = isPtr ? `${objName2}->value` : `${objName2}.value`;

        const resolveOrdering = (argNode, op) => {
          if (!argNode) return null;
          const expr = argNode.expr ?? argNode;
          if (expr.kind === 'Member' && expr.object?.kind === 'Ident') {
            const key = `${expr.object.name}.${expr.prop}`;
            if (ORDERING_MAP[key]) return ORDERING_MAP[key];
          }
          if (expr.kind === 'Literal' && expr.litType === 'string') {
            const validStore = ['release', 'seq_cst'];
            const validLoad  = ['acquire', 'seq_cst'];
            const validRmw   = ['acq_rel', 'seq_cst'];
            const valid = op === 'store' ? validStore : op === 'load' ? validLoad : validRmw;
            if (!valid.includes(expr.value)) {
              throw this.error(`TypeError: Invalid memory ordering '${expr.value}' for ${op} operation; valid: ${valid.map(v=>`'${v}'`).join(', ')}`);
            }
            return `memory_order_${expr.value}`;
          }
          return this.exprToC(expr, lines, depth);
        };

        if (callee.prop === 'load') {
          const ord = resolveOrdering(args[0], 'load') ?? 'memory_order_acquire';
          return `atomic_load_explicit(&${ref}, ${ord})`;
        }
        if (callee.prop === 'store') {
          const valC = this.exprToC(args[0].expr, lines, depth);
          const ord = resolveOrdering(args[1], 'store') ?? 'memory_order_release';
          if (valC.includes('('))
            return `atomic_store_explicit(&${ref},\n        ${valC},\n        ${ord})`;
          return `atomic_store_explicit(&${ref}, ${valC}, ${ord})`;
        }
        if (callee.prop === 'fetchAdd') {
          const valC = this.exprToC(args[0].expr, lines, depth);
          const ord = resolveOrdering(args[1], 'rmw') ?? 'memory_order_acq_rel';
          return `atomic_fetch_add_explicit(&${ref}, ${valC}, ${ord})`;
        }
        if (callee.prop === 'compareExchange') {
          const expC = this.exprToC(args[0].expr, lines, depth);
          const desC = this.exprToC(args[1].expr, lines, depth);
          const successOrd = resolveOrdering(args[2], 'rmw') ?? 'memory_order_acq_rel';
          const failureOrd = 'memory_order_acquire';
          const tmpName = `_expected_${this._cmpxchgCount++}`;
          const I2 = ' '.repeat(this.indent * depth);
          lines.push(`${I2}${inner} ${tmpName} = ${expC};`);
          return `atomic_compare_exchange_strong_explicit(\n        &${ref}, &${tmpName}, ${desC},\n        ${successOrd}, ${failureOrd})`;
        }
      }
    }

    // AtomicArray<T> methods: .load(i), .store(i, v), .fetchAdd(i, v), .compareExchange(i, exp, des)
    if (callee.kind === 'Member') {
      const objNameAA = callee.object?.kind === 'Ident' ? callee.object.name : null;
      const aaSym = objNameAA ? this.lookup(objNameAA) : null;
      if (aaSym?._isAtomicArray) {
        const inner = aaSym._atomicArrayInner ?? 'int32_t';
        const ref = `${objNameAA}.data`;

        const resolveOrd = (argNode) => {
          if (!argNode) return null;
          const expr = argNode.expr ?? argNode;
          if (expr.kind === 'Member' && expr.object?.kind === 'Ident') {
            const key = `${expr.object.name}.${expr.prop}`;
            if (ORDERING_MAP[key]) return ORDERING_MAP[key];
          }
          return this.exprToC(expr, lines, depth);
        };

        if (callee.prop === 'load') {
          const idxC = this.exprToC(args[0].expr, lines, depth);
          const ord = resolveOrd(args[1], 'load') ?? 'memory_order_acquire';
          return `atomic_load_explicit(&${ref}[${idxC}], ${ord})`;
        }
        if (callee.prop === 'store') {
          const idxC = this.exprToC(args[0].expr, lines, depth);
          const valC = this.exprToC(args[1].expr, lines, depth);
          const ord = resolveOrd(args[2], 'store') ?? 'memory_order_release';
          return `atomic_store_explicit(&${ref}[${idxC}], ${valC}, ${ord})`;
        }
        if (callee.prop === 'fetchAdd') {
          const idxC = this.exprToC(args[0].expr, lines, depth);
          const valC = this.exprToC(args[1].expr, lines, depth);
          const ord = resolveOrd(args[2], 'rmw') ?? 'memory_order_acq_rel';
          return `atomic_fetch_add_explicit(&${ref}[${idxC}], ${valC}, ${ord})`;
        }
        if (callee.prop === 'compareExchange') {
          const idxC = this.exprToC(args[0].expr, lines, depth);
          const expC = this.exprToC(args[1].expr, lines, depth);
          const desC = this.exprToC(args[2].expr, lines, depth);
          const successOrd = resolveOrd(args[3], 'rmw') ?? 'memory_order_acq_rel';
          const failOrd = 'memory_order_acquire';
          const tmpName = `_expected_${this._cmpxchgCount++}`;
          const I2 = ' '.repeat(this.indent * depth);
          lines.push(`${I2}${inner} ${tmpName} = ${expC};`);
          return `atomic_compare_exchange_strong_explicit(\n        &${ref}[${idxC}], &${tmpName}, ${desC},\n        ${successOrd}, ${failOrd})`;
        }
      }
    }

    // Channel<T> methods: .send(), .receive(), .tryReceive(), .trySend(), .close(), .isEmpty()
    if (callee.kind === 'Member') {
      const objName3 = callee.object?.kind === 'Ident' ? callee.object.name : null;
      const chanSym = objName3 ? this.lookup(objName3) : null;
      if (chanSym?._isChannel) {
        const ident = chanSym._channelIdent;
        const inner3 = chanSym._channelInner;
        const inner_name = `${objName3}._inner`;
        if (callee.prop === 'send') {
          const valC = this.exprToC(args[0].expr, lines, depth);
          return `tsc_channel_send_${ident}(${inner_name}, ${valC})`;
        }
        if (callee.prop === 'receive') {
          return `tsc_channel_receive_${ident}(${inner_name})`;
        }
        if (callee.prop === 'tryReceive') {
          // Returns opt_T вЂ” emit typedef
          const optType = `opt_${ident}`;
          if (!this._emittedOptStructs.has(optType)) {
            this._emittedOptStructs.add(optType);
            this.addTop(`typedef struct { bool has_value; ${inner3} value; } ${optType};`);
            this.addTop('');
          }
          return `tsc_channel_try_receive_${ident}(${inner_name})`;
        }
        if (callee.prop === 'trySend') {
          const valC = this.exprToC(args[0].expr, lines, depth);
          return `tsc_channel_try_send_${ident}(${inner_name}, ${valC})`;
        }
        if (callee.prop === 'close') {
          return `tsc_channel_close_${ident}(${inner_name})`;
        }
        if (callee.prop === 'isEmpty') {
          return `tsc_channel_is_empty_${ident}(${inner_name})`;
        }
      }
    }

    // AbortController / AbortSignal methods
    if (callee.kind === 'Member') {
      const _acObjName = callee.object?.kind === 'Ident' ? callee.object.name : null;
      const _acSym = _acObjName ? this.lookup(_acObjName) : null;
      if (_acSym?.ctype === 'TscAbortController') {
        const _acC = this.exprToC(callee.object, lines, depth);
        if (callee.prop === 'abort') return `tsc_abort_controller_abort(&${_acC})`;
      }
      if (_acSym?.ctype === 'TscAbortSignal *') {
        const _asC = this.exprToC(callee.object, lines, depth);
        if (callee.prop === 'aborted') return `tsc_abort_signal_aborted(${_asC})`;
      }
      if (_acSym?.ctype === 'TscAsyncMutex') {
        const _amC = this.exprToC(callee.object, lines, depth);
        if (callee.prop === 'tryLock')  return `tsc_async_mutex_try_lock(&${_amC})`;
        if (callee.prop === 'unlock')   return `tsc_async_mutex_unlock(&${_amC})`;
        if (callee.prop === 'isLocked') return `tsc_async_mutex_is_locked(&${_amC})`;
        if (callee.prop === 'lock')     return `tsc_async_mutex_try_lock(&${_amC})`;
      }
    }

    // tsc_thread_t .join()
    if (callee.kind === 'Member' && callee.prop === 'join') {
      const objNameJ = callee.object?.kind === 'Ident' ? callee.object.name : null;
      const threadSym = objNameJ ? this.lookup(objNameJ) : null;
      if (threadSym?.ctype === 'tsc_thread_t' || threadSym?._isThread) {
        const tC = this.exprToC(callee.object, lines, depth);
        return `tsc_thread_join(${tC})`;
      }
    }

    // Thread.spawn(lambda) вЂ” handled in VarDecl; here for stmt-level call
    if (callee.kind === 'Member' &&
        callee.object?.kind === 'Ident' && callee.object.name === 'Thread' &&
        callee.prop === 'spawn') {
      const lambdaArg = args[0]?.expr;
      if (lambdaArg) {
        const spawnResult = this._emitSpawnBlock(null, lambdaArg.body ?? lambdaArg, [], lines, depth);
        return `(void)${spawnResult}`;
      }
      return '/* Thread.spawn */';
    }
    return null;
  },
};
