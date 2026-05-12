export default {
  _dispatchBuiltin(node, lines, depth) {
    const { callee, args } = node;
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
      if (this._isEmbedded()) {
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
      if (this._isEmbedded()) {
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

    return null;
  },
};
