// @ts-nocheck — Stage 6: mixin file, types added in Stage 8
// class.js
export default {
  visitClassDecl(node) {
    const { name, superClass, members, decorators, typeParams } = node;
    const cname = this._modulePrefix ? this._modulePrefix + name : name;
    // Generic class: store as template
    if (typeParams?.length > 0) {
      this._genericClasses.set(name, node);
      return;
    }

    // Reserved prefix check (runs before PascalCase to give precise message)
    for (const pfx of ['ref_', 'mut_', 'arc_', 'weak_', 'opt_', 'Array_']) {
      if (name.startsWith(pfx)) {
        throw this.error(`type name "${name}" uses reserved prefix "${pfx}"`, node);
      }
    }
    // PascalCase invariant check (skip built-in/internal names)
    if (name.length > 0 && name[0] >= 'a' && name[0] <= 'z') {
      throw this.error(`class name "${name}" must start with uppercase (PascalCase)`, node);
    }

    // @readonly on methods is invalid
    for (const m of (node.members ?? [])) {
      if (m.kind === 'Method' && (m.decorators ?? []).some(d => d.name === 'readonly')) {
        throw this.error(`"@readonly" can only be applied to properties`, m);
      }
    }

    // Collect extra fields from class decorators (@sealed → target._field = val)
    const _classDecoratorFields = [];   // extra fields to add to struct
    const _classDecoratorInits  = [];   // statements to run after new ClassName()
    for (const d of (decorators ?? [])) {
      if (['struct', 'pool', 'heap', 'packed', 'align'].includes(d.name)) continue;
      const decFn = this._decoratorFns?.get(d.name);
      if (decFn) {
        const { fields: df, inits: di } = this._analyzeClassDecorator(decFn);
        _classDecoratorFields.push(...df);
        _classDecoratorInits.push(...di);
      }
    }

    // Process @embedded.* decorators
    const inlineDec = decorators?.find(d => d.name === 'struct');
    const poolDec   = decorators?.find(d => d.name === 'pool');
    const isEmbedded = this._cap('allocator') !== 'heap';

    if (inlineDec && !isEmbedded) {
      throw this.error(`Warning: @struct on '${name}' has no effect on non-embedded platform; annotation ignored`, node);
    }
    // @pool: require numeric capacity arg
    if (poolDec) {
      const poolSizeArg = poolDec.args?.[0];
      if (!poolSizeArg || poolSizeArg.kind !== 'Literal') {
        throw this.error(`TypeError: @pool requires a numeric capacity argument; use @pool(N)`, node);
      }
    }

    // @heap: only valid on allocator: "heap"
    const heapDec = decorators?.find(d => d.name === 'heap');
    if (heapDec && this._allocatorName === 'static') {
      throw this.error(`@heap class is not supported on allocator "static"; use @pool(N) for static-backing, or switch to allocator "heap"`, node);
    }
    if (heapDec && poolDec) {
      throw this.error(`@heap and @pool are mutually exclusive; use one allocation strategy`, node);
    }
    if (heapDec && inlineDec) {
      throw this.error(`@heap and @struct are mutually exclusive; use one allocation strategy`, node);
    }
    if (heapDec && this._classHasInheritance(superClass, name)) {
      throw this.error(`@heap class cannot have inheritance (no @heap + extends)`, node);
    }
    if (inlineDec && isEmbedded) {
      const badMethods = members.filter(m => m.kind === 'Method' && m.name !== 'constructor' && m.body?.body?.length > 0);
      if (badMethods.length > 0) {
        throw this.error(`TypeError: @struct class '${name}' cannot have non-trivial methods; remove '${badMethods[0].name}()' or use a regular class`, node);
      }
    }

    // Process @packed and @align decorators
    const packedDec = decorators?.find(d => d.name === 'packed');
    const alignDec  = decorators?.find(d => d.name === 'align');
    if (packedDec && alignDec) {
      throw this.error('@packed and @align cannot be used together');
    }
    let structAttr = '';
    if (packedDec) {
      structAttr = ' __attribute__((packed))';
    } else if (alignDec) {
      const alignVal = alignDec.args?.[0];
      const alignN = alignVal?.kind === 'Literal' ? Number(alignVal.value) : 0;
      if (!alignN || (alignN & (alignN - 1)) !== 0) {
        throw this.error('@align argument must be a power of two');
      }
      structAttr = ` __attribute__((aligned(${alignN})))`;
    }

    const allFields_ = members.filter(m => m.kind === 'Field');
    const methods = members.filter(m => m.kind === 'Method');
    const seen = new Set();
    for (const m of [...allFields_, ...methods]) {
      const n = typeof m.name === 'string' ? m.name : null;
      if (n && seen.has(n)) {
        throw this.error(`duplicate member "${n}" in class "${name}"`, m);
      }
      if (n) seen.add(n);
    }
    const throwsInfo = this._throwsClasses?.get(name);
    const isThrowsClass = !!throwsInfo;

    // For throws classes: replace 'message' field with TscError _base
    let fields = allFields_;
    let effectiveSuperClass = superClass;
    if (isThrowsClass) {
      // Always treat as if extending Error (TscError _base)
      effectiveSuperClass = 'Error';
      // Remove 'message' field — it's replaced by _base.message via TscError
      fields = allFields_.filter(f => f.name !== 'message');
    }

    // Register as struct (isStruct:true allows const qualifier in VarDecl)
    const implements_ = node.implements_ ?? [];
    // Detect implements Iterable<T> and extract element type
    const _ifaceName = (iface) => typeof iface === 'string' ? iface : iface.name;
    let _iterableElemType = null;
    for (const iface of implements_) {
      if (_ifaceName(iface) === 'Iterable' && typeof iface === 'object' && iface.typeArgs?.[0]) {
        _iterableElemType = this.resolveType(iface.typeArgs[0]);
        break;
      }
    }
    const _classEntry = { fields, methods, superClass: effectiveSuperClass, isStruct: true, implements_,
      ...(cname !== name ? { _cname: cname } : {}),
      ...(isThrowsClass ? { _isThrowsClass: true } : {}),
      ...(_classDecoratorInits.length > 0 ? { _decoratorInits: _classDecoratorInits } : {}),
      ...(_iterableElemType ? { _iterableElemType } : {}),
      ...(heapDec ? { _isHeap: true } : {}) };
    this.classes.set(cname, _classEntry);
    // Also register under original name so local TypeRef resolution works
    if (cname !== name) this.classes.set(name, _classEntry);

    // Map TSClang base class names → C names
    const cBase = effectiveSuperClass === 'Error' ? 'TscError' : effectiveSuperClass;

    // Check if this class is used as Arc<T> or Weak<T>
    const arcInfo = this._arcClasses?.get(name);

    // All-static class with no fields → skip struct unless class name used as a type
    const _allStatic = methods.length > 0 && methods.every(m => m.modifiers.includes('static'));
    const _hasUserFields = fields.length > 0 || cBase;
    const _usedAsType = !_allStatic || _hasUserFields || (() => {
      const scanType = (node) => {
        if (!node || typeof node !== 'object') return false;
        if (Array.isArray(node)) return node.some(scanType);
        if (node.kind === 'TypeRef' && node.name === name) return true;
        return Object.values(node).some(v => v && typeof v === 'object' ? scanType(v) : false);
      };
      return methods.some(m => scanType(m.returnType) || (m.params ?? []).some(p => scanType(p.typeAnn)));
    })();

    if (_usedAsType) {
      // Build field list (single-line struct always)
      const userFieldParts = [];
      if (cBase) userFieldParts.push(`${cBase} _base;`);
      for (const f of fields) {
        // Ref<T>/Mut<T> cannot be stored in class fields
        if (f.typeAnn?.kind === 'TypeRef' && (f.typeAnn.name === 'Ref' || f.typeAnn.name === 'Mut')) {
          throw this.error(`"${f.typeAnn.name}<T>" cannot be stored in a class field`);
        }
        if (f.typeAnn?.kind === 'TypeRef' && f.typeAnn.name === 'never') {
          throw this.error(`"never" cannot be used as a field type`);
        }
        const isReadonly = (f.decorators ?? []).some(d => d.name === 'readonly');
        const ct = f.typeAnn ? this.resolveType(f.typeAnn) : 'int32_t';
        const constPfx = isReadonly ? 'const ' : '';
        if (ct.endsWith(' *')) userFieldParts.push(`${constPfx}${ct.slice(0, -2)} *${f.name};`);
        else userFieldParts.push(`${constPfx}${ct} ${f.name};`);
      }
      // Fields from class decorators (e.g., @sealed adds _sealed: bool)
      for (const { fieldDecl } of _classDecoratorFields) userFieldParts.push(fieldDecl);

      if (arcInfo) {
        const arcPre = arcInfo.refFirst ? [
          ...(arcInfo.arc || arcInfo.weak ? ['int32_t _refcount;', 'int32_t _weakcount;'] : []),
        ] : [];
        const arcPost = arcInfo.refFirst ? [] : [
          ...(arcInfo.arc || arcInfo.weak ? ['int32_t _refcount;', 'int32_t _weakcount;'] : []),
        ];
        const allArcFields = [...arcPre, ...userFieldParts, ...arcPost];
        const isSelfRef = fields.some(f => {
          const ct = f.typeAnn ? this.resolveType(f.typeAnn) : '';
          return ct.includes(name + ' *') || ct.includes(name + '*');
        });
        if (isSelfRef) {
          this.addTop(`typedef struct ${cname} ${cname};`);
          this.addTop(`struct ${cname} { ${allArcFields.join(' ')} };`);
        } else {
          this.addTop(`typedef struct { ${allArcFields.join(' ')} } ${cname};`);
        }
      } else {
        const isSelfRef = fields.some(f => {
          const ct = f.typeAnn ? this.resolveType(f.typeAnn) : '';
          return ct.includes(name + ' *') || ct.includes(name + '*');
        });
        const fieldContent = userFieldParts.length > 0 ? userFieldParts.join(' ') : 'int _dummy;';
        if (isSelfRef) {
          this.addTop(`typedef struct ${cname} ${cname};`);
          this.addTop(`struct${structAttr} ${cname} { ${fieldContent} };`);
        } else {
          this.addTop(`typedef struct${structAttr} { ${fieldContent} } ${cname};`);
        }
      }

      // For throws classes: emit _new function directly to typedefs (so it appears between
      // the struct typedef and the Result typedefs emitted in visitFuncDecl).
      if (isThrowsClass && throwsInfo.needsNew) {
        const hasStack = throwsInfo.hasStack;
        let newBody = `${cname} s = {0}; s._base.message = msg;`;
        if (hasStack) newBody += ` s.stack = tsc_capture_stack();`;
        newBody += ` return s;`;
        this.typedefs.push(`static ${cname} ${cname}_new(String msg) { ${newBody} }`);
        this.typedefs.push('');  // blank after _new, before Result typedef
        this._lastAddedToTypedefs = false;  // next addTop('') won't be swallowed
      } else {
        this.addTop('');  // blank after struct (no _new)
      }
    }

    // For throws classes: skip normal constructor handling (we emitted _new above)
    if (isThrowsClass) {
      // Emit non-constructor methods only
      const explicitImplements = node.implements_ ?? [];
      for (const m of methods) {
        if (m.name === 'constructor') continue;
        const isStatic = m.modifiers.includes('static');
        this.emitMethod(cname, m, isStatic, explicitImplements);
      }
      for (const ifaceName of explicitImplements) this.emitVtableConstant(cname, ifaceName);
      return;
    }

    // Constructor if present
    const ctor = methods.find(m => m.name === 'constructor');
    if (ctor) {
      if (ctor.decorators?.length > 0) {
        throw this.error('decorators on constructors are not supported', ctor);
      }
      // Check that all fields are unconditionally assigned in the constructor
      if (fields.length > 0 && ctor.body) {
        const unconditional = new Set();
        const stmts = ctor.body.body ?? ctor.body;
        for (const stmt of stmts) {
          if (stmt.kind === 'ExprStmt' &&
              stmt.expr?.kind === 'Assign' &&
              stmt.expr.left?.kind === 'Member' &&
              stmt.expr.left.object?.kind === 'Ident' &&
              stmt.expr.left.object.name === 'this') {
            unconditional.add(stmt.expr.left.prop);
          }
        }
        for (const f of fields) {
          if (!unconditional.has(f.name)) {
            throw this.error(`field "${f.name}" may not be initialized on all paths in constructor`);
          }
        }
      }
      this.emitMethod(cname, { ...ctor, name: 'new', isStatic: true, returnTypeOverride: cname }, true);
    }

    // Emit Iterable<T> impl before methods (iter() will be skipped below)
    const _ifaceName2 = (iface) => typeof iface === 'string' ? iface : iface.name;
    const classInfo_ = this.classes.get(cname);
    if (classInfo_?._iterableElemType) {
      const iterMethod_ = methods.find(m => m.name === 'iter' || m.isIterator);
      if (iterMethod_) this._emitIterableImpl(cname, iterMethod_, classInfo_._iterableElemType);
    }

    // Methods: emit with explicit-implements style (void *_self) when class has non-Iterable implements
    const explicitImplements = (node.implements_ ?? []).filter(i => _ifaceName2(i) !== 'Iterable');
    for (const m of methods) {
      if (m.name === 'constructor') continue;
      if ((m.name === 'iter' || m.isIterator) && classInfo_?._iterableElemType) continue; // handled by _emitIterableImpl
      const platformDec = (m.decorators ?? []).find(d => d.name === 'platform');
      if (platformDec) {
        const allowed = (platformDec.args ?? []).map(a => a.value ?? a);
        const target = this._targetName ?? 'desktop';
        if (!allowed.includes(target)) {
          if (!this._platformSkipped) this._platformSkipped = new Map();
          this._platformSkipped.set(`${cname}.${m.name}`, allowed);
          continue;
        }
      }
      const isStatic = m.modifiers.includes('static');
      const mDecs = (m.decorators ?? []).filter(d => this._decoratorFns?.has(d.name));
      if (mDecs.length > 0) {
        this._emitDecoratedMethod(cname, m, isStatic, explicitImplements, mDecs);
      } else {
        this.emitMethod(cname, m, isStatic, explicitImplements);
      }
    }

    // Emit vtable constants for each explicitly implemented interface
    for (const ifaceName of explicitImplements) {
      this.emitVtableConstant(cname, ifaceName);
    }

    // @pool: generate pool array, mask (alloc/drop emitted lazily)
    if (poolDec) {
      this._emitPoolClass(cname, poolDec, node);
    }
    // @heap: mark class for heap allocation
    if (heapDec) {
      this._markHeapClass(cname, node);
    }
    // Mark class as inline value type
    if (inlineDec && isEmbedded) {
      const cls = this.classes.get(cname);
      if (cls) cls._isInline = true;
    }
  },

  _emitPoolClass(name, poolDec, node) {
    const poolSize = parseInt(poolDec.args[0].value);
    const poolVar  = `_${name.toLowerCase()}_pool`;
    const maskVar  = `_${name.toLowerCase()}_pool_mask`;
    const optType  = `opt_ref_${name}`;
    const allocFn  = `${name}_alloc`;
    const dropFn   = `${name}_drop`;
    let maskType;
    if      (poolSize <= 8)  maskType = 'uint8_t';
    else if (poolSize <= 16) maskType = 'uint16_t';
    else if (poolSize <= 32) maskType = 'uint32_t';
    else if (poolSize <= 64) maskType = 'uint64_t';
    else {
      throw this.error(`TypeError: @pool(N) supports a maximum of 64 instances; got N=${poolSize}`, node);
    }

    // Always emit pool storage
    this.addTop(`static ${name} ${poolVar}[${poolSize}];`);
    this.addTop(`static ${maskType} ${maskVar} = 0;`);
    this.addTop('');

    // Mark in classes map — alloc/drop emitted lazily
    const cls = this.classes.get(name);
    if (cls) {
      cls._isPool = true; cls._poolSize = poolSize; cls._poolOptType = optType;
      cls._poolAllocFn = allocFn; cls._poolDropFn = dropFn; cls._poolMaskVar = maskVar;
      cls._poolVar = poolVar; cls._poolMaskType = maskType;
    }
  },

  _ensurePoolAlloc(className) {
    const cls = this.classes.get(className);
    if (!cls?._isPool || cls._poolAllocEmitted) return;
    cls._poolAllocEmitted = true;
    const { _poolOptType: optType, _poolAllocFn: allocFn, _poolVar: poolVar,
            _poolMaskVar: maskVar, _poolSize: poolSize, _poolMaskType: maskType } = cls;
    this.addTop(`typedef struct { bool has_value; ${className} *value; int _pool_idx; } ${optType};`);
    this.addTop('');
    this.addTop(`static ${optType} ${allocFn}(void) {`);
    this.addTop(`    for (int _i = 0; _i < ${poolSize}; _i++) {`);
    this.addTop(`        if (!(${maskVar} & ((${maskType})1 << _i))) {`);
    this.addTop(`            ${maskVar} |= ((${maskType})1 << _i);`);
    this.addTop(`            return (${optType}){true, &${poolVar}[_i], _i};`);
    this.addTop(`        }`);
    this.addTop(`    }`);
    this.addTop(`    return (${optType}){false, NULL, -1};`);
    this.addTop(`}`);
    this.addTop('');
  },

  _ensurePoolDrop(className) {
    const cls = this.classes.get(className);
    if (!cls?._isPool || cls._poolDropEmitted) return;
    this._ensurePoolAlloc(className); // drop requires alloc
    cls._poolDropEmitted = true;
    const { _poolOptType: optType, _poolDropFn: dropFn, _poolMaskVar: maskVar, _poolMaskType: maskType } = cls;
    const param = className[0].toLowerCase();
    this.addTop(`static void ${dropFn}(${optType} ${param}) {`);
    this.addTop(`    if (${param}.has_value) ${maskVar} &= ~((${maskType})1 << ${param}._pool_idx);`);
    this.addTop(`}`);
    this.addTop('');
  },

  _markHeapClass(name, node) {
    const cls = this.classes.get(name);
    if (cls) {
      cls._heapClassName = name;
      // Register for runtime malloc include
      this.includes.add('#include <stdlib.h>');
    }
  },

  _ensureHeapDestructor(className) {
    const cls = this.classes.get(className);
    if (!cls?._isHeap || cls._heapDestructorEmitted) return;
    cls._heapDestructorEmitted = true;
    const dtorFn = `${className}_destructor`;
    const param = className[0].toLowerCase();
    this.addTop(`static void ${dtorFn}(${className} *${param}) {`);
    // Release string fields (auto-generated)
    if (cls.fields) {
      for (const f of cls.fields) {
        if (f.typeAnn?.kind === 'TypeRef' && f.typeAnn.name === 'string') {
          this.addTop(`    tsc_string_release(&${param}->${f.name});`);
        }
      }
    }
    this.addTop(`}`);
    this.addTop('');
  },

  _classHasInheritance(cBase) {
    return cBase != null;
  },

  emitVtableConstant(className, ifaceName, classNode = null) {
    const ifaceDef = this.interfaces.get(ifaceName);
    if (!ifaceDef) return;
    const ifaceMethods = ifaceDef.filter(m => m.kind === 'MethodSig');
    if (ifaceMethods.length === 0) return;
    // Verify all interface methods are implemented
    const classDef = this.classes.get(className);
    for (const im of ifaceMethods) {
      const methodExists = classDef?.methods?.some(mm => mm.name === im.name);
      if (!methodExists) {
        throw this.error(`class "${className}" does not implement method "${im.name}" from interface "${ifaceName}"`);
      }
    }
    const vtableName = `${className}_${ifaceName}_vtable`;
    const entries = ifaceMethods.map(m => {
      return `    .${m.name} = ${className}_${m.name}`;
    }).join(',\n');
    this.addTop(`static const ${ifaceName}_vtable ${vtableName} = { ${ifaceMethods.map(m => `.${m.name} = ${className}_${m.name}`).join(', ')} };`);
    this.addTop('');
  },

  _getStringFields(className) {
    const cls = this.classes.get(className);
    if (!cls?.fields) return [];
    const result = [];
    for (const f of cls.fields) {
      const fname = typeof f === 'string' ? f : (f.name ?? f);
      const ftype = f.typeAnn ? this.resolveType(f.typeAnn) : 'int32_t';
      if (ftype === 'String') result.push(fname);
    }
    return result;
  },

  _ensureClassFree(className) {
    const cls = this.classes.get(className);
    if (!cls || cls._classFreeEmitted) return;
    const stringFields = this._getStringFields(className);
    if (stringFields.length === 0) return;
    cls._classFreeEmitted = true;
    cls._stringFields = stringFields;
    const freeFn = `${className}_free`;
    cls._classFreeFn = freeFn;
    this.addTop(`static void ${freeFn}(${className} *self) {`);
    this.addTop(`    if (!self) return;`);
    for (const fname of stringFields) {
      this.addTop(`    tsc_string_release(self->${fname});`);
    }
    this.addTop(`}`);
    this.addTop('');
  },

  // ----------------------------------------------------------------
};
