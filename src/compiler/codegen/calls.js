// calls.js
export default {
  callToC(node, lines, depth) {
    const { callee, args } = node;

    // Namespace import: Lib.someFunc(...) → desugar to Ident call
    if (callee.kind === 'Member' && callee.object?.kind === 'Ident') {
      const nsSym = this.lookup(callee.object.name);
      if (nsSym?._isNamespace) {
        const nsEntry = nsSym._namespaceExports?.[callee.prop];
        if (nsEntry) {
          this.define(callee.prop, nsEntry);
          // Re-dispatch as Ident call so mangling and type inference work normally
          const syntheticCall = { ...node, callee: { kind: 'Ident', name: callee.prop } };
          return this.callToC(syntheticCall, lines, depth);
        }
      }
    }

    // Generator .next() call: gen.next() → genFn_next(&gen, ...storedArgs)
    if (callee.kind === 'Member' && callee.prop === 'next') {
      const objName = callee.object?.name ?? callee.object;
      const sym = typeof objName === 'string' ? this.lookup(objName) : null;
      if (sym?._isGenState) {
        const gi = sym._gi;
        const objC = this.exprToC(callee.object, lines, depth);
        const nextArgs = [].concat(sym._genArgs || []);
        const callArgs = nextArgs.length ? `&${objC}, ${nextArgs.join(', ')}` : `&${objC}`;
        if (lines !== undefined) {
          const I = ' '.repeat(this.indent * depth);
          const rVar = `_r_${(this._genResultCount = (this._genResultCount || 0) + 1) - 1}`;
          lines.push(`${I}${gi.resultType} ${rVar} = ${gi.nextFn}(${callArgs});`);
          this.define(rVar, { ctype: gi.resultType, varKind: 'let' });
          return rVar;
        }
        return `${gi.nextFn}(${callArgs})`;
      }
    }

    // Optional chaining: x?.method() where x is opt_T
    if (callee.kind === 'OptChain') {
      const obj = callee.object;
      const objType = this.inferType(obj);
      const objC = this.exprToC(obj, lines, depth);
      if (objType?.startsWith('opt_')) {
        const innerIdent = objType.slice(4);
        if (callee.prop === 'toString') {
          // Ensure opt_string typedef is emitted
          if (!this._emittedOptStructs) this._emittedOptStructs = new Set();
          if (!this._emittedOptStructs.has('opt_string')) {
            this._emittedOptStructs.add('opt_string');
            this.addTop(`typedef struct { bool has_value; String value; } opt_string;`);
          }
          const fnName = `tsc_${innerIdent}_to_string`;
          return `${objC}.has_value ? (opt_string){true, ${fnName}(${objC}.value)} : (opt_string){false, STR_LIT("")}`;
        }
      }
      // Fallback: treat as non-optional
      const objC2 = this.exprToC(obj, lines, depth);
      return `${objC2}.${callee.prop}(${this.argsToC(args, lines, depth)})`;
    }

    // @platform check: calling a function skipped for current platform
    if (callee.kind === 'Ident' && this._platformSkipped?.has(callee.name)) {
      const allowed = this._platformSkipped.get(callee.name).join('", "');
      const target = this._targetName ?? 'desktop';
      throw this.error(`TypeError: '${callee.name}' is only available on platform "${allowed}", but current target is "${target}"`);
    }

    // super(args) in constructor → initialize base struct
    if (callee.kind === 'Ident' && callee.name === 'super') {
      const selfSym = this.lookup('self');
      const cls = selfSym ? this.classes.get(selfSym.ctype) : null;
      const superClass = cls?.superClass;
      if (superClass === 'Error') {
        // super(msg) → self._base.message = msg
        const msgC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
        return `self._base.message = ${msgC}`;
      } else if (superClass) {
        // super(args) → self._base = BaseClass_new(args)
        const argsC = this.argsToC(args, lines, depth);
        return `self._base = ${superClass}_new(${argsC})`;
      }
      return '/* super */';
    }

    // Atomic<T> methods: .load(), .store(), .fetchAdd(), .compareExchange()
    if (callee.kind === 'Member') {
      const objName2 = callee.object?.kind === 'Ident' ? callee.object.name : null;
      const atomicSym = objName2 ? this.lookup(objName2) : null;
      if (atomicSym?._isAtomic) {
        const inner = atomicSym._atomicInner ?? 'int32_t';
        const isPtr = atomicSym._isSharedAtomic;
        const ref = isPtr ? `${objName2}->value` : `${objName2}.value`;

        // Ordering enum map
        const ordMap = {
          'LoadOrdering.Acquire': 'memory_order_acquire',
          'LoadOrdering.SeqCst': 'memory_order_seq_cst',
          'LoadOrdering.Relaxed': 'memory_order_relaxed',
          'RmwOrdering.AcqRel': 'memory_order_acq_rel',
          'RmwOrdering.SeqCst': 'memory_order_seq_cst',
          'RmwOrdering.Relaxed': 'memory_order_relaxed',
        };
        const resolveOrdering = (argNode, op) => {
          if (!argNode) return null;
          const expr = argNode.expr ?? argNode;
          // Member access: LoadOrdering.Acquire / RmwOrdering.AcqRel
          if (expr.kind === 'Member' && expr.object?.kind === 'Ident') {
            const key = `${expr.object.name}.${expr.prop}`;
            if (ordMap[key]) return ordMap[key];
          }
          // String literal: validate
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
          if (!this._cmpxchgCount) this._cmpxchgCount = 0;
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

        const ordMap = {
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
        const resolveOrd = (argNode, op) => {
          if (!argNode) return null;
          const expr = argNode.expr ?? argNode;
          if (expr.kind === 'Member' && expr.object?.kind === 'Ident') {
            const key = `${expr.object.name}.${expr.prop}`;
            if (ordMap[key]) return ordMap[key];
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
          if (!this._cmpxchgCount) this._cmpxchgCount = 0;
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
          // Returns opt_T — emit typedef
          const optType = `opt_${ident}`;
          if (!this._emittedOptStructs) this._emittedOptStructs = new Set();
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

    // Thread.spawn(lambda) — handled in VarDecl; here for stmt-level call
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

    // console.log / console.error / console.warn / console.debug
    if (callee.kind === 'Member' && callee.object.kind === 'Ident' && callee.object.name === 'console') {
      return this.consoleCall(callee.prop, args, lines, depth);
    }

    // performance.now() / performance.mark() / performance.measure()
    if (callee.kind === 'Member' &&
        callee.object.kind === 'Ident' && callee.object.name === 'performance') {
      const prop = callee.prop;
      if (prop === 'now') return 'tsc_performance_now()';
      if (prop === 'mark') {
        const name = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
        return `tsc_performance_mark(${name})`;
      }
      if (prop === 'measure') {
        this._lastSuppressConst = true;
        const name  = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
        const start = args[1] ? this.exprToC(args[1].expr, lines, depth) : 'STR_LIT("")';
        const end   = args[2] ? this.exprToC(args[2].expr, lines, depth) : 'STR_LIT("")';
        return `tsc_performance_measure(${name}, ${start}, ${end})`;
      }
    }

    // std/avr: avr.sleep(mode), avr.watchdogReset(), ADC.read(ch), PWM.setDuty(ch, duty)
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const objName = callee.object.name;
      const prop = callee.prop;
      const objSym = this.lookup(objName);
      if (objSym?._isAvrObj) {
        if (objName === 'avr' && prop === 'sleep') {
          this.includes.add('#include <avr/sleep.h>');
          const modeArg = args[0]?.expr;
          const modeC = modeArg ? this._avrSleepModeToC(modeArg) : 'SLEEP_MODE_IDLE';
          lines.push(`${' '.repeat(this.indent * depth)}set_sleep_mode(${modeC});`);
          return 'sleep_mode()';
        }
        if (objName === 'avr' && prop === 'watchdogReset') {
          this.includes.add('#include <avr/wdt.h>');
          return 'wdt_reset()';
        }
        if (objName === 'ADC' && prop === 'read') {
          const ch = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          return `tsc_adc_read(${ch})`;
        }
        if (objName === 'PWM' && prop === 'setDuty') {
          const ch = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const duty = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          return `tsc_pwm_set_duty(${ch}, ${duty})`;
        }
      }
    }

    // TscRandom method calls: r.nextI32(), r.nextF64(), r.range(lo, hi)
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _rndSym = this.lookup(callee.object.name);
      if (_rndSym?._isRandom) {
        const _rndName = callee.object.name;
        const _rndProp = callee.prop;
        if (_rndProp === 'nextI32') return `tsc_random_next_i32(&${_rndName})`;
        if (_rndProp === 'nextF64') return `tsc_random_next_f64(&${_rndName})`;
        if (_rndProp === 'range') {
          const lo = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const hi = args[1] ? this.exprToC(args[1].expr, lines, depth) : '1';
          return `tsc_random_range_i32(&${_rndName}, ${lo}, ${hi})`;
        }
      }
    }

    // process.env.get(key) / process.env.has(key)
    if (callee.kind === 'Member' &&
        callee.object.kind === 'Member' &&
        callee.object.object.kind === 'Ident' && callee.object.object.name === 'process' &&
        callee.object.prop === 'env') {
      const embeddedTargets = ['avr', 'arm', 'stm32'];
      if (embeddedTargets.includes(this._targetName)) {
        throw this.error(`"process.env" is not available on embedded targets`);
      }
      this.includes.add('#include <stdlib.h>');
      const key = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      if (callee.prop === 'get') {
        this._lastSuppressConst = true;
        return `tsc_env_get(${key})`;
      }
      if (callee.prop === 'has') return `tsc_env_has(${key})`;
    }

    // process.exit(n)
    if (callee.kind === 'Member' &&
        callee.object.kind === 'Ident' && callee.object.name === 'process' &&
        callee.prop === 'exit') {
      const embeddedTargets = ['avr', 'arm', 'stm32'];
      if (embeddedTargets.includes(this._targetName)) {
        throw this.error(`"process.exit" is not available on embedded targets`);
      }
      this.includes.add('#include <stdlib.h>');
      const code = args.length ? this.exprToC(args[0].expr, lines, depth) : '0';
      return `exit(${code})`;
    }

    // Math.xxx
    if (callee.kind === 'Member' &&
        callee.object.kind === 'Ident' && callee.object.name === 'Math') {
      return this.mathCall(callee.prop, args, lines, depth);
    }

    // Date.now() static call
    if (callee.kind === 'Member' &&
        callee.object.kind === 'Ident' && callee.object.name === 'Date' &&
        callee.prop === 'now') {
      return `tsc_date_now()`;
    }

    // Date instance method calls: d.getFullYear(), d.setMonth(2), etc.
    if (callee.kind === 'Member') {
      const dateObjName = callee.object?.kind === 'Ident' ? callee.object.name : null;
      const dateSym = dateObjName ? this.lookup(dateObjName) : null;
      if (dateSym?.ctype === 'Date') {
        const prop = callee.prop;
        const objC = dateObjName;
        // Map getter/setter method names to C function names
        const nameMap = {
          getFullYear: 'tsc_date_get_full_year', getMonth: 'tsc_date_get_month',
          getDate: 'tsc_date_get_date', getDay: 'tsc_date_get_day',
          getHours: 'tsc_date_get_hours', getMinutes: 'tsc_date_get_minutes',
          getSeconds: 'tsc_date_get_seconds', getMilliseconds: 'tsc_date_get_milliseconds',
          getTime: 'tsc_date_get_time', getTimezoneOffset: 'tsc_date_get_timezone_offset',
          valueOf: 'tsc_date_get_time',
          setFullYear: 'tsc_date_set_full_year', setMonth: 'tsc_date_set_month',
          setDate: 'tsc_date_set_date', setHours: 'tsc_date_set_hours',
          setMinutes: 'tsc_date_set_minutes', setSeconds: 'tsc_date_set_seconds',
          setMilliseconds: 'tsc_date_set_milliseconds', setTime: 'tsc_date_set_time',
          toISOString: 'tsc_date_to_iso_string', toString: 'tsc_date_to_string',
          toDateString: 'tsc_date_to_date_string',
        };
        const fn = nameMap[prop];
        if (fn) {
          const isSetter = prop.startsWith('set');
          if (isSetter) {
            const valC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
            return `${fn}(&${objC}, ${valC})`;
          }
          return `${fn}(${objC})`;
        }
      }
    }

    // JSON.stringify / JSON.parse
    if (callee.kind === 'Member' &&
        callee.object.kind === 'Ident' && callee.object.name === 'JSON') {
      return this.jsonCall(callee.prop, node.typeArgs ?? [], args, lines, depth);
    }

    // Reader/Writer vtable dispatch (std/io)
    if (this._stdIoImported && callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _ioSym = this.lookup(callee.object.name);
      const _ioName = callee.object.name;
      const _ioProp = callee.prop;
      if (_ioSym?.ctype === 'Reader' && _ioProp === 'read') {
        const bufArg = args[0]?.expr;
        const bufName = bufArg?.kind === 'Ident' ? bufArg.name : this.exprToC(bufArg, lines, depth);
        this._lastHalRead = 'size_t';
        return `${_ioName}.vtable->read(${_ioName}.self, ${bufName}.data, ${bufName}.length)`;
      }
      if (_ioSym?.ctype === 'Writer' && _ioProp === 'write') {
        const bufArg = args[0]?.expr;
        const bufName = bufArg?.kind === 'Ident' ? bufArg.name : this.exprToC(bufArg, lines, depth);
        return `${_ioName}.vtable->write(${_ioName}.self, ${bufName}.data, ${bufName}.length)`;
      }
    }

    // HAL static method calls: GPIO, I2C, SPI, UART
    if (this._stdHalImported && callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _halClass = callee.object.name;
      const _halProp  = callee.prop;
      if (_halClass === 'GPIO') {
        if (_halProp === 'mode') {
          const pin  = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const mode = args[1] ? this.exprToC(args[1].expr, lines, depth) : 'TSC_PINMODE_INPUT';
          return `tsc_gpio_mode(${pin}, ${mode})`;
        }
        if (_halProp === 'output') return `tsc_gpio_output(${args[0] ? this.exprToC(args[0].expr, lines, depth) : '0'})`;
        if (_halProp === 'input')  return `tsc_gpio_input(${args[0] ? this.exprToC(args[0].expr, lines, depth) : '0'})`;
        if (_halProp === 'write') {
          const pin = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const val = args[1] ? this.exprToC(args[1].expr, lines, depth) : 'false';
          return `tsc_gpio_write(${pin}, ${val})`;
        }
        if (_halProp === 'read') {
          this._lastHalRead = 'bool';
          return `tsc_gpio_read(${args[0] ? this.exprToC(args[0].expr, lines, depth) : '0'})`;
        }
      }
      if (_halClass === 'I2C') {
        if (_halProp === 'begin') return 'tsc_i2c_begin()';
        if (_halProp === 'write') {
          const addr = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const dataN = args[1]?.expr?.kind === 'Ident' ? args[1].expr.name : '_data';
          return `tsc_i2c_write(${addr}, ${dataN}.data, ${dataN}.length)`;
        }
        if (_halProp === 'read') {
          const addr = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const len  = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          this._lastHalRead = 'Array_u8';
          return `tsc_i2c_read(${addr}, ${len})`;
        }
      }
      if (_halClass === 'SPI') {
        if (_halProp === 'begin') return 'tsc_spi_begin()';
        if (_halProp === 'transfer') {
          this._lastHalRead = 'uint8_t';
          return `tsc_spi_transfer(${args[0] ? this.exprToC(args[0].expr, lines, depth) : '0'})`;
        }
      }
      if (_halClass === 'UART') {
        if (_halProp === 'init') {
          const cfgArg = args[0]?.expr;
          let baud = '9600';
          if (cfgArg?.kind === 'ObjLit') {
            const bp = cfgArg.props?.find(p => p.key === 'baud');
            if (bp?.value) baud = this.exprToC(bp.value, lines, depth);
          }
          return `tsc_uart_init(${baud})`;
        }
        if (_halProp === 'available') {
          this._lastHalRead = 'bool';
          return 'tsc_uart_available()';
        }
        if (_halProp === 'write') return `tsc_uart_write(${args[0] ? this.exprToC(args[0].expr, lines, depth) : '0'})`;
        if (_halProp === 'read') {
          this._lastHalRead = 'opt_u8';
          this._ensureOptStruct('opt_u8', 'uint8_t');
          return `tsc_uart_read()`;
        }
      }
    }

    // Blob method calls
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _blobSym = this.lookup(callee.object.name);
      const _blobName = callee.object.name;
      const _blobProp = callee.prop;
      if (_blobSym?._isBlob) {
        if (_blobProp === 'slice') {
          const start = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const end   = args[1] ? this.exprToC(args[1].expr, lines, depth) : `${_blobName}.size`;
          const sizeExpr = (args[0] && args[1] &&
            args[0].expr.kind === 'Literal' && args[1].expr.kind === 'Literal')
            ? String(parseInt(args[1].expr.value) - parseInt(args[0].expr.value))
            : `(${end} - ${start})`;
          return `{.data = ${_blobName}.data + ${start}, .size = ${sizeExpr}}`;
        }
        if (_blobProp === 'arrayBuffer') {
          // Ensure Buffer typedef
          if (!this._emittedBufferTypeDef) {
            this._emittedBufferTypeDef = true;
            this.addTop('typedef struct { uint8_t *data; size_t length; } Buffer;');
            this.addTop('');
          }
          return `{.data = ${_blobName}.data, .length = ${_blobName}.size}`;
        }
      }
      if (_blobSym?._isTscBlob) {
        if (_blobProp === 'text') {
          const n = this._blobTextN = (this._blobTextN ?? 0); this._blobTextN++;
          const tmp = `_text_${n}`;
          const I = ' '.repeat(this.indent * depth);
          lines.push(`${I}String ${tmp} = tsc_blob_text(&${_blobName});`);
          if (!this._postStmtCleanups) this._postStmtCleanups = [];
          this._postStmtCleanups.push(`${I}tsc_string_free(${tmp});`);
          return tmp;
        }
      }
    }

    // URL / URLSearchParams method calls
    if (this._stdUrlImported && callee.kind === 'Member') {
      // u.searchParams.get/set/delete — callee.object is Member (u.searchParams)
      if (callee.object.kind === 'Member' && callee.object.prop === 'searchParams') {
        const urlObj = callee.object.object;
        const urlSym = urlObj.kind === 'Ident' ? this.lookup(urlObj.name) : null;
        if (urlSym?._isURL) {
          const urlName = urlObj.name;
          const _spProp = callee.prop;
          if (_spProp === 'get') {
            const keyC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
            const n = this._urlOptN = (this._urlOptN ?? 0); this._urlOptN++;
            const tmp = `_v_${n}`;
            lines.push(`${' '.repeat(depth * 4)}TscOptString ${tmp} = tsc_search_params_get(&${urlName}.searchParams, ${keyC});`);
            return `${tmp}.has_value ? ${tmp}.value.data : "null"`;
          }
          if (_spProp === 'set') {
            const k = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
            const v = args[1] ? this.exprToC(args[1].expr, lines, depth) : 'STR_LIT("")';
            return `tsc_url_params_set(&${urlName}, ${k}, ${v})`;
          }
          if (_spProp === 'delete') {
            const k = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
            return `tsc_url_params_delete(&${urlName}, ${k})`;
          }
        }
      }
      // p.get(key) — URLSearchParams standalone
      if (callee.object.kind === 'Ident') {
        const _spSym = this.lookup(callee.object.name);
        if (_spSym?._isURLSearchParams) {
          const _spName = callee.object.name;
          const _spProp = callee.prop;
          if (_spProp === 'get') {
            const keyC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
            const n = this._urlOptN = (this._urlOptN ?? 0); this._urlOptN++;
            const tmp = `_v_${n}`;
            lines.push(`${' '.repeat(depth * 4)}TscOptString ${tmp} = tsc_search_params_get(&${_spName}, ${keyC});`);
            return `${tmp}.has_value ? ${tmp}.value.data : "null"`;
          }
        }
      }
    }

    // Signal methods: signal.get(), signal.set(val)
    if (this._stdReactiveImported && callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _sigSym = this.lookup(callee.object.name);
      if (_sigSym?._isSignal) {
        const etIdent = _sigSym._signalElemType;
        const sigRef = this._capturedSignalMap?.get(callee.object.name) ?? `&${callee.object.name}`;
        if (callee.prop === 'get') return `tsc_signal_get_${etIdent}(${sigRef})`;
        if (callee.prop === 'set') {
          if (this._inComputedFn) throw this.error(`TypeError: Side effect (signal.set) inside computed() is not allowed`);
          const val = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          return `tsc_signal_set_${etIdent}(${sigRef}, ${val})`;
        }
      }
    }

    // computed(arrow), effect(arrow), batch(arrow)
    if (this._stdReactiveImported && callee.kind === 'Ident') {
      if (callee.name === 'computed' || callee.name === 'effect' || callee.name === 'batch') {
        const arrow = args[0]?.expr;
        const n = callee.name === 'batch' ? (this._batchCount ?? 0) : (this._reactiveClosureCount ?? 0);
        const prefix = callee.name === 'batch' ? `_batch_${n}` : `_closure_${n}`;
        const fnName = `${prefix}_fn`;

        if (callee.name === 'batch') {
          // batch: emit static fn that accesses already-captured signal refs
          this._batchCount = (this._batchCount ?? 0) + 1;
          const batchLines = [];
          if (arrow?.kind === 'Arrow') {
            // Use persistent capture refs inside batch body
            const _savedMap = this._capturedSignalMap;
            this._capturedSignalMap = new Map(this._persistentCaptureRefs ?? []);
            this.pushScope();
            if (arrow.body.kind === 'Block') this.visitBlock(arrow.body, batchLines, 0);
            else { const c = this.exprToC(arrow.body, batchLines, 0); batchLines.push(`return ${c};`); }
            this.popScope();
            this._capturedSignalMap = _savedMap;
          }
          this.topLevel.push(`static void ${fnName}(void) {`);
          for (const l of batchLines) this.topLevel.push('    ' + l);
          this.topLevel.push('}');
          this.topLevel.push('');
          return `tsc_batch(${fnName})`;
        }

        // computed/effect: collect Signal free vars, emit env struct + static captured + fn
        if (!arrow || arrow.kind !== 'Arrow') return `tsc_effect(NULL)`;
        this._reactiveClosureCount = (this._reactiveClosureCount ?? 0) + 1;

        // Find free Signal vars
        const paramNames = new Set((arrow.params ?? []).map(p => p.name));
        const capturedSignals = new Map();
        const walkFreeVars = (node) => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) { node.forEach(walkFreeVars); return; }
          if (node.kind === 'Call' && node.callee?.kind === 'Member' && node.callee.object?.kind === 'Ident') {
            const varName = node.callee.object.name;
            if (!paramNames.has(varName)) {
              const sym = this.lookup(varName);
              if (sym?._isSignal) capturedSignals.set(varName, sym);
            }
          }
          for (const key of Object.keys(node)) {
            if (key !== 'kind') walkFreeVars(node[key]);
          }
        };
        walkFreeVars(arrow.body);

        // Emit env struct and static captured:
        // if topLevel has global statics already → append there; else use typedefs (stays adjacent to Signal typedef)
        let _envInTopLevel = false;
        if (capturedSignals.size > 0) {
          const envName = `_closure_${n}_env`;
          const fields = [...capturedSignals.entries()].map(([nm, sym]) => `${sym.ctype} *${nm};`).join(' ');
          const hasGlobalsBefore = this.topLevel.some(l => l.trim().length > 0);
          if (hasGlobalsBefore) {
            this.topLevel.push(`typedef struct { ${fields} } ${envName};`);
            this.topLevel.push(`static ${envName} _closure_${n}_captured;`);
            _envInTopLevel = true;
          } else {
            this.typedefs.push(`typedef struct { ${fields} } ${envName};`);
            this.typedefs.push(`static ${envName} _closure_${n}_captured;`);
          }
          // Track captured signal refs for fn body emission
          if (!this._capturedSignalMap) this._capturedSignalMap = new Map();
          for (const nm of capturedSignals.keys()) {
            this._capturedSignalMap.set(nm, `_closure_${n}_captured.${nm}`);
          }
        }

        // Emit fn
        const retType = callee.name === 'effect' ? 'void'
          : (arrow.body.kind === 'Block' ? 'int32_t' : (this.inferArrowReturn(arrow) || 'int32_t'));
        const etIdent = this.cTypeToIdent(retType);
        const sigType = callee.name === 'computed' ? `Signal_${etIdent}` : null;

        if (callee.name === 'computed') this._inComputedFn = true;
        const fnLines = [];
        this.pushScope();
        if (arrow.body.kind === 'Block') this.visitBlock(arrow.body, fnLines, 0);
        else { const c = this.exprToC(arrow.body, fnLines, 0); fnLines.push(`return ${c};`); }
        this.popScope();
        if (callee.name === 'computed') this._inComputedFn = false;

        // Clear captured signal map after fn body (back to main context)
        if (capturedSignals.size > 0) {
          for (const nm of capturedSignals.keys()) this._capturedSignalMap.delete(nm);
        }

        // No leading blank when env is adjacent in topLevel; add blank otherwise (env in typedefs)
        if (!_envInTopLevel) this.topLevel.push('');
        this.topLevel.push(`static ${retType} ${fnName}(void) {`);
        for (const l of fnLines) this.topLevel.push('    ' + l);
        this.topLevel.push('}');
        this.topLevel.push('');

        // Emit env init in current scope (main/function body)
        if (capturedSignals.size > 0) {
          const envInit = `(_closure_${n}_env){ ${[...capturedSignals.keys()].map(nm => `.${nm} = &${nm}`).join(', ')} }`;
          lines.push(' '.repeat(this.indent * depth) + `_closure_${n}_captured = ${envInit};`);
          // Track persistent captures for batch fns (separate from fn-body map)
          if (!this._persistentCaptureRefs) this._persistentCaptureRefs = new Map();
          for (const nm of capturedSignals.keys()) {
            this._persistentCaptureRefs.set(nm, `_closure_${n}_captured.${nm}`);
          }
        }

        if (callee.name === 'computed') {
          // Signal the VarDecl that the result type is Signal_T (not raw T)
          this._lastComputedSigType = sigType;
          this._lastComputedElemType = etIdent;
          return `tsc_computed_${etIdent}(${fnName})`;
        }
        return `tsc_effect(${fnName})`;
      }
    }

    // WebSocket methods: ws.send(), ws.close(), ws.onMessage(), ws.onClose(), ws.sendBytes()
    if (this._stdWsImported && callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _wsSym = this.lookup(callee.object.name);
      if (_wsSym?._isWebSocket || _wsSym?.ctype === 'TscWebSocket' || _wsSym?.ctype === 'TscWebSocket *') {
        const _wsIsPtr = _wsSym?.ctype?.endsWith('*');
        const _wsExprC = this.exprToC(callee.object, lines, depth);
        const wsRef = _wsIsPtr ? _wsExprC : `&${_wsExprC}`;
        const _wsProp = callee.prop;
        if (_wsProp === 'send') {
          const msgC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
          return `tsc_ws_send(${wsRef}, ${msgC})`;
        }
        if (_wsProp === 'close') {
          return `tsc_ws_close(${wsRef})`;
        }
        if (_wsProp === 'sendBytes') {
          const dataExprC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '(_empty_arr)';
          return `tsc_ws_send_bytes(${wsRef}, ${dataExprC}.data, ${dataExprC}.length)`;
        }
        const _wsHoistCb = (paramTypes) => {
          const cbArg = args[0]?.expr;
          if (cbArg?.kind === 'Arrow') {
            this._lambdaParamHint = paramTypes ?? (cbArg.params ?? []).map(p => p.typeAnn ? this.resolveType(p.typeAnn) : 'String');
            const cbName = this.hoistArrow(cbArg, 'void');
            this._lambdaParamHint = null;
            return cbName;
          }
          return cbArg ? this.exprToC(cbArg, lines, depth) : 'NULL';
        };
        if (_wsProp === 'onMessage') return `tsc_ws_on_message(${wsRef}, ${_wsHoistCb()})`;
        if (_wsProp === 'onClose')   return `tsc_ws_on_close(${wsRef}, ${_wsHoistCb([])})`;
      }
      // WebSocketServer methods: server.onConnect(cb), server.listen(port)
      if (_wsSym?._isWsServer || _wsSym?.ctype === 'TscWebSocketServer') {
        const svrRef = `&${callee.object.name}`;
        const _svrProp = callee.prop;
        if (_svrProp === 'listen') {
          const portC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          return `tsc_ws_server_listen(${svrRef}, ${portC})`;
        }
        if (_svrProp === 'onConnect') {
          const cbArg = args[0]?.expr;
          let cbName;
          if (cbArg?.kind === 'Arrow') {
            const paramNames = (cbArg.params ?? []).map((p, i) => p.name ?? `_p${i}`);
            const paramTypes = ['TscWebSocket *'];
            const paramStrs = paramTypes.map((t, i) => `${t}${paramNames[i] ?? `_p${i}`}`);
            const handlerLines = [];
            this.pushScope();
            for (let i = 0; i < Math.min(paramNames.length, paramTypes.length); i++) {
              this.define(paramNames[i], { ctype: paramTypes[i], varKind: 'const', _isWebSocket: true });
            }
            if (cbArg.body.kind === 'Block') this.visitBlock(cbArg.body, handlerLines, 0);
            else { const c = this.exprToC(cbArg.body, handlerLines, 0); handlerLines.push(`return ${c};`); }
            this.popScope();
            const n = this._handlerCount ?? 0;
            this._handlerCount = n + 1;
            cbName = `_lambda_${n}_void`;
            this.topLevel.push(`static void ${cbName}(${paramStrs.join(', ')}) {`);
            for (const l of handlerLines) this.topLevel.push('    ' + l);
            this.topLevel.push('}');
            this.topLevel.push('');
          } else {
            cbName = cbArg ? this.exprToC(cbArg, lines, depth) : 'NULL';
          }
          return `tsc_ws_server_on_connect(${svrRef}, ${cbName})`;
        }
      }
    }

    // std/net: net.listen(port, handler) / net.connect handled via async
    if (this._stdNetImported && callee.kind === 'Member' &&
        callee.object.kind === 'Ident' && callee.object.name === 'net') {
      const _netProp = callee.prop;
      if (_netProp === 'listen') {
        const portC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
        const cbArg = args[1]?.expr;
        const n = this._handlerCount ?? 0;
        this._handlerCount = n + 1;
        const handlerName = `_handler_${n}`;
        if (cbArg?.kind === 'Arrow') {
          const paramTypes = ['TscSocket *'];
          const paramNames = (cbArg.params ?? []).map((p, i) => p.name ?? `_p${i}`);
          const paramStrs = paramTypes.map((t, i) => `${t}${paramNames[i]}`);
          const handlerLines = [];
          this.pushScope();
          for (let i = 0; i < paramNames.length; i++) {
            this.define(paramNames[i], { ctype: paramTypes[i], varKind: 'const' });
          }
          if (cbArg.body.kind === 'Block') this.visitBlock(cbArg.body, handlerLines, 0);
          else { const c = this.exprToC(cbArg.body, handlerLines, 0); handlerLines.push(`return ${c};`); }
          this.popScope();
          this.topLevel.push(`static void ${handlerName}(${paramStrs.join(', ')}) {`);
          for (const l of handlerLines) this.topLevel.push('    ' + l);
          this.topLevel.push('}');
          this.topLevel.push('');
        }
        return `tsc_net_listen(${portC}, ${handlerName})`;
      }
    }

    // std/net: HttpServer methods (server.get, server.post, server.listen)
    if (this._stdNetImported && callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _serverSym = this.lookup(callee.object.name);
      if (_serverSym?._isHttpServer) {
        const svrRef = `&${callee.object.name}`;
        const _svrProp = callee.prop;
        if (_svrProp === 'listen') return `tsc_http_server_listen(${svrRef})`;
        if (_svrProp === 'get' || _svrProp === 'post') {
          const pathC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("/")';
          const cbArg = args[1]?.expr;
          const n = this._handlerCount ?? 0;
          this._handlerCount = n + 1;
          const handlerName = `_handler_${n}`;
          if (cbArg?.kind === 'Arrow') {
            const paramNames = (cbArg.params ?? []).map((p, i) => p.name ?? `_p${i}`);
            const paramTypes = ['TscRequest *', 'TscResponse *'];
            const paramStrs = paramTypes.map((t, i) => `${t}${paramNames[i] ?? `_p${i}`}`);
            const handlerLines = [];
            this.pushScope();
            for (let i = 0; i < Math.min(paramNames.length, paramTypes.length); i++) {
              this.define(paramNames[i], { ctype: paramTypes[i], varKind: 'const', _isNetParam: true });
            }
            if (cbArg.body.kind === 'Block') this.visitBlock(cbArg.body, handlerLines, 0);
            else { const c = this.exprToC(cbArg.body, handlerLines, 0); handlerLines.push(`return ${c};`); }
            this.popScope();
            this.topLevel.push(`static void ${handlerName}(${paramStrs.join(', ')}) {`);
            for (const l of handlerLines) this.topLevel.push('    ' + l);
            this.topLevel.push('}');
            this.topLevel.push('');
          }
          return `tsc_http_server_${_svrProp}(${svrRef}, ${pathC}, ${handlerName})`;
        }
      }
      // TscResponse methods: res.text, res.json
      if (_serverSym?.ctype === 'TscResponse *') {
        const resC = callee.object.name;
        if (callee.prop === 'text') {
          const textC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
          return `tsc_response_text(${resC}, ${textC})`;
        }
        if (callee.prop === 'json') {
          const jsonC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
          return `tsc_response_json(${resC}, ${jsonC})`;
        }
      }
      // TscSocket methods: sock.close()
      if (_serverSym?.ctype === 'TscSocket *' || _serverSym?.ctype === 'TscSocket') {
        if (callee.prop === 'close') {
          const sockC = this.exprToC(callee.object, lines, depth);
          const sockRef = _serverSym.ctype.endsWith('*') ? sockC : `&${sockC}`;
          return `tsc_socket_close(${sockRef})`;
        }
      }
    }

    // fs namespace: fs.watch(), fs.readFileSync(), fs.writeFileSync(), etc.
    if (this._stdFsImported && callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _fsSym = this.lookup(callee.object.name);
      if (_fsSym?._isFsNamespace) {
        const _fsProp = callee.prop;
        const _a0 = () => args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
        const _a1 = () => args[1] ? this.exprToC(args[1].expr, lines, depth) : 'STR_LIT("")';
        if (_fsProp === 'watch') {
          const pathC = _a0();
          const cbArg = args[1]?.expr;
          let cbName;
          if (cbArg?.kind === 'Arrow') {
            this._lambdaParamHint = (cbArg.params ?? []).map(p => p.typeAnn ? this.resolveType(p.typeAnn) : 'String');
            cbName = this.hoistArrow(cbArg, 'void');
            this._lambdaParamHint = null;
          } else {
            cbName = cbArg ? this.exprToC(cbArg, lines, depth) : 'NULL';
          }
          return `tsc_fs_watch(${pathC}, ${cbName})`;
        }
        if (_fsProp === 'readFileSync')      return `tsc_fs_read_sync(${_a0()})`;
        if (_fsProp === 'readFileBytesSync') return `tsc_fs_read_bytes_sync(${_a0()})`;
        if (_fsProp === 'writeFileSync')     return `tsc_fs_write_sync(${_a0()}, ${_a1()})`;
        if (_fsProp === 'appendFileSync')    return `tsc_fs_append_sync(${_a0()}, ${_a1()})`;
        if (_fsProp === 'existsSync')        return `tsc_fs_exists_sync(${_a0()})`;
        if (_fsProp === 'mkdirSync')         return `tsc_fs_mkdir_sync(${_a0()})`;
        if (_fsProp === 'readDirSync')        return `tsc_fs_readdir_sync(${_a0()})`;
        if (_fsProp === 'removeSync')        return `tsc_fs_remove_sync(${_a0()})`;
        if (_fsProp === 'renameSync')        return `tsc_fs_rename_sync(${_a0()}, ${_a1()})`;
        if (_fsProp === 'statSync')          return `tsc_fs_stat_sync(${_a0()})`;
      }
    }

    // Temporal static methods: PlainDate.from(), Instant.now(), etc.
    if (this._stdTemporalImported && callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _tClass = callee.object.name;
      const _tProp  = callee.prop;
      const _temporalSuppressConst = () => { this._lastSuppressConst = true; };
      if (_tClass === 'PlainDate' && _tProp === 'from') {
        const y = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
        const m = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
        const d = args[2] ? this.exprToC(args[2].expr, lines, depth) : '0';
        _temporalSuppressConst();
        return `tsc_plain_date_from(${y}, ${m}, ${d})`;
      }
      if (_tClass === 'PlainTime' && _tProp === 'from') {
        const h = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
        const m = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
        const s = args[2] ? this.exprToC(args[2].expr, lines, depth) : '0';
        _temporalSuppressConst();
        return `tsc_plain_time_from(${h}, ${m}, ${s})`;
      }
      if (_tClass === 'PlainDateTime' && _tProp === 'from') {
        const date = args[0] ? this.exprToC(args[0].expr, lines, depth) : '(TscPlainDate){0}';
        const time = args[1] ? this.exprToC(args[1].expr, lines, depth) : '(TscPlainTime){0}';
        _temporalSuppressConst();
        return `tsc_plain_datetime_from(${date}, ${time})`;
      }
      if (_tClass === 'Instant' && _tProp === 'now') { _temporalSuppressConst(); return `tsc_instant_now()`; }
      if (_tClass === 'ZonedDateTime' && _tProp === 'now') {
        const tz = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("UTC")';
        _temporalSuppressConst();
        return `tsc_zoned_datetime_now(${tz})`;
      }
      if (_tClass === 'Now') {
        if (_tProp === 'instant') { _temporalSuppressConst(); return `tsc_instant_now()`; }
        if (_tProp === 'plainDate') {
          const tz = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("UTC")';
          _temporalSuppressConst();
          return `tsc_now_plain_date(${tz})`;
        }
      }
      if (_tClass === 'Duration' && _tProp === 'from') {
        const objArg = args[0]?.expr;
        if (objArg?.kind === 'ObjLit') {
          const props = {};
          for (const p of (objArg.props ?? [])) {
            props[p.key] = p.value ? this.exprToC(p.value, lines, depth) : '0';
          }
          _temporalSuppressConst();
          if ('days' in props && !('hours' in props) && !('minutes' in props)) {
            return `tsc_duration_from_days(${props.days ?? '0'})`;
          }
          const h = props.hours ?? '0';
          const m = props.minutes ?? '0';
          const s = props.seconds ?? '0';
          return `tsc_duration_from_hms(${h}, ${m}, ${s})`;
        }
      }
    }

    // Temporal instance methods: d.add(), d.until(), etc.
    if (this._stdTemporalImported && callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _tSym = this.lookup(callee.object.name);
      const _tCtype = _tSym?.ctype ?? '';
      if (_tCtype === 'TscPlainDate') {
        const _tName = callee.object.name;
        const _tProp = callee.prop;
        if (_tProp === 'add') {
          this._lastSuppressConst = true;
          const durC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '(TscDuration){0}';
          return `tsc_plain_date_add(${_tName}, ${durC})`;
        }
        if (_tProp === 'until') {
          this._lastSuppressConst = true;
          const d2C = args[0] ? this.exprToC(args[0].expr, lines, depth) : '(TscPlainDate){0}';
          return `tsc_plain_date_until(${_tName}, ${d2C})`;
        }
      }
    }

    // Buffer method calls: buf.fill(), buf.slice()
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _bufSym = this.lookup(callee.object.name);
      if (_bufSym?._isBuffer || _bufSym?.ctype === 'Buffer') {
        const _bufName = callee.object.name;
        const _bufProp = callee.prop;
        if (_bufProp === 'fill') {
          const val = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          return `memset(${_bufName}.data, ${val}, ${_bufName}.length)`;
        }
        if (_bufProp === 'slice') {
          const start = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const end = args[1] ? this.exprToC(args[1].expr, lines, depth) : `${_bufName}.length`;
          const lenExpr = (args[0]?.expr?.kind === 'Literal' && args[1]?.expr?.kind === 'Literal')
            ? String(parseFloat(args[1].expr.value) - parseFloat(args[0].expr.value))
            : `(${end}) - (${start})`;
          return `{.data = ${_bufName}.data + ${start}, .length = ${lenExpr}}`;
        }
      }
    }

    // DataView method calls: dv.setU8(), dv.getU8(), dv.setU16LE(), dv.getU16LE(), etc.
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _dvSym = this.lookup(callee.object.name);
      if (_dvSym?._isDataView || _dvSym?.ctype === 'DataView') {
        const _dvName = callee.object.name;
        const _dvProp = callee.prop;
        const _dvIdx = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
        if (_dvProp === 'setU8') {
          const val = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          return `${_dvName}.data[${_dvIdx}] = ${val}`;
        }
        if (_dvProp === 'getU8') return `${_dvName}.data[${_dvIdx}]`;
        const I = ' '.repeat(this.indent * depth);
        // Static bounds check for get operations
        const _dvOpSizes = { getU8:1, getU16LE:2, getU32LE:4, getF64LE:8, setU8:1, setU16LE:2, setU32LE:4, setF64LE:8 };
        if (_dvOpSizes[_dvProp] && _dvSym._dvCap != null) {
          const opSize = _dvOpSizes[_dvProp];
          const offsetNode = args[0]?.expr;
          const offsetVal = (offsetNode?.kind === 'Literal' && offsetNode?.litType === 'number') ? parseInt(offsetNode.value) : null;
          if (offsetVal != null && offsetVal + opSize > _dvSym._dvCap) {
            const suffix = _dvProp.startsWith('set') ? `requires ${opSize} bytes, but buffer length is ${_dvSym._dvCap}` : `requires ${opSize} bytes, but buffer length is ${_dvSym._dvCap}`;
            throw this.error(`TypeError: DataView.${_dvProp} at offset ${offsetVal} requires ${opSize} bytes, but buffer length is ${_dvSym._dvCap}`);
          }
        }
        if (_dvProp === 'setU16LE') {
          const val = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          const n = this._dvW16n = (this._dvW16n ?? 0); this._dvW16n++;
          const tmp = `_w16_${n}`;
          lines.push(`${I}uint16_t ${tmp} = ${val};`);
          return `memcpy(${_dvName}.data + ${_dvIdx}, &${tmp}, 2)`;
        }
        if (_dvProp === 'getU16LE') {
          const tmp = `_v16`;
          lines.push(`${I}uint16_t ${tmp}; memcpy(&${tmp}, ${_dvName}.data + ${_dvIdx}, 2);`);
          return `(uint16_t)${tmp}`;
        }
        if (_dvProp === 'setU32LE') {
          const val = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          const n = this._dvW32n = (this._dvW32n ?? 0); this._dvW32n++;
          const tmp = `_w32_${n}`;
          lines.push(`${I}uint32_t ${tmp} = ${val};`);
          return `memcpy(${_dvName}.data + ${_dvIdx}, &${tmp}, 4)`;
        }
        if (_dvProp === 'getU32LE') {
          const n = this._dvR32n = (this._dvR32n ?? 0); this._dvR32n++;
          const tmp = `_r32_${n}`;
          lines.push(`${I}uint32_t ${tmp}; memcpy(&${tmp}, ${_dvName}.data + ${_dvIdx}, 4);`);
          return tmp;
        }
        if (_dvProp === 'setF64LE') {
          const val = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          const n = this._dvWF64n = (this._dvWF64n ?? 0); this._dvWF64n++;
          const tmp = `_wf64_${n}`;
          lines.push(`${I}double ${tmp} = ${val};`);
          return `memcpy(${_dvName}.data + ${_dvIdx}, &${tmp}, 8)`;
        }
        if (_dvProp === 'getF64LE') {
          const n = this._dvRF64n = (this._dvRF64n ?? 0); this._dvRF64n++;
          const tmp = `_rf64_${n}`;
          lines.push(`${I}double ${tmp}; memcpy(&${tmp}, ${_dvName}.data + ${_dvIdx}, 8);`);
          return tmp;
        }
      }
    }

    // HashMap method calls: m.set(), m.get(), m.has(), m.delete()
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _hmSym = this.lookup(callee.object.name);
      if (_hmSym?._isHashMap) {
        const _hmName = callee.object.name;
        const _hmProp = callee.prop;
        const _hmSfx = _hmSym._hmSuffix;
        const _hmArg0 = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
        if (_hmProp === 'has') return `tsc_hashmap_has_${_hmSfx}(&${_hmName}, ${_hmArg0})`;
        if (_hmProp === 'set') {
          // Compile-time capacity overflow check
          if (_hmSym._hmCap > 0) {
            _hmSym._hmSetCount = (_hmSym._hmSetCount ?? 0) + 1;
            if (_hmSym._hmSetCount > _hmSym._hmCap) {
              throw this.error(
                `RuntimeError: HashMap capacity exceeded: max ${_hmSym._hmCap}, attempted to insert ${_hmSym._hmSetCount}th entry`
              );
            }
          }
          const _hmArg1 = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          return `tsc_hashmap_set_${_hmSfx}(&${_hmName}, ${_hmArg0}, ${_hmArg1})`;
        }
        if (_hmProp === 'get') {
          const vIdent = this.cTypeToIdent(_hmSym._hmValType ?? 'int32_t');
          const optName = `opt_${vIdent}`;
          this._ensureOptStruct(optName, _hmSym._hmValType ?? 'int32_t');
          this._lastSuppressConst = true;
          return `tsc_hashmap_get_${_hmSfx}(&${_hmName}, ${_hmArg0})`;
        }
        if (_hmProp === 'delete') return `tsc_hashmap_delete_${_hmSfx}(&${_hmName}, ${_hmArg0})`;
      }
    }

    // Set method calls: s.add(), s.has(), s.delete(), s.clear()
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _setSym = this.lookup(callee.object.name);
      if (_setSym?._isSet) {
        const _sName = callee.object.name;
        const _sProp = callee.prop;
        const _sSfx  = _setSym._setSuffix;
        const _sArg0 = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
        if (_sProp === 'add')    return `tsc_set_add_${_sSfx}(&${_sName}, ${_sArg0})`;
        if (_sProp === 'has')    return `tsc_set_has_${_sSfx}(&${_sName}, ${_sArg0})`;
        if (_sProp === 'delete') return `tsc_set_delete_${_sSfx}(&${_sName}, ${_sArg0})`;
        if (_sProp === 'clear')  return `tsc_set_clear_${_sSfx}(&${_sName})`;
      }
    }

    // Tasks method calls: tasks.add(), tasks.run(), tasks.stop()
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _tasksSym = this.lookup(callee.object.name);
      if (_tasksSym?._isTasks) {
        const _tasksName = callee.object.name;
        const _tasksProp = callee.prop;
        if (_tasksProp === 'run') return `tsc_tasks_run(&${_tasksName})`;
        if (_tasksProp === 'stop') {
          const _label = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
          return `tsc_tasks_stop(&${_tasksName}, ${_label})`;
        }
        if (_tasksProp === 'add') {
          const _label = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
          const _fnName = args[1]?.expr?.kind === 'Ident' ? args[1].expr.name : null;
          const _genInfo = _fnName ? this._generatorFuncs?.get(_fnName) : null;
          if (_genInfo) {
            const { stateType, nextFn } = _genInfo;
            const pollFn = `${_fnName}_poll`;
            if (!this._emittedTasksPolls) this._emittedTasksPolls = new Set();
            if (!this._emittedTasksPolls.has(pollFn)) {
              this._emittedTasksPolls.add(pollFn);
              this.topLevel.push('');
              this.topLevel.push(`static void ${pollFn}(void *state) {`);
              this.topLevel.push(`    ${nextFn}((${stateType} *)state);`);
              this.topLevel.push(`}`);
            }
            if (!this._tasksStateCount) this._tasksStateCount = 0;
            const stateVar = `_${_fnName}_state_${this._tasksStateCount++}`;
            const I = ' '.repeat(this.indent * depth);
            lines.push(`${I}static ${stateType} ${stateVar} = {0};`);
            return `tsc_tasks_add(&${_tasksName}, ${_label}, ${pollFn}, &${stateVar})`;
          }
        }
      }
    }

    // TscRegex method calls: r.test(), r.match(), r.replace(), r.replaceAll()
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _rxSym = this.lookup(callee.object.name);
      if (_rxSym?._isRegex) {
        const _rxName = callee.object.name;
        const _rxProp = callee.prop;
        const _rxArg0 = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
        if (_rxProp === 'test') return `tsc_regex_test(&${_rxName}, ${_rxArg0})`;
        if (_rxProp === 'match') {
          this._lastSuppressConst = true;
          this._ensureArrayStruct('Array_string', 'String');
          this._ensureOptStruct('opt_Array_string', 'Array_string');
          return `tsc_regex_match(&${_rxName}, ${_rxArg0})`;
        }
        if (_rxProp === 'replace') {
          this._lastSuppressConst = true;
          const _rxArg1 = args[1] ? this.exprToC(args[1].expr, lines, depth) : 'STR_LIT("")';
          return `tsc_regex_replace(&${_rxName}, ${_rxArg0}, ${_rxArg1})`;
        }
        if (_rxProp === 'replaceAll') {
          this._lastSuppressConst = true;
          const _rxArg1 = args[1] ? this.exprToC(args[1].expr, lines, depth) : 'STR_LIT("")';
          return `tsc_regex_replace_all(&${_rxName}, ${_rxArg0}, ${_rxArg1})`;
        }
      }
    }

    // Enum.method() calls: Enum.values(), Enum.fromValue(), EnumMember.toString()
    if (callee.kind === 'Member') {
      // variable.toString() where variable is a string-literal-union type
      if (callee.prop === 'toString' && callee.object.kind === 'Ident') {
        const objSym = this.lookup(callee.object.name);
        const objEnumDef = objSym ? this.classes.get(objSym.ctype) : null;
        if (objEnumDef?.isStringLiteralUnion) {
          const objC = this.exprToC(callee.object, lines, depth);
          return `${objSym.ctype}_values[(int)${objC}]`;
        }
      }
      // EnumMember.toString() — callee.object is Member (Dir.North), prop is 'toString'
      if (callee.prop === 'toString' && callee.object.kind === 'Member') {
        const enumName = callee.object.object.kind === 'Ident' ? callee.object.object.name : null;
        const enumDef = enumName ? this.classes.get(enumName) : null;
        if (enumDef?.isEnum) {
          if (enumDef.isConst) throw this.error(`"toString()" is not available on const enum`);
          const memberC = `${enumName}_${callee.object.prop}`;
          if (enumDef.isStringEnum) return `${enumName}_strings[(int)${memberC}]`;
          return `${enumName}_names[(int)${memberC}]`;
        }
      }
      // Enum.values()
      if (callee.prop === 'values' && callee.object.kind === 'Ident') {
        const enumDef = this.classes.get(callee.object.name);
        if (enumDef?.isEnum) {
          if (enumDef.isConst) throw this.error(`"values()" is not available on const enum`);
          return `${callee.object.name}_values`;
        }
      }
      // Enum.fromValue(n) — needs helper function emitted at top
      if (callee.prop === 'fromValue' && callee.object.kind === 'Ident') {
        const enumName = callee.object.name;
        const enumDef = this.classes.get(enumName);
        if (enumDef?.isEnum) {
          if (enumDef.isConst) throw this.error(`"fromValue()" is not available on const enum`);
          const n = enumDef.members.length;
          const helperName = `${enumName}_fromValue`;
          // Emit helper if not already emitted
          if (!this._emittedHelpers) this._emittedHelpers = new Set();
          if (!this._emittedHelpers.has(helperName)) {
            this._emittedHelpers.add(helperName);
            this.addTop(`typedef struct { bool has_value; ${enumName} value; } opt_${enumName};`);
            this.addTop(`static inline opt_${enumName} ${helperName}(int32_t v) {`);
            this.addTop(`    for (int i = 0; i < ${n}; i++) { if ((int32_t)${enumName}_values[i] == v) return (opt_${enumName}){true, ${enumName}_values[i]}; }`);
            this.addTop(`    return (opt_${enumName}){false, 0};`);
            this.addTop(`}`);
            this.addTop(``);
          }
          const argC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          return `${helperName}(${argC})`;
        }
      }
    }

    // setTimeout / setInterval / clearTimeout
    const _embeddedTargets = ['avr', 'arm', 'stm32'];
    if (callee.kind === 'Ident' && (callee.name === 'setTimeout' || callee.name === 'setInterval')) {
      if (_embeddedTargets.includes(this._targetName)) {
        throw this.error(`"${callee.name}" is not available on embedded targets`, node);
      }
    }
    if (callee.kind === 'Ident' && callee.name === 'setTimeout') {
      const fn = this.exprToC(args[0].expr, lines, depth);
      const ms = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
      return `tsc_set_timeout(${fn}, ${ms})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'setInterval') {
      const lambdaArg = args[0]?.expr;
      if (lambdaArg?.kind === 'Arrow') {
        const freeVars = this._collectFreeVars(lambdaArg);
        if (freeVars.length > 0) {
          const closureIdx = this.lambdaCount++;
          const prefix = `_closure_${closureIdx}`;
          const envType = `${prefix}_env`;
          const fieldDecls = freeVars.map(v => `${v.ctype} ${v.name};`);
          this._topBlank();
          this.topLevel.push(`typedef struct { ${fieldDecls.join(' ')} } ${envType};`);
          this.topLevel.push(`static ${envType} ${prefix}_captured;`);
          const closureLines = [];
          this.pushScope();
          for (const v of freeVars) {
            this.define(v.name, { ctype: v.ctype, _cAlias: `${prefix}_captured.${v.name}`, varKind: 'let' });
          }
          if (lambdaArg.body?.kind === 'Block') this.visitBlock(lambdaArg.body, closureLines, 0);
          this.popScope();
          this._topBlank();
          this.topLevel.push(`static void ${prefix}_fn(void) {`);
          for (const l of closureLines) this.topLevel.push('    ' + l);
          this.topLevel.push('}');
          if (lines !== undefined) {
            const I = ' '.repeat(this.indent * depth);
            const inits = freeVars.map(v => `.${v.name} = ${v.name}`).join(', ');
            lines.push(`${I}${prefix}_captured = (${envType}){ ${inits} };`);
          }
          const ms = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          return `tsc_set_interval(${prefix}_fn, ${ms})`;
        }
      }
      const fn = this.exprToC(args[0].expr, lines, depth);
      const ms = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
      return `tsc_set_interval(${fn}, ${ms})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'clearTimeout') {
      const id = this.exprToC(args[0].expr, lines, depth);
      return `tsc_clear_timeout(${id})`;
    }

    // parseFloat / tryParseFloat / parseInt / tryParseInt / Number
    // Helper: set _lastOptIsNull=true when arg is a string literal that can't parse as number.
    // Supports 0x/0b/0o prefixes (runtime handles them; JS parseFloat/parseInt don't, so we check manually).
    const _setOptIsNullHint = (argNode) => {
      if (argNode?.kind === 'Literal' && argNode.litType === 'string') {
        const s = argNode.value;
        if (/^0x[0-9a-fA-F]+$/i.test(s) || /^0b[01]+$/i.test(s) || /^0o[0-7]+$/i.test(s)) {
          this._lastOptIsNull = false; // prefixed integer literals always parse successfully
        } else {
          this._lastOptIsNull = isNaN(parseFloat(s));
        }
      }
    };
    // std/string: atob, btoa, decodeUtf8, encodeUtf8
    if (callee.kind === 'Ident' && callee.name === 'atob') {
      this.includes.add('#include "std/base64.h"');
      this._lastSuppressConst = true;
      const arg = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      return `tsc_atob(${arg})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'btoa') {
      this.includes.add('#include "std/base64.h"');
      this._lastSuppressConst = true;
      const arg = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      return `tsc_btoa(${arg})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'decodeUtf8') {
      this._lastSuppressConst = true;
      // Static UTF-8 validation for literal byte arrays
      const argExpr = args[0]?.expr;
      const _decLitArr = argExpr?.kind === 'ArrayLit' ? argExpr
        : (argExpr?.kind === 'Ident' ? this.lookup(argExpr.name)?.initNode : null);
      if (_decLitArr?.kind === 'ArrayLit' && _decLitArr.elems?.every(e => e?.expr?.kind === 'Literal')) {
        const bytes = _decLitArr.elems.map(e => parseInt(e.expr.value));
        let i = 0;
        while (i < bytes.length) {
          const b = bytes[i];
          let seqLen;
          if (b < 0x80) { seqLen = 1; }
          else if (b < 0xC2) { seqLen = -1; }
          else if (b < 0xE0) { seqLen = 2; }
          else if (b < 0xF0) { seqLen = 3; }
          else if (b < 0xF5) { seqLen = 4; }
          else { seqLen = -1; }
          if (seqLen < 0) throw this.error(`RuntimeError: decodeUtf8: invalid UTF-8 byte sequence at offset ${i}`);
          for (let j = 1; j < seqLen; j++) {
            if (i + j >= bytes.length || (bytes[i + j] & 0xC0) !== 0x80)
              throw this.error(`RuntimeError: decodeUtf8: invalid UTF-8 byte sequence at offset ${i + j}`);
          }
          i += seqLen;
        }
      }
      const arg = args[0] ? this.exprToC(args[0].expr, lines, depth) : '(Array_u8){0}';
      return `tsc_decode_utf8(${arg})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'encodeUtf8') {
      this._ensureArrayStruct('Array_u8', 'uint8_t');
      this._lastSuppressConst = true;
      const arg = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      return `tsc_encode_utf8(${arg})`;
    }

    // drop(x) → T_drop(x) for pool types
    if (callee.kind === 'Ident' && callee.name === 'drop') {
      const argNode = args[0]?.expr;
      if (argNode) {
        const argSym = argNode.kind === 'Ident' ? this.lookup(argNode.name) : null;
        const argType = argSym?.ctype ?? this.inferType(argNode);
        const _pcn = argType?.startsWith('opt_ref_') ? argType.slice(8) : null;
        if (_pcn && this.classes.get(_pcn)?._isPool) {
          this._ensurePoolDrop(_pcn);
          return `${this.classes.get(_pcn)._poolDropFn}(${this.exprToC(argNode, lines, depth)})`;
        }
      }
    }
    if (callee.kind === 'Ident' && callee.name === 'parseFloat') {
      // With explicit f64 type annotation, use panic version returning double
      if (this._expectedType === 'double') {
        return `tsc_parse_f64(${this.exprToC(args[0].expr, lines, depth)})`;
      }
      this._ensureOptStruct('opt_f64', 'double');
      _setOptIsNullHint(args[0]?.expr);
      return `tsc_parse_float(${this.exprToC(args[0].expr, lines, depth)})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'tryParseFloat') {
      this._ensureOptStruct('opt_f64', 'double');
      _setOptIsNullHint(args[0]?.expr);
      return `tsc_try_parse_f64(${this.exprToC(args[0].expr, lines, depth)})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'parseInt') {
      this._ensureOptStruct('opt_i32', 'int32_t');
      _setOptIsNullHint(args[0]?.expr);
      return `tsc_parse_int(${this.exprToC(args[0].expr, lines, depth)})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'tryParseInt') {
      this._ensureOptStruct('opt_i32', 'int32_t');
      _setOptIsNullHint(args[0]?.expr);
      return `tsc_try_parse_i32(${this.exprToC(args[0].expr, lines, depth)})`;
    }
    // Number(s) → alias for parseFloat(s) → f64 | null
    if (callee.kind === 'Ident' && callee.name === 'Number' && args.length === 1) {
      this._ensureOptStruct('opt_f64', 'double');
      _setOptIsNullHint(args[0]?.expr);
      return `tsc_try_parse_f64(${this.exprToC(args[0].expr, lines, depth)})`;
    }

    // structuredClone(x) → C struct copy for primitives/structs, array clone for arrays
    if (callee.kind === 'Ident' && callee.name === 'structuredClone' && args.length === 1) {
      const argNode = args[0].expr;
      const argType = this.inferType(argNode);
      const argC = this.exprToC(argNode, lines, depth);
      if (argType?.startsWith('Array_')) {
        const et = argType.slice(6); // remove 'Array_' prefix
        const etIdent = this.cTypeToIdent(et);
        return `tsc_array_slice_${etIdent}(${argC}, 0, (int32_t)${argC}.length)`;
      }
      // For structs/primitives: C assignment = copy by value
      return `(${argType})(${argC})`;
    }

    // String(n) constructor → tsc_T_to_string(n)
    if (callee.kind === 'Ident' && callee.name === 'String' && args.length === 1) {
      const argNode = args[0].expr;
      const argType = this.inferType(argNode);
      const argIdent = this.cTypeToIdent(argType);
      const argC = this.exprToC(argNode, lines, depth);
      return `tsc_${argIdent}_to_string(${argC})`;
    }

    // i32.parse(s), i32.tryParse(s), f64.parse(s), f64.tryParse(s)
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const typeName = callee.object.name;
      const primitiveMap = { 'i8':'int8_t','i16':'int16_t','i32':'int32_t','i64':'int64_t',
                              'u8':'uint8_t','u16':'uint16_t','u32':'uint32_t','u64':'uint64_t',
                              'f32':'float','f64':'double' };
      if (typeName in primitiveMap) {
        const ctype = primitiveMap[typeName];
        const ident = this.cTypeToIdent(ctype);
        if (callee.prop === 'parse') {
          const argC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
          this._lastSuppressConst = true; // parse() panics; result is non-const in C
          return `tsc_${ident}_parse(${argC})`;
        }
        if (callee.prop === 'tryParse') {
          this._ensureOptStruct(`opt_${ident}`, ctype);
          _setOptIsNullHint(args[0]?.expr);
          const argC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
          return `tsc_${ident}_try_parse(${argC})`;
        }
      }
    }

    // sleep()
    if (callee.kind === 'Ident' && callee.name === 'sleep') {
      const ms = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
      return `tsc_sleep_awaitable(${ms})`;
    }

    // Method call on known object
    if (callee.kind === 'Member') {
      return this.methodCall(callee, args, lines, depth);
    }

    // Generic function call: monomorphize
    if (callee.kind === 'Ident' && this._genericFuncs?.has(callee.name)) {
      return this.callGeneric(callee.name, node.typeArgs ?? [], args, lines, depth);
    }

    // Plain function call — look up mangled name in scope
    let calleeC;
    let sym = null;
    if (callee.kind === 'Ident') {
      sym = this.lookup(callee.name);
      // Overload resolution: if there are multiple overloads, pick by arg count then type
      if (sym?.overloads && sym.overloads.length > 0) {
        const argCount = args.filter(a => !a.spread).length;
        // First filter by arg count
        const countMatches = sym.overloads.filter(o => o.params.filter(p => !p.rest).length === argCount);
        let match;
        if (countMatches.length === 1) {
          match = countMatches[0];
        } else if (countMatches.length > 1) {
          // Multiple count matches: pick by type
          match = countMatches.find(o =>
            args.every((a, i) => {
              const p = o.params[i];
              if (!p?.typeAnn) return true;
              const expectedCtype = this.resolveType(p.typeAnn);
              const actualCtype = this.inferType(a.expr);
              return expectedCtype === actualCtype || expectedCtype.includes(actualCtype) || actualCtype.includes(expectedCtype);
            })
          ) ?? countMatches[0];
        } else {
          match = sym.overloads[sym.overloads.length - 1]; // fallback to last
        }
        calleeC = match.funcName;
        // Use matched params for rest/default filling below
        sym = { ...sym, funcName: calleeC, params: match.params };
      } else {
        // funcPtr variables hold the name directly; functions use their mangled name
        calleeC = (sym?.funcName && !sym.funcPtr) ? sym.funcName : callee.name;
        // avr/hal direct calls that return values: set _lastHalRead so stmt.js emits (void)name;
        if (sym?._suppressVoidWarning && sym.ctype !== 'void') this._lastHalRead = sym.ctype;
      }
    } else {
      calleeC = this.exprToC(callee, lines, depth);
    }

    // Closure call: name(args) → name.fn(&name.env, args)
    if (sym?.isClosure && callee.kind === 'Ident') {
      const argsC = this.argsToC(args, lines, depth);
      const callArgs = argsC ? `&${callee.name}.env, ${argsC}` : `&${callee.name}.env`;
      return `${callee.name}.fn(${callArgs})`;
    }

    // Libc variadic call or user Scalar-variadic call: pass args as raw C values
    if (sym?._isLibcVariadic || sym?._isScalarVariadic) {
      const _libcVmap = { printf: 'vprintf', fprintf: 'vfprintf', sprintf: 'vsprintf', snprintf: 'vsnprintf', scanf: 'vscanf', sscanf: 'vsscanf', fscanf: 'vfscanf' };
      const _toRawArg = (a) => {
        // Spread of a va_list → va_list variable name (for v-variant forwarding)
        if (a.spread) {
          const spreadSym = a.expr?.kind === 'Ident' ? this.lookup(a.expr.name) : null;
          if (spreadSym?._isVaList) return { isVaList: true, vaListName: spreadSym._vaListName };
          return { raw: `/* ...${this.exprToC(a.expr, lines, depth)} */` };
        }
        if (a.expr.kind === 'Literal' && a.expr.litType === 'string') {
          return { raw: `"${a.expr.value.replace(/"/g, '\\"')}"` };
        }
        const ac = this.exprToC(a.expr, lines, depth);
        const at = this.inferType(a.expr);
        return { raw: at === 'String' ? `${ac}.data` : ac };
      };
      const processed = args.map(_toRawArg);
      const vaListArg = processed.find(p => p.isVaList);
      if (vaListArg) {
        // Forward to v-variant: printf(fmt, ...args) → vprintf(fmt, _va_args)
        const vName = _libcVmap[calleeC] ?? ('v' + calleeC);
        const normalParts = processed.filter(p => !p.isVaList).map(p => p.raw);
        normalParts.push(vaListArg.vaListName);
        return `${vName}(${normalParts.join(', ')})`;
      }
      return `${calleeC}(${processed.map(p => p.raw).join(', ')})`;
    }

    // Check for any-typed params: cannot pass typed value as any
    if (sym?.params) {
      for (let i = 0; i < sym.params.length && i < args.length; i++) {
        const p = sym.params[i];
        if (p.typeAnn?.kind === 'TypeRef' && p.typeAnn.name === 'any') {
          const argType = this.inferType(args[i].expr);
          if (argType !== 'void *' && argType !== null && argType !== undefined) {
            const tsType = this.ctypeToTsName(argType);
            throw this.error(`cannot pass ${tsType} as "any": any is opaque across function boundaries`);
          }
        }
      }
    }

    // Check if callee has a rest param — if so, bundle variadic args into a temp array
    const symParams = sym?.params;
    const restIdx = symParams ? symParams.findIndex(p => p.rest) : -1;
    if (restIdx >= 0) {
      const restParam = symParams[restIdx];
      let et = 'int32_t';
      if (restParam.typeAnn?.kind === 'TypeArray') et = this.resolveType(restParam.typeAnn.element);
      else if (restParam.typeAnn) et = this.resolveType(restParam.typeAnn);
      // Normal args before rest
      const normalArgs = args.slice(0, restIdx).map(a => this.exprToC(a.expr, lines, depth));
      // Variadic args from restIdx onward
      const varArgs = args.slice(restIdx);
      const I = ' '.repeat(this.indent * depth);
      const restName = `_rest_${this.restCount++}`;
      const varArgsC = varArgs.map(a => this.exprToC(a.expr, lines, depth)).join(', ');
      lines.push(`${I}${et} ${restName}[] = {${varArgsC}};`);
      const allArgs = [...normalArgs, restName, String(varArgs.length)];
      return `${calleeC}(${allArgs.join(', ')})`;
    }

    // Fill in default params at call site if fewer args are provided (skip if any spread arg)
    const hasSpread = args.some(a => a.spread);
    if (!hasSpread && symParams && args.length < symParams.filter(p => !p.rest).length) {
      const normalParams = symParams.filter(p => !p.rest);
      const filled = normalParams.map((p, i) => {
        if (i < args.length) return this.exprToC(args[i].expr, lines, depth);
        if (p.defaultVal) return this.exprToC(p.defaultVal, lines, depth);
        return '0'; // fallback (shouldn't happen if type-checked)
      });
      return `${calleeC}(${filled.join(', ')})`;
    }

    // If we have symParams, coerce string literals to enum values for string-literal-union params
    // (only when no spread args — spread needs argsToC expansion)
    const hasSpreadArgs = args.some(a => a.spread);
    if (symParams && !hasSpreadArgs) {
      const I = ' '.repeat(this.indent * depth);
      const coercedArgs = args.map((a, i) => {
        const param = symParams[i];
        if (!param) return this.exprToC(a.expr, lines, depth);
        const paramType = param.typeAnn ? this.resolveType(param.typeAnn) : null;
        const paramEnumDef = paramType ? this.classes.get(paramType) : null;
        if (paramEnumDef?.isStringLiteralUnion && a.expr.kind === 'Literal' && a.expr.litType === 'string') {
          const val = a.expr.value;
          if (!paramEnumDef.members.includes(val)) {
            throw this.error(`"${val}" is not a valid value for type ${paramType}`);
          }
          return `${paramType}_${val}`;
        }
        // ObjLit arg to struct param: prefix with (StructType)
        if (paramEnumDef?.isStruct && a.expr.kind === 'ObjLit') {
          const initC = this.exprToC(a.expr, lines, depth);
          return `(${paramType})${initC}`;
        }
        // Array struct arg to destructured array param (int32_t *_arr): pass .data
        if (param.destructArr) {
          const argSym = a.expr?.kind === 'Ident' ? this.lookup(a.expr.name) : null;
          if (argSym?.ctype?.startsWith('Array_')) {
            return `${this.exprToC(a.expr, lines, depth)}.data`;
          }
        }
        // Borrow check: cannot pass const variable as Mut<T> (non-interface only;
        // interface Mut<T> is caught below with a better message)
        if (param.typeAnn?.kind === 'TypeRef' && param.typeAnn.name === 'Mut' &&
            a.expr.kind === 'Ident') {
          const innerCheck = param.typeAnn.typeArgs?.[0]?.name;
          if (!innerCheck || !this.interfaces.has(innerCheck)) {
            const argSym = this.lookup(a.expr.name);
            if (argSym?.varKind === 'const') {
              throw this.error(`cannot borrow "${a.expr.name}" as mutable: it is a const binding`);
            }
          }
        }
        // Interface param (or Mut<Interface>): wrap concrete class arg in fat pointer
        // Also handle `c as Shape` cast — unwrap to the inner ident
        const ifaceName = this._getIfaceParamName(param.typeAnn);
        const rawArgExpr = (ifaceName && a.expr.kind === 'Cast' &&
          a.expr.castType?.kind === 'TypeRef' && a.expr.castType.name === ifaceName)
          ? a.expr.expr : a.expr;
        if (ifaceName && this.interfaces.has(ifaceName) && rawArgExpr.kind === 'Ident') {
          const a2 = { ...a, expr: rawArgExpr };
          a = a2;
          const argName = a.expr.name;
          // Check: cannot pass const variable as Mut<Interface>
          if (param.typeAnn?.kind === 'TypeRef' && param.typeAnn.name === 'Mut') {
            const argVarInfo = this.lookup(argName);
            if (argVarInfo?.varKind === 'const') {
              const mutIfaceName = param.typeAnn.typeArgs?.[0]?.name ?? ifaceName;
              throw this.error(`TypeError: Cannot pass const variable '${argName}' as Mut<${mutIfaceName}>`);
            }
          }
          const argSym3 = this.lookup(argName);
          const argClass = argSym3?.ctype ? this.classes.get(argSym3.ctype) : null;
          if (argClass && !this.interfaces.has(argSym3.ctype)) {
            // Concrete class: wrap in fat pointer
            const className = argSym3.ctype;
            const hasExplicit = argClass.implements_?.includes(ifaceName);
            const vtableName = hasExplicit
              ? `${className}_${ifaceName}_vtable`
              : `_${className}_${ifaceName}_vtable`;
            if (!hasExplicit) this._ensureImplicitVtable(className, ifaceName);
            const fatName = `_${param.name}_${argName}`;
            // Reuse existing fat-ptr variable if already declared in scope
            if (!this.lookup(fatName)) {
              lines.push(`${I}${ifaceName} ${fatName} = { .self = &${argName}, .vtable = &${vtableName} };`);
              this.define(fatName, { ctype: ifaceName });
            }
            return fatName;
          }
        }
        // Ref<T>/Mut<T> param: pass &var (for non-interface inner types)
        if (param.typeAnn?.kind === 'TypeRef' &&
            (param.typeAnn.name === 'Ref' || param.typeAnn.name === 'Mut')) {
          const innerName2 = param.typeAnn.typeArgs?.[0]?.name;
          if (!innerName2 || !this.interfaces.has(innerName2)) {
            const argSym2 = a.expr?.kind === 'Ident' ? this.lookup(a.expr.name) : null;
            if (argSym2 && a.expr.kind === 'Ident') {
              if (param.typeAnn.name === 'Mut') {
                // Cannot mutably borrow while an immutable borrow is active
                if (argSym2._refBorrowed) {
                  throw this.error(
                    `TypeError: Cannot create mutable borrow of '${a.expr.name}' while immutable borrow is active`,
                    a.expr
                  );
                }
                // Cannot pass to two *different* Mut<T> borrowers in the same scope
                if (argSym2._mutBorrowedBy && argSym2._mutBorrowedBy !== calleeC) {
                  throw this.error(
                    `TypeError: Cannot create two simultaneous mutable borrows of '${a.expr.name}'`,
                    a.expr
                  );
                }
                argSym2._mutBorrowedBy = calleeC;
              } else {
                // Ref<T>: mark as immutably borrowed (for future Mut<T> checks)
                argSym2._refBorrowed = true;
              }
            }
            const argC2 = this.exprToC(a.expr, lines, depth);
            if (!argSym2?.isPointer && !argSym2?.ctype?.endsWith('*')) return `&${argC2}`;
            return argC2;
          }
        }
        return this.exprToC(a.expr, lines, depth);
      });
      return `${calleeC}(${coercedArgs.join(', ')})`;
    }

    const argsC = this.argsToC(args, lines, depth);
    return `${calleeC}(${argsC})`;
  },

  consoleCall(method, args, lines, depth) {
    // console.time / console.timeEnd / console.trace
    if (method === 'time') {
      const label = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("default")';
      return `tsc_console_time(${label})`;
    }
    if (method === 'timeEnd') {
      const label = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("default")';
      return `tsc_console_time_end(${label})`;
    }
    if (method === 'trace') {
      const embeddedTargets = ['avr', 'arm', 'stm32'];
      if (embeddedTargets.includes(this._targetName)) {
        throw this.error(`"console.trace()" is not available on embedded targets`);
      }
      const label = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      return `tsc_console_trace(${label})`;
    }

    const isErr = method === 'error' || method === 'warn' || method === 'debug';

    if (args.length === 0) {
      return isErr ? 'fprintf(stderr, "\\n")' : 'printf("\\n")';
    }

    const fmtParts = [];
    const fmtArgs  = [];

    for (const arg of args) {
      const expr  = arg.expr;
      const ctype = this.inferType(expr);

      // String literal → embed value directly in format string (no separate arg)
      if (expr.kind === 'Literal' && expr.litType === 'string') {
        fmtParts.push(expr.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%'));
        continue;
      }

      // String concat chain: "prefix" + s + "suffix" → fold into a single format string chunk
      if (expr.kind === 'Binary' && expr.op === '+' && this.isStringExpr(expr)) {
        const flattenConcat = (n) => {
          if (n.kind === 'Binary' && n.op === '+' && this.isStringExpr(n)) {
            return [...flattenConcat(n.left), ...flattenConcat(n.right)];
          }
          return [n];
        };
        let concatFmt = '';
        for (const seg of flattenConcat(expr)) {
          if (seg.kind === 'Literal' && (seg.litType === 'string' || seg.litType === 'char')) {
            concatFmt += seg.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');
          } else {
            concatFmt += '%s';
            const segCexpr = this.exprToC(seg, lines, depth);
            const segType = this.inferType(seg);
            fmtArgs.push(segType === 'String' ? `${segCexpr}.data` : segCexpr);
          }
        }
        fmtParts.push(concatFmt);
        continue;
      }

      // typeof expr → embed type name directly (compile-time constant)
      if (expr.kind === 'Typeof') {
        const _tofSym = expr.expr.kind === 'Ident' ? this.lookup(expr.expr.name) : null;
        const _tofCt = _tofSym?.ctype ?? this.inferType(expr.expr);
        fmtParts.push(this.ctypeToTsName(_tofCt));
        continue;
      }

      // A bare decimal integer literal is type `number` = f64 in TSClang
      if (this.isBareLiteralNumber(expr)) {
        const v = this.bareNumberValue(expr);
        fmtParts.push('%g');
        fmtArgs.push(v);
        continue;
      }

      const cexpr = this.exprToC(expr, lines, depth);

      // Bitwise ops: if operands are explicitly typed (from variables), use %d; otherwise %g (JS number)
      if (expr.kind === 'Binary' && ['&','|','^','<<','>>','>>>'].includes(expr.op)) {
        const hasTypedVar = (n) => {
          if (!n) return false;
          if (n.kind === 'Ident') {
            const s = this.lookup(n.name);
            return s?.ctype != null && s.ctype !== 'double' && s.ctype !== 'void *';
          }
          if (n.kind === 'Binary') return hasTypedVar(n.left) || hasTypedVar(n.right);
          return false;
        };
        if (hasTypedVar(expr)) {
          fmtParts.push('%d');
          fmtArgs.push(cexpr);
        } else {
          fmtParts.push('%g');
          fmtArgs.push(`(double)(${cexpr})`);
        }
        continue;
      }

      // Pointer-borrow types from struct destructuring (const T *field = &obj.field)
      if (ctype?.endsWith(' *') && !ctype.startsWith('void') && !ctype.startsWith('const char')) {
        const sym = expr.kind === 'Ident' ? this.lookup(expr.name) : null;
        const derefType = sym?.derefType ?? ctype.replace(/^(const )?/, '').replace(/ \*$/, '');
        if (derefType === 'String') {
          fmtParts.push('%s');
          fmtArgs.push(`${cexpr}->data`);
        } else if (derefType === 'double' || derefType === 'float') {
          fmtParts.push('%g');
          fmtArgs.push(`*${cexpr}`);
        } else if (derefType === 'int64_t') {
          fmtParts.push('%lld');
          fmtArgs.push(`(long long)*${cexpr}`);
        } else if (derefType === 'bool') {
          fmtParts.push('%s');
          fmtArgs.push(`*${cexpr} ? "true" : "false"`);
        } else {
          fmtParts.push('%d');
          fmtArgs.push(`*${cexpr}`);
        }
        continue;
      }

      if (ctype === 'String') {
        const strSym = expr.kind === 'Ident' ? this.lookup(expr.name) : null;
        if (strSym?.isStringRef) {
          fmtParts.push('%.*s');
          fmtArgs.push(`(int)${cexpr}.length`, `${cexpr}.data`);
        } else if (this._isHeapStringInit(expr)) {
          // Inline heap string (e.g., n.toString()): store in temp, printf, free
          const tmp = `_tmp_${this.tempCount++}`;
          const I = ' '.repeat(this.indent * depth);
          const cexprStr = cexpr;
          lines.push(`${I}String ${tmp} = ${cexprStr};`);
          if (!this._postStmtCleanups) this._postStmtCleanups = [];
          this._postStmtCleanups.push(`${I}tsc_string_free(${tmp});`);
          fmtParts.push('%s');
          fmtArgs.push(`${tmp}.data`);
        } else {
          fmtParts.push('%s');
          fmtArgs.push(`${cexpr}.data`);
        }
      } else if (ctype === 'const char *' || ctype === 'char *') {
        fmtParts.push('%s');
        fmtArgs.push(cexpr);
      } else if (ctype === 'bool') {
        fmtParts.push('%s');
        // Wrap in parens: identifiers, member accesses, unary, binary, ternary, assign
        // Function calls (Call) don't need parens
        const needsParens = expr.kind === 'Ident' || expr.kind === 'Member' || expr.kind === 'Unary' ||
                            expr.kind === 'Binary' || expr.kind === 'Ternary' || expr.kind === 'Assign';
        fmtArgs.push(`${needsParens ? `(${cexpr})` : cexpr} ? "true" : "false"`);
      } else if (ctype === 'double') {
        fmtParts.push('%g');
        fmtArgs.push(cexpr);
      } else if (ctype === 'float') {
        fmtParts.push('%g');
        fmtArgs.push(`(double)${cexpr}`);
      } else if (ctype === 'int64_t') {
        fmtParts.push('%lld');
        fmtArgs.push(`(long long)${cexpr}`);
      } else if (ctype === 'uint64_t') {
        fmtParts.push('%llu');
        fmtArgs.push(`(unsigned long long)${cexpr}`);
      } else if (ctype === 'uint8_t' || ctype === 'uint16_t') {
        fmtParts.push('%u');
        fmtArgs.push(`(unsigned)${cexpr}`);
      } else if (ctype === 'uint32_t') {
        fmtParts.push('%u');
        fmtArgs.push(cexpr);
      } else if (ctype === 'int8_t' || ctype === 'int16_t') {
        fmtParts.push('%d');
        fmtArgs.push(`(int)${cexpr}`);
      } else if (ctype === 'char') {
        fmtParts.push('%c');
        fmtArgs.push(cexpr);
      } else if (ctype === 'size_t') {
        fmtParts.push('%zu');
        fmtArgs.push(cexpr);
      } else {
        // Optional reference type (opt_ref_T): { bool has_value; T *value; }
        if (ctype.startsWith('opt_ref_')) {
          const innerIdent = ctype.slice(8); // "i32" from "opt_ref_i32"
          const identToCType3 = { 'i8':'int8_t', 'i16':'int16_t', 'i32':'int32_t', 'i64':'int64_t',
                                   'u8':'uint8_t', 'u16':'uint16_t', 'u32':'uint32_t', 'u64':'uint64_t',
                                   'f32':'float', 'f64':'double', 'bool':'bool', 'usize':'size_t' };
          const innerCType = identToCType3[innerIdent] ?? innerIdent;
          // No-value sentinel: -1 for int, etc.
          if (innerCType === 'double' || innerCType === 'float') {
            fmtParts.push('%g');
            fmtArgs.push(`${cexpr}.has_value ? *${cexpr}.value : -1.0`);
          } else {
            fmtParts.push('%d');
            fmtArgs.push(`${cexpr}.has_value ? *${cexpr}.value : -1`);
          }
          continue;
        }
        // Optional type (opt_T)
        if (ctype.startsWith('opt_')) {
          const innerIdent = ctype.slice(4); // e.g., "i32" from "opt_i32"
          const ed = this.classes.get(innerIdent);
          const sym2 = expr.kind === 'Ident' ? this.lookup(expr.name) : null;
          if (ed?.isEnum) {
            fmtParts.push('%d');
            fmtArgs.push(`${cexpr}.has_value ? (int)${cexpr}.value : -1`);
          } else if (sym2?.optIsNull || (() => {
              // Check if this is a null optional tuple field access: a[1] where _1 was not initialized
              if (expr.kind === 'Index' && expr.object.kind === 'Ident' && expr.index.kind === 'Literal') {
                const tSym = this.lookup(expr.object.name);
                return tSym?.nullOptFields?.has(`_${expr.index.value}`);
              }
              return false;
            })()) {
            // Null-initialized optional — show "some" or "null"
            fmtParts.push('%s');
            fmtArgs.push(`${cexpr}.has_value ? "some" : "null"`);
          } else if (innerIdent === 'string') {
            fmtParts.push('%s');
            fmtArgs.push(`${cexpr}.has_value ? ${cexpr}.value.data : "null"`);
          } else {
            // Numeric or other — print the value
            const identToCType2 = { 'i8':'int8_t', 'i16':'int16_t', 'i32':'int32_t', 'i64':'int64_t', 'u8':'uint8_t', 'u16':'uint16_t', 'u32':'uint32_t', 'u64':'uint64_t', 'f32':'float', 'f64':'double', 'bool':'bool', 'usize':'size_t' };
            const innerCType = identToCType2[innerIdent] ?? innerIdent;
            // For inline call expressions, create a temp var first (but not for simple Ident/Index/Member)
            let valExpr = cexpr;
            if (expr.kind === 'Call') {
              const _calleeProp = expr.callee?.kind === 'Member' ? expr.callee.prop : null;
              const _tmpPfx = _calleeProp === 'at' ? '_at_' : '_v_';
              const tmp = `${_tmpPfx}${this.tempCount++}`;
              lines.push(`${ctype} ${tmp} = ${cexpr};`);
              valExpr = tmp;
            }
            if (innerCType === 'double' || innerCType === 'float') {
              fmtParts.push('%g');
              fmtArgs.push(`${valExpr}.value`);
            } else if (innerCType === 'int64_t') {
              fmtParts.push('%lld');
              fmtArgs.push(`(long long)${valExpr}.value`);
            } else if (innerCType === 'uint8_t' || innerCType === 'uint16_t') {
              fmtParts.push('%u');
              fmtArgs.push(`(unsigned)${valExpr}.value`);
            } else {
              fmtParts.push('%d');
              fmtArgs.push(`${valExpr}.value`);
            }
          }
          continue;
        } else {
          // String literal union enum: print the string value
          const enumDef = this.classes.get(ctype);
          if (enumDef?.isStringLiteralUnion) {
            fmtParts.push('%s');
            fmtArgs.push(`${ctype}_values[(int)${cexpr}]`);
          } else if (enumDef?.isEnum) {
            fmtParts.push('%d');
            fmtArgs.push(`(int)${cexpr}`);
          } else {
            fmtParts.push('%d');
            fmtArgs.push(cexpr);
          }
        }
      }
    }

    const fmt = '"' + fmtParts.join(' ') + '\\n"';
    if (fmtArgs.length === 0) {
      return isErr ? `fprintf(stderr, ${fmt})` : `printf(${fmt})`;
    }
    const allArgs = [fmt, ...fmtArgs].join(', ');
    return isErr ? `fprintf(stderr, ${allArgs})` : `printf(${allArgs})`;
  },

  // Check if a labeled break/continue with the given label is used in an AST subtree
  labelUsed(node, label, kind) {
    if (!node || typeof node !== 'object') return false;
    if (node.kind === kind.charAt(0).toUpperCase() + kind.slice(1) && node.label === label) return true;
    // Don't descend into nested labeled loops with the same label
    if (node.kind === 'Labeled' && node.label === label) return false;
    for (const val of Object.values(node)) {
      if (Array.isArray(val)) {
        for (const item of val) { if (this.labelUsed(item, label, kind)) return true; }
      } else if (val && typeof val === 'object' && val.kind) {
        if (this.labelUsed(val, label, kind)) return true;
      }
    }
    return false;
  },

  // Is this a bare integer number literal (or unary minus thereof)?
  isBareLiteralNumber(expr) {
    if (expr.kind === 'Literal' && expr.litType === 'number' &&
        !expr.value.includes('.') && !expr.value.includes('e') && !expr.value.includes('E') &&
        !expr.value.startsWith('0x') && !expr.value.startsWith('0b') && !expr.value.startsWith('0o') &&
        !expr.value.startsWith('0X') && !expr.value.startsWith('0B') && !expr.value.startsWith('0O')) {
      return true;
    }
    if (expr.kind === 'Unary' && expr.op === '-') return this.isBareLiteralNumber(expr.expr);
    return false;
  },

  // Get the double representation of a bare integer literal
  bareNumberValue(expr) {
    if (expr.kind === 'Literal') {
      return expr.value + '.0';
    }
    if (expr.kind === 'Unary' && expr.op === '-') {
      return '-' + this.bareNumberValue(expr.expr);
    }
    return '0.0';
  },

  mathCall(prop, args, lines, depth) {
    const a0t = args[0] ? this.inferType(args[0].expr) : 'int32_t';
    const a1t = args[1] ? this.inferType(args[1].expr) : 'int32_t';
    const isFloat = (t) => t === 'double' || t === 'float';
    const a0 = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
    const a1 = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
    const a2 = args[2] ? this.exprToC(args[2].expr, lines, depth) : '0';

    // Constants — always need math.h
    if (prop === 'PI')      { this.includes.add('#include <math.h>'); return 'M_PI'; }
    if (prop === 'E')       { this.includes.add('#include <math.h>'); return 'M_E'; }
    if (prop === 'LN2')     { this.includes.add('#include <math.h>'); return 'M_LN2'; }
    if (prop === 'LN10')    { this.includes.add('#include <math.h>'); return 'log(10.0)'; }
    if (prop === 'SQRT2')   { this.includes.add('#include <math.h>'); return 'M_SQRT2'; }
    if (prop === 'SQRT1_2') { this.includes.add('#include <math.h>'); return 'M_SQRT1_2'; }
    if (prop === 'LOG2E')   { this.includes.add('#include <math.h>'); return 'M_LOG2E'; }
    if (prop === 'LOG10E')  { this.includes.add('#include <math.h>'); return 'M_LOG10E'; }

    // abs: integer arg → (int)abs(), float arg → fabs()
    if (prop === 'abs') {
      this.includes.add('#include <math.h>');
      if (!isFloat(a0t)) return `(int)abs(${a0})`;
      return `fabs(${a0})`;
    }
    // min/max: integer args → inline ternary (no math.h), float args → fmin/fmax
    if (prop === 'min') {
      if (!isFloat(a0t) && !isFloat(a1t)) return `(${a0} < ${a1}) ? ${a0} : ${a1}`;
      this.includes.add('#include <math.h>');
      return `fmin(${a0}, ${a1})`;
    }
    if (prop === 'max') {
      if (!isFloat(a0t) && !isFloat(a1t)) return `(${a0} > ${a1}) ? ${a0} : ${a1}`;
      this.includes.add('#include <math.h>');
      return `fmax(${a0}, ${a1})`;
    }
    // clamp: emit tsc_clamp helper
    if (prop === 'clamp') {
      if (!this._emittedTscClamp) {
        this._emittedTscClamp = true;
        this.addTop('static double tsc_clamp(double v, double lo, double hi) {');
        this.addTop('    return v < lo ? lo : (v > hi ? hi : v);');
        this.addTop('}');
        this.addTop('');
      }
      return `tsc_clamp(${a0}, ${a1}, ${a2})`;
    }
    // sign: no outer parens
    if (prop === 'sign') {
      return `(${a0} > 0.0) - (${a0} < 0.0) + 0.0`;
    }

    this.includes.add('#include <math.h>');
    const map = {
      // rounding
      floor: `floor(${a0})`, ceil: `ceil(${a0})`,
      round: `round(${a0})`, trunc: `trunc(${a0})`,
      // arithmetic
      sqrt: `sqrt(${a0})`, cbrt: `cbrt(${a0})`, pow: `pow(${a0}, ${a1})`,
      hypot: `hypot(${a0}, ${a1})`,
      // trigonometry
      sin: `sin(${a0})`, cos: `cos(${a0})`, tan: `tan(${a0})`,
      asin: `asin(${a0})`, acos: `acos(${a0})`, atan: `atan(${a0})`,
      atan2: `atan2(${a0}, ${a1})`,
      // hyperbolic
      sinh: `sinh(${a0})`, cosh: `cosh(${a0})`, tanh: `tanh(${a0})`,
      asinh: `asinh(${a0})`, acosh: `acosh(${a0})`, atanh: `atanh(${a0})`,
      // logarithms / exponents
      log: `log(${a0})`, log2: `log2(${a0})`, log10: `log10(${a0})`,
      log1p: `log1p(${a0})`,
      exp: `exp(${a0})`, expm1: `expm1(${a0})`,
      clz32: `(int32_t)__builtin_clz((uint32_t)(${a0}))`,
      imul: `(int32_t)((int32_t)(${a0}) * (int32_t)(${a1}))`,
      fround: `(float)(${a0})`,
      random: `tsc_math_random()`,
    };
    return map[prop] ?? `/* Math.${prop} */(${a0})`;
  },

  jsonCall(prop, typeArgs, args, lines, depth) {
    if (prop === 'stringify') {
      const arg0 = args[0]?.expr;
      const a0 = arg0 ? this.exprToC(arg0, lines, depth) : 'STR_LIT("")';
      const t = arg0 ? this.inferType(arg0) : 'int32_t';
      if (t === 'String') return `tsc_json_stringify_string(${a0})`;
      if (t === 'bool')   return `(${a0}) ? STR_LIT("true") : STR_LIT("false")`;
      if (t === 'double' || t === 'float') return `tsc_f64_to_string(${a0})`;
      if (t === 'int64_t') return `tsc_i64_to_string(${a0})`;
      return `tsc_i32_to_string(${a0})`;
    }
    if (prop === 'parse') {
      const typeName = typeArgs[0]?.name ?? 'i32';
      const a0 = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      if (typeName === 'f64' || typeName === 'f32') return `atof(${a0}.data)`;
      if (typeName === 'bool') return `(${a0}.length == 4 && memcmp(${a0}.data, "true", 4) == 0)`;
      return `atoi(${a0}.data)`;
    }
    return `/* JSON.${prop} */0`;
  },

  methodCall(callee, args, lines, depth) {
    // Handle method chain: arr.resize(10, 0).fill(7, 0, 5)
    // When callee.object is itself a Call, emit it as a statement and use the base object
    let baseObject = callee.object;
    if (baseObject.kind === 'Call' && baseObject.callee?.kind === 'Member') {
      const I = ' '.repeat(this.indent * depth);
      while (baseObject.kind === 'Call' && baseObject.callee?.kind === 'Member') {
        const innerC = this.callToC(baseObject, lines, depth);
        lines.push(`${I}${innerC};`);
        baseObject = baseObject.callee.object;
      }
    }
    const objC = this.exprToC(baseObject, lines, depth);
    const prop  = callee.prop;

    // Determine array element type from symbol
    const sym   = baseObject.kind === 'Ident' ? this.lookup(baseObject.name) : null;
    const et    = sym?.elemType ?? 'i32';           // identifier suffix, e.g. 'i32'
    const etC   = sym?.arrElemCType ?? 'int32_t';   // C type, e.g. 'int32_t'

    // Helper: extract output type from lambda name _lambda_N_TYPE
    const lambdaOutET = (argsC) => {
      const m = argsC.match(/_lambda_\d+_(\w+)/);
      return m ? m[1] : et;
    };

    // Set lambda param type hint for array callback methods
    const isArrayObj = sym?.isArray || this.inferType(baseObject)?.startsWith('Array_');
    const arrayCallbackProps = new Set(['filter','map','every','some','find','findIndex','forEach','sort','reduce']);
    if (isArrayObj && arrayCallbackProps.has(prop)) {
      // sort comparator has 2 params; reduce has (acc, x) both same type
      this._lambdaParamHint = (prop === 'reduce' || prop === 'sort') ? [etC, etC] : [etC];
    }
    const argsC = this.argsToC(args, lines, depth);
    this._lambdaParamHint = null;
    if (isArrayObj) {
      switch (prop) {
        case 'push': {
          if (sym?._refBorrowed)
            throw this.error(`cannot mutate '${baseObject.name}' while a borrow is active`, baseObject);
          const elemC = args[0] ? this.exprToC(args[0].expr, [], depth) : '0';
          if (baseObject.kind === 'Ident') {
            this._registerCleanup(`tsc_array_free_${et}(&${objC})`);
            if (sym) sym.arraySize = undefined; // size unknown after push
          }
          return `tsc_array_push_${et}(&${objC}, ${elemC})`;
        }
        case 'pop': {
          if (sym?._refBorrowed)
            throw this.error(`cannot mutate '${baseObject.name}' while a borrow is active`, baseObject);
          this._ensureOptStruct(`opt_${et}`, etC);
          if (sym?.arraySize === 0) this._lastPopEmpty = true;
          return `tsc_array_pop_${et}(&${objC})`;
        }
        case 'remove': {
          if (sym?._refBorrowed)
            throw this.error(`cannot mutate '${baseObject.name}' while a borrow is active`, baseObject);
          const idxC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          this._lastArrayElemReturn = true; // suppress const for the returned element
          return `tsc_array_remove_${et}(&${objC}, ${idxC})`;
        }
        case 'view': {
          // arr.view(start?, end?) → Slice_T (zero-copy borrow)
          const slName = `Slice_${et}`;
          this._ensureSliceStruct(slName, etC, false);
          if (baseObject.kind === 'Ident' && sym) sym._refBorrowed = true;
          const _vs = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const _ve = args[1] ? this.exprToC(args[1].expr, lines, depth) : `(size_t)${objC}.length`;
          return `(${slName}){ .ptr = ${objC}.data + (${_vs}), .length = (size_t)(${_ve}) - (${_vs}) }`;
        }
        case 'viewMut': {
          // arr.viewMut(start?, end?) → MutSlice_T
          const msName = `MutSlice_${et}`;
          this._ensureSliceStruct(msName, etC, true);
          if (baseObject.kind === 'Ident' && sym) sym._refBorrowed = true;
          const _ms = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const _me = args[1] ? this.exprToC(args[1].expr, lines, depth) : `(size_t)${objC}.length`;
          return `(${msName}){ .ptr = ${objC}.data + (${_ms}), .length = (size_t)(${_me}) - (${_ms}) }`;
        }
        case 'length':   return `${objC}.length`;
        case 'capacity': return `${objC}.capacity`;
        case 'sort': {
          const fnC = args.length ? argsC : 'NULL';
          return `tsc_array_sort_${et}(&${objC}, ${fnC})`;
        }
        case 'reverse':    return `tsc_array_reverse_${et}(&${objC})`;
        case 'fill': {
          const v     = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const start = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          const end   = args[2] ? this.exprToC(args[2].expr, lines, depth) : `(int32_t)${objC}.length`;
          return `tsc_array_fill_${et}(&${objC}, ${v}, ${start}, ${end})`;
        }
        case 'resize': {
          const nNode = args[0]?.expr;
          const nC    = nNode ? this.exprToC(nNode, lines, depth) : '0';
          const fillC = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          // Register cleanup only if new size likely exceeds current (may heap-alloc)
          if (baseObject.kind === 'Ident') {
            const nLit = nNode?.kind === 'Literal' ? parseFloat(nNode.value) : NaN;
            const curSize = sym?.arraySize ?? NaN;
            if (isNaN(nLit) || isNaN(curSize) || nLit > curSize) {
              this._registerCleanup(`tsc_array_free_${et}(&${objC})`);
            }
            if (sym) sym.arraySize = isNaN(nLit) ? undefined : nLit; // update tracked size
          }
          return `tsc_array_resize_${et}(&${objC}, ${nC}, ${fillC})`;
        }
        case 'reallocate': {
          const capNode = args[0]?.expr;
          const capC = capNode ? this.exprToC(capNode, lines, depth) : '0';
          if (baseObject.kind === 'Ident') {
            const capLit = capNode?.kind === 'Literal' ? parseFloat(capNode.value) : NaN;
            const curSize = sym?.arraySize ?? NaN;
            if (isNaN(capLit) || isNaN(curSize) || capLit > curSize) {
              this._registerCleanup(`tsc_array_free_${et}(&${objC})`);
            }
            if (sym) sym.arraySize = undefined; // capacity changed, size unknown
          }
          return `tsc_array_reallocate_${et}(&${objC}, ${capC})`;
        }
        case 'filter':  return `tsc_array_filter_${et}(${objC}, ${argsC})`;
        case 'forEach': return `tsc_array_foreach_${et}(${objC}, ${argsC})`;
        case 'map': {
          const outET = lambdaOutET(argsC);
          return `tsc_array_map_${et}_${outET}(${objC}, ${argsC})`;
        }
        case 'reduce': {
          const initExpr = args[1]?.expr;
          const outET = initExpr ? this.cTypeToIdent(this.inferType(initExpr)) : et;
          return `tsc_array_reduce_${et}_${outET}(${objC}, ${argsC})`;
        }
        case 'every':    return `tsc_array_every_${et}(${objC}, ${argsC})`;
        case 'some':     return `tsc_array_some_${et}(${objC}, ${argsC})`;
        case 'find': {
          this._ensureOptRefStruct(`opt_ref_${et}`, etC);
          return `tsc_array_find_${et}(${objC}, ${argsC})`;
        }
        case 'findIndex': return `(int)tsc_array_find_index_${et}(${objC}, ${argsC})`;
        case 'indexOf':  return `(int)tsc_array_index_of_${et}(${objC}, ${argsC})`;
        case 'includes': return `tsc_array_includes_${et}(${objC}, ${argsC})`;
        case 'concat':   return `tsc_array_concat_${et}(${objC}, ${argsC})`;
        case 'slice': {
          const s = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const e = args[1] ? this.exprToC(args[1].expr, lines, depth) : `(int32_t)${objC}.length`;
          return `tsc_array_slice_${et}(${objC}, ${s}, ${e})`;
        }
        case 'join': {
          const sep = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT(",")';
          return `tsc_array_join_${et}(${objC}, ${sep})`;
        }
        case 'keys':    return `tsc_array_keys_${et}(${objC})`;
        case 'values':  return `tsc_array_values_${et}(${objC})`;
        case 'entries': return `tsc_array_entries_${et}(${objC})`;
        case 'flat':    return `tsc_array_flat_${et}(${objC})`;
        case 'clone':   return `tsc_array_slice_${et}(${objC}, 0, (int32_t)${objC}.length)`;
      }
    }

    // Slice<T> / MutSlice<T> method calls
    const baseObjType = this.inferType(baseObject);
    const isSliceObj = baseObjType?.startsWith('Slice_') || baseObjType?.startsWith('MutSlice_');
    if (isSliceObj) {
      const isMut = baseObjType.startsWith('MutSlice_');
      const sliceEtC = baseObjType.slice(isMut ? 9 : 6); // element C type (after 'Slice_' or 'MutSlice_')
      const sliceEt  = this.cTypeToIdent(sliceEtC);
      switch (prop) {
        case 'view': {
          const slName = `Slice_${sliceEt}`;
          this._ensureSliceStruct(slName, sliceEtC, false);
          const _vs = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const _ve = args[1] ? this.exprToC(args[1].expr, lines, depth) : `${objC}.length`;
          return `(${slName}){ .ptr = ${objC}.ptr + (${_vs}), .length = (size_t)(${_ve}) - (${_vs}) }`;
        }
        case 'viewMut': {
          const msName = `MutSlice_${sliceEt}`;
          this._ensureSliceStruct(msName, sliceEtC, true);
          const _ms = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const _me = args[1] ? this.exprToC(args[1].expr, lines, depth) : `${objC}.length`;
          return `(${msName}){ .ptr = ${objC}.ptr + (${_ms}), .length = (size_t)(${_me}) - (${_ms}) }`;
        }
      }
    }

    // (legacy arrMethods fallback — only reached for non-array objects with same prop names)
    const arrMethods = {};

    // String methods
    const strMethods = {
      length:     () => `${objC}.length`,
      slice:      () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_slice(${objC}, ${a[0]??0}, ${a[1]??'(int32_t)'+objC+'.length'})`; },
      indexOf:      () => `(int)tsc_string_index_of(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      lastIndexOf:  () => `(int)tsc_string_last_index_of(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      at:           () => {
        // s.at(n) → tsc_string_at(s, n) returning opt_u8
        const idxNode = args[0]?.expr;
        const idxC = this.exprToC(idxNode, lines, depth);
        if (!this._emittedOptStructs) this._emittedOptStructs = new Set();
        if (!this._emittedOptStructs.has('opt_u8')) {
          this._emittedOptStructs.add('opt_u8');
          // opt_u8 is defined in runtime.h — no local typedef needed
        }
        // Flag: non-negative literal index might be OOB → optIsNull hint for VarDecl
        const idxVal = (idxNode?.kind === 'Literal' && idxNode?.litType === 'number') ? parseFloat(idxNode.value) : NaN;
        this._lastAtNonNeg = !isNaN(idxVal) && idxVal >= 0;
        return `tsc_string_at(${objC}, ${idxC})`;
      },
      includes:   () => `tsc_string_includes(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      startsWith: () => `tsc_string_starts_with(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      endsWith:   () => `tsc_string_ends_with(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      split:      () => `tsc_string_split(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      trim:       () => `tsc_string_trim(${objC})`,
      toUpperCase:() => `tsc_string_to_upper(${objC})`,
      toLowerCase:() => `tsc_string_to_lower(${objC})`,
      replace:    () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_replace(${objC}, ${a[0]}, ${a[1]})`; },
      padStart:   () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_pad_start(${objC}, ${a[0]}, ${a[1]??'STR_LIT(" ")'})`; },
      padEnd:     () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_pad_end(${objC}, ${a[0]}, ${a[1]??'STR_LIT(" ")'})`; },
      repeat:     () => `tsc_string_repeat(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      charAt:     () => `tsc_string_char_at(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      charCodeAt: () => { const idxC = this.exprToC(args[0].expr, lines, depth); return `(unsigned)(uint8_t)${objC}.data[${idxC}]`; },
      concat:     () => `tsc_string_concat(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      codePoints:  () => `tsc_codepoints(${objC})`,
      graphemes:   () => `tsc_graphemes(${objC})`,
      replaceAll:  () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_replace_all(${objC}, ${a[0]}, ${a[1]})`; },
      substring:   () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_substring(${objC}, ${a[0]}, ${a[1]??objC+'.length'})`; },
      trimStart:   () => `tsc_string_trim_start(${objC})`,
      trimEnd:     () => `tsc_string_trim_end(${objC})`,
    };

    // StaticMap inline (compile-time hash): opcodes.get("LDA") → _staticmap_N_get(...)
    const _smInlineSym = baseObject.kind === 'Ident' ? this.lookup(baseObject.name) : null;
    if (_smInlineSym?._isStaticMapInline && prop === 'get') {
      const sym = _smInlineSym;
      if (!sym._getFn) {
        // Generate get function on first use
        const idx = sym._smIdx;
        const fnName = `_staticmap_${idx}_get`;
        sym._getFn = fnName;
        const entries = sym._entries; // [{ key: string, valC: string }]
        const n = entries.length;
        const buckets = Math.max(1, n);

        // Ensure opt_i32 typedef
        this.addTop('typedef struct { bool has_value; int32_t value; } opt_i32;');
        this.addTop('');

        // djb2 hash in JS
        const djb2 = (s) => {
          let h = 5381;
          for (let i = 0; i < s.length; i++) {
            h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
          }
          return h;
        };

        // Group entries by bucket
        const bucketMap = new Map();
        for (const e of entries) {
          const b = djb2(e.key) % buckets;
          if (!bucketMap.has(b)) bucketMap.set(b, []);
          bucketMap.get(b).push(e);
        }

        const fnLines = [];
        fnLines.push(`static opt_i32 ${fnName}(String key) {`);
        fnLines.push(`    uint32_t _h = tsc_djb2(key);`);
        fnLines.push(`    switch (_h % ${buckets}) {`);
        for (const [b, bEntries] of bucketMap) {
          let line = `        case ${b}:`;
          for (const e of bEntries) {
            line += ` if (tsc_string_eq(key, STR_LIT("${e.key}"))) return (opt_i32){true, ${e.valC}};`;
          }
          line += ' break;';
          fnLines.push(line);
        }
        fnLines.push('    }');
        fnLines.push('    return (opt_i32){false, 0};');
        fnLines.push('}');
        for (const l of fnLines) this.topLevel.push(l);
        this.topLevel.push('');
        this._lastSuppressConst = true;
      }
      const keyC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      return `${sym._getFn}(${keyC})`;
    }

    // StaticMap_* methods → tsc_staticmap_* with pointer
    const _smSym = baseObject.kind === 'Ident' ? this.lookup(baseObject.name) : null;
    if (_smSym?._isStaticMap) {
      const sfx = _smSym._smSuffix; // e.g. "u8_i32"
      const varName = baseObject.name;
      if (prop === 'set')    return `tsc_staticmap_set_${sfx}(&${varName}, ${argsC})`;
      if (prop === 'get')    return `tsc_staticmap_get_${sfx}(&${varName}, ${argsC})`;
      if (prop === 'has')    return `tsc_staticmap_has_${sfx}(&${varName}, ${argsC})`;
      if (prop === 'delete') return `tsc_staticmap_delete_${sfx}(&${varName}, ${argsC})`;
      if (prop === 'clear')  return `tsc_staticmap_clear_${sfx}(&${varName})`;
    }

    // Map_* methods → explicit C function calls
    const objType2 = (baseObject.kind === 'Ident' ? this.lookup(baseObject.name)?.ctype : null)
      ?? this.inferType(baseObject);
    const _mapSfx2 = this._mapSuffix(objType2);
    if (_mapSfx2) {
      const mapSuffix = _mapSfx2; // e.g., "string_i32"
      const mapVarName = baseObject.kind === 'Ident' ? baseObject.name : null;
      if (prop === 'set') {
        // Track that this map variable has had at least one set call
        if (mapVarName) {
          if (!this._mapHasSetCalls) this._mapHasSetCalls = new Set();
          this._mapHasSetCalls.add(mapVarName);
        }
        return `tsc_map_set_${mapSuffix}(&${objC}, ${argsC})`;
      }
      if (prop === 'get' || prop === 'delete') {
        // If no set calls were made on this map variable, the result is definitely null
        if (mapVarName) {
          const hasSet = this._mapHasSetCalls?.has(mapVarName) ?? false;
          this._lastOptIsNull = !hasSet;
        }
        if (prop === 'get')    return `tsc_map_get_${mapSuffix}(&${objC}, ${argsC})`;
        if (prop === 'delete') return `tsc_map_delete_${mapSuffix}(&${objC}, ${argsC})`;
      }
      if (prop === 'has')    return `tsc_map_has_${mapSuffix}(&${objC}, ${argsC})`;
      if (prop === 'clear')  return `tsc_map_clear_${mapSuffix}(&${objC})`;
      if (prop === 'keys') {
        this._lastSuppressConst = true; // keys() returns heap array — suppress const qualifier
        return `tsc_map_keys_${mapSuffix}(&${objC})`;
      }
      if (prop === 'entries') return `tsc_map_entries_${mapSuffix}(&${objC})`;
    }

    // Float methods: toFixed, toPrecision
    const numMethods = {
      toFixed: () => {
        const objType = this.inferType(baseObject);
        if (objType === 'int32_t' || objType === 'int64_t' || objType === 'uint32_t')
          throw this.error(`"toFixed()" is only available on f32/f64`);
        const nArg = args[0]?.expr;
        if (!nArg || nArg.kind !== 'Literal')
          throw this.error(`"toFixed()" argument must be a compile-time literal`);
        const n = nArg.value;
        const buf = `_buf_${this.tempCount++}`;
        lines.push(`char ${buf}[64];`);
        lines.push(`snprintf(${buf}, sizeof(${buf}), "%.${n}f", ${objC});`);
        return `STR_LIT_RUNTIME(${buf})`;
      },
      toPrecision: () => {
        const nArg = args[0]?.expr;
        if (!nArg || nArg.kind !== 'Literal')
          throw this.error(`"toPrecision()" argument must be a compile-time literal`);
        const n = nArg.value;
        const buf = `_buf_${this.tempCount++}`;
        lines.push(`char ${buf}[64];`);
        lines.push(`snprintf(${buf}, sizeof(${buf}), "%.*g", ${n}, ${objC});`);
        return `STR_LIT_RUNTIME(${buf})`;
      },
    };

    const hasOwn = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
    if (hasOwn(arrMethods, prop) && arrMethods[prop]) return arrMethods[prop]();
    if (hasOwn(strMethods, prop) && strMethods[prop]) return strMethods[prop]();
    if (hasOwn(numMethods, prop) && numMethods[prop]) return numMethods[prop]();

    // toString() dispatch by object type
    if (prop === 'toString') {
      const objType5 = (baseObject.kind === 'Ident' ? this.lookup(baseObject.name)?.ctype : null)
                       ?? this.inferType(baseObject);
      // String.toString() is a no-op
      if (objType5 === 'String') return objC;
      // numeric.toString() → tsc_T_to_string(x)
      if (objType5 && !objType5.startsWith('Array_') && !this._mapSuffix(objType5) &&
          !objType5.startsWith('opt_') && objType5 !== 'void') {
        const etId5 = this.cTypeToIdent(objType5);
        return `tsc_${etId5}_to_string(${objC})`;
      }
    }

    // Pool class static calls: ClassName.alloc() → ensure alloc fn emitted + call it
    if (baseObject.kind === 'Ident' && this.classes.has(baseObject.name)) {
      const poolDef = this.classes.get(baseObject.name);
      if (poolDef?._isPool && prop === 'alloc') {
        this._ensurePoolAlloc(baseObject.name);
        return `${poolDef._poolAllocFn}()`;
      }
      if (poolDef?._isPool && prop === 'drop') {
        this._ensurePoolDrop(baseObject.name);
        return `${poolDef._poolDropFn}(${argsC})`;
      }
    }

    // Static method call: ClassName.method(args) → ClassName_method(args)
    if (baseObject.kind === 'Ident' && this.classes.has(baseObject.name)) {
      const classDef = this.classes.get(baseObject.name);
      const methodInfo = classDef?._methodNames?.get(prop);
      if (methodInfo?.isStatic) {
        return `${methodInfo.nameMangled}(${argsC})`;
      }
    }

    // Interface fat-pointer method call: obj.method(args) → obj.vtable->method(obj.self, args)
    const ifaceSym = baseObject.kind === 'Ident' ? this.lookup(baseObject.name) : null;
    if (ifaceSym?.ctype && this.interfaces.has(ifaceSym.ctype)) {
      const ifaceArgsC = argsC ? `, ${argsC}` : '';
      return `${objC}.vtable->${prop}(${objC}.self${ifaceArgsC})`;
    }

    // Generic method: obj.method(args) → ObjType_method(&obj, args) or ObjType_method(obj, args)
    const classSym = baseObject.kind === 'Ident' ? this.lookup(baseObject.name) : null;
    if (classSym?.ctype && this.classes.has(classSym.ctype)) {
      const classDef2 = this.classes.get(classSym.ctype);
      const methodInfo2 = classDef2?._methodNames?.get(prop);
      if (methodInfo2?.isMoveMethod) {
        // Error: move-method on const binding
        if (classSym.varKind === 'const') {
          throw this.error(`TypeError: Cannot move '${baseObject.name}': variable is declared const`);
        }
        // Move-method: pass self by value
        return `${methodInfo2.nameMangled}(${objC}${argsC ? ', ' + argsC : ''})`;
      }
      // Error: explicitly mut method on const binding
      if (methodInfo2?.isExplicitMut && classSym.varKind === 'const') {
        throw this.error(`cannot call "mut" method on const binding`);
      }
      if (methodInfo2) {
        // Known class method: pass &obj
        return `${classSym.ctype}_${prop}(&${objC}${argsC ? ', ' + argsC : ''})`;
      }
      // Method not found on class — fall through to extension lookup
    }

    // Extension method: obj.method(args) → _ext_{typeIdent}_{method}(obj, args)
    if (this._extensions) {
      const objType = this.inferType(baseObject);
      if (objType) {
        const typeIdent = this.cTypeToIdent(objType);
        const extKey = `${typeIdent}.${prop}`;
        const ext = this._extensions.get(extKey);
        if (ext) {
          return `${ext.cFuncName}(${objC}${argsC ? ', ' + argsC : ''})`;
        }
      }
    }

    // Fallback: obj.method(args)
    // For class objects without an explicit method map entry, use ClassName_prop convention
    if (classSym?.ctype && this.classes.has(classSym.ctype)) {
      return `${classSym.ctype}_${prop}(&${objC}${argsC ? ', ' + argsC : ''})`;
    }
    return `${objC}.${prop}(${argsC})`;
  },

  argsToC(args, lines, depth) {
    const parts = [];
    for (const a of args) {
      if (a.spread) {
        // Expand spread from a known array: arr → arr.data[0], arr.data[1], ...
        const spreadSym = a.expr?.kind === 'Ident' ? this.lookup(a.expr.name) : null;
        if (spreadSym?.isArray && spreadSym.arraySize >= 0) {
          const n = a.expr.name;
          const useData = spreadSym.ctype?.startsWith('Array_');
          for (let i = 0; i < spreadSym.arraySize; i++)
            parts.push(useData ? `${n}.data[${i}]` : `${n}[${i}]`);
        } else {
          parts.push(`/* ...${this.exprToC(a.expr, lines, depth)} */`);
        }
      } else {
        parts.push(this.exprToC(a.expr, lines, depth));
      }
    }
    return parts.join(', ');
  },

  // Get the interface name from a type annotation (handles plain Interface and Mut<Interface>)
  _getIfaceParamName(typeAnn) {
    if (!typeAnn || typeAnn.kind !== 'TypeRef') return null;
    if (this.interfaces.has(typeAnn.name)) return typeAnn.name;
    if ((typeAnn.name === 'Mut' || typeAnn.name === 'Ref') && typeAnn.typeArgs?.[0]?.kind === 'TypeRef') {
      const inner = typeAnn.typeArgs[0].name;
      if (this.interfaces.has(inner)) return inner;
    }
    return null;
  },

  // Register an implicit (Pattern B) vtable constant for lazy emission before main
  _ensureImplicitVtable(className, ifaceName) {
    if (!this._emittedImplicitVtables) this._emittedImplicitVtables = new Set();
    const key = `${className}_${ifaceName}`;
    if (this._emittedImplicitVtables.has(key)) return;
    this._emittedImplicitVtables.add(key);

    const ifaceDef = this.interfaces.get(ifaceName);
    if (!ifaceDef) return;
    const ifaceMethods = ifaceDef.filter(m => m.kind === 'MethodSig');
    // Verify class implements all interface methods
    const classDef = this.classes.get(className);
    for (const im of ifaceMethods) {
      const methodExists = classDef?.methods?.some(mm => mm.name === im.name);
      if (!methodExists) {
        throw this.error(`TypeError: Class '${className}' does not implement interface '${ifaceName}': missing method '${im.name}'`);
      }
    }
    const vtableName = `_${className}_${ifaceName}_vtable`;

    const entries = ifaceMethods.map(m => {
      const retType = m.returnType ? this.resolveType(m.returnType) : 'void';
      return `    .${m.name} = (${retType} (*)(void *))${className}_${m.name}`;
    });
    // Emit vtable directly to topLevel so it precedes any function that references it
    this.topLevel.push(
      `static const ${ifaceName}_vtable ${vtableName} = {`,
      ...entries.map(e => e + ','),
      `};`,
      ``
    );
  }

};
