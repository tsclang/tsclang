export const LANGUAGE_BUILTINS = new Set([
  'true', 'false', 'null', 'undefined',
  'console', 'Math', 'performance', 'Date', 'JSON', 'process', 'Object',
  'Error', 'Map', 'Set', 'Array', 'Promise', 'Atomic',
  'parseInt', 'parseFloat', 'tryParseInt', 'tryParseFloat',
  'Number', 'String', 'Boolean',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'sleep', 'drop', 'structuredClone', 'super',
  'NaN', 'Infinity',
]);

export const STDLIB_MODULES = {
  'std/string': {
    exports: {
      atob:               { func: 'tsc_atob',                 include: 'std/base64.h', returns: 'String' },
      btoa:               { func: 'tsc_btoa',                 include: 'std/base64.h', returns: 'String' },
      encodeURIComponent: { func: 'tsc_url_encode_component', include: 'std/url.h',    returns: 'String' },
      decodeURIComponent: { func: 'tsc_url_decode_component', include: 'std/url.h',    returns: 'String' },
      encodeURI:          { func: 'tsc_url_encode',           include: 'std/url.h',    returns: 'String' },
      decodeURI:          { func: 'tsc_url_decode',           include: 'std/url.h',    returns: 'String' },
      decodeUtf8:         { func: 'tsc_decode_utf8',          include: null,           returns: 'String', special: '_stdStringDecodeUtf8' },
      encodeUtf8:         { func: 'tsc_encode_utf8',          include: null,           returns: 'Array_u8', special: '_stdStringEncodeUtf8' },
      Regex:              { special: '_stdStringRegex' },
    },
  },

  'std/avr': {
    include: 'std/avr.h',
    handler: '_handleStdAvr',
  },

  'std/random': {
    flag: '_stdRandomImported',
  },

  'std/embedded': {
    flag: '_stdEmbeddedImported',
  },

  'std/temporal': {
    include: 'std/temporal.h',
    flag: '_stdTemporalImported',
  },

  'std/fs': {
    include: 'std/fs.h',
    flag: '_stdFsImported',
    platformCheck: 'not-embedded-not-wasm',
    handler: '_handleStdFs',
  },

  'std/url': {
    include: 'std/url.h',
    flag: '_stdUrlImported',
  },

  'std/blob': {
    flag: '_stdBlobImported',
  },

  'std/io': {
    include: 'std/io.h',
    flag: '_stdIoImported',
    platformCheck: 'not-wasm',
    handler: '_handleStdIo',
  },

  'std/reactive': {
    include: 'std/reactive.h',
    flag: '_stdReactiveImported',
    handler: '_handleStdReactive',
  },

  'std/ws': {
    include: 'std/ws.h',
    flag: '_stdWsImported',
    platformCheck: 'not-wasm',
  },

  'std/net': {
    include: 'std/net.h',
    flag: '_stdNetImported',
    platformCheck: 'not-embedded-not-wasm',
    handler: '_handleStdNet',
  },

  'std/libc': {
    include: '<stdio.h>',
    handler: '_handleStdLibc',
  },

  'std/hal': {
    include: 'std/hal.h',
    flag: '_stdHalImported',
    platformCheck: 'embedded-only',
  },
};

const _LIBC_VARIADIC = new Set([
  'printf', 'vprintf', 'fprintf', 'vfprintf', 'sprintf', 'vsprintf',
  'snprintf', 'vsnprintf', 'scanf', 'sscanf', 'fscanf',
]);

const _AVR_FUNC_MAP = {
  pinMode: 'tsc_avr_pin_mode', digitalWrite: 'tsc_avr_digital_write',
  digitalRead: 'tsc_avr_digital_read', delay: 'tsc_avr_delay',
  delayMicroseconds: 'tsc_avr_delay_us', serialBegin: 'tsc_avr_serial_begin',
  serialWrite: 'tsc_avr_serial_write', serialRead: 'tsc_avr_serial_read',
  serialAvailable: 'tsc_avr_serial_available', analogWrite: 'tsc_avr_analog_write',
  interruptEnable: 'tsc_avr_interrupt_enable', interruptDisable: 'tsc_avr_interrupt_disable',
};

const _AVR_RETURN_TYPES = {
  digitalRead: 'bool', serialAvailable: 'bool', serialRead: 'uint8_t',
};

export function resolveImportName(source, rawName) {
  const mod = STDLIB_MODULES[source];
  if (!mod?.exports) return null;
  const name = typeof rawName === 'object' ? rawName.name : rawName;
  return mod.exports[name] ?? null;
}

export function handleStdlibImport(ctx, node) {
  const mod = STDLIB_MODULES[node.source];
  if (!mod) return false;

  if (mod.platformCheck === 'not-embedded-not-wasm') {
    if (ctx._isEmbeddedOrRetro() || ctx._isWasmBare()) {
      throw ctx.error(`TypeError: '${node.source}' is not available on ${ctx._targetName} targets`);
    }
  } else if (mod.platformCheck === 'not-wasm') {
    if (ctx._isWasmBare()) {
      throw ctx.error(`TypeError: '${node.source}' is not available on wasm targets`);
    }
  } else if (mod.platformCheck === 'embedded-only') {
    if (!ctx._isEmbeddedOrRetro()) {
      throw ctx.error(`TypeError: '${node.source}' requires an embedded platform target`);
    }
    if (ctx._isWasmBare()) {
      throw ctx.error(`TypeError: '${node.source}' is not available on wasm targets`);
    }
  }

  if (mod.include) {
    const inc = mod.include.startsWith('<') ? `#include ${mod.include}` : `#include "${mod.include}"`;
    ctx.includes.add(inc);
  }
  if (mod.flag) ctx[mod.flag] = true;

  if (mod.handler) {
    ctx[mod.handler](node);
  } else if (mod.exports) {
    const names = node.names ?? [];
    const usedIncludes = new Set();
    for (const n of names) {
      const name = typeof n === 'object' ? n.name : n;
      const exp = mod.exports[name];
      if (!exp) continue;
      if (exp.special) {
        ctx[exp.special] = true;
      }
      if (exp.func) {
        const includeKey = exp.include;
        if (includeKey && !usedIncludes.has(includeKey)) {
          usedIncludes.add(includeKey);
          ctx.includes.add(`#include "${includeKey}"`);
        }
        ctx.define(name, {
          ctype: exp.returns ?? 'void',
          funcName: exp.func,
          varKind: 'const',
          _suppressVoidWarning: exp.returns && exp.returns !== 'void',
        });
      }
    }
  }

  return true;
}

export const STDLIB_HANDLERS = {
  _handleStdAvr(node) {
    const names = node.names ?? [];
    for (const n of names) {
      const name = typeof n === 'object' ? n.name : n;
      if (name === 'SleepMode') { this._avrSleepModeImported = true; continue; }
      if (_AVR_FUNC_MAP[name]) {
        const _rt = _AVR_RETURN_TYPES[name];
        this.define(name, {
          ctype: _rt ?? 'void', funcName: _AVR_FUNC_MAP[name], varKind: 'const',
          _suppressVoidWarning: !!_rt,
        });
      } else {
        this.define(name, { ctype: '_avr_' + name, varKind: 'const', _isAvrObj: true, _avrName: name });
      }
    }
  },

  _handleStdFs(node) {
    if (node.namespace && node.names.length > 0) {
      this.define(node.names[0], { ctype: '__fs_namespace__', _isFsNamespace: true, varKind: 'const' });
    }
    this.classes.set('TscFileStat', { isStruct: true,
      fields: [{ name: 'size', ctype: 'int64_t' }, { name: 'isFile', ctype: 'bool' },
               { name: 'isDirectory', ctype: 'bool' }, { name: 'mtime', ctype: 'int64_t' }] });
  },

  _handleStdIo(node) {
    for (const n of (node.names ?? [])) {
      const nm = typeof n === 'object' ? n.name : n;
      if (nm === 'Reader') {
        if (!this._emittedReaderVtable) {
          this._emittedReaderVtable = true;
          this._ensureArrayStruct('Array_u8', 'uint8_t');
          this.typedefs.push('');
          this.addTop('typedef struct {');
          this.addTop('    size_t (*read)(void *self, uint8_t *buf, size_t len);');
          this.addTop('} Reader_vtable;');
          this.addTop('typedef struct { void *self; const Reader_vtable *vtable; } Reader;');
          this.addTop('');
        }
        this.classes.set('Reader', { isStruct: true, _isVtable: true, _vtableKind: 'Reader',
          fields: [{ name: 'self', ctype: 'void *' }, { name: 'vtable', ctype: 'const Reader_vtable *' }] });
      }
      if (nm === 'Writer') {
        if (!this._emittedWriterVtable) {
          this._emittedWriterVtable = true;
          this._ensureArrayStruct('Array_u8', 'uint8_t');
          this.typedefs.push('');
          this.addTop('typedef struct {');
          this.addTop('    size_t (*write)(void *self, const uint8_t *buf, size_t len);');
          this.addTop('} Writer_vtable;');
          this.addTop('typedef struct { void *self; const Writer_vtable *vtable; } Writer;');
          this.addTop('');
        }
        this.classes.set('Writer', { isStruct: true, _isVtable: true, _vtableKind: 'Writer',
          fields: [{ name: 'self', ctype: 'void *' }, { name: 'vtable', ctype: 'const Writer_vtable *' }] });
      }
    }
  },

  _handleStdReactive(node) {
    this._reactiveClosureCount = 0;
    this._capturedSignalMap = new Map();
  },

  _handleStdNet(node) {
    this.classes.set('TscResponse', {
      isStruct: true,
      fields: [{ name: 'ok', ctype: 'bool' }, { name: 'status', ctype: 'int32_t' }],
    });
  },

  _handleStdLibc(node) {
    for (const n of (node.names ?? [])) {
      const nm = typeof n === 'object' ? n.name : n;
      const isVar = _LIBC_VARIADIC.has(nm);
      this.define(nm, { ctype: 'int32_t', funcName: nm, params: null, _isLibcFunc: true, _isLibcVariadic: isVar });
    }
  },
};
