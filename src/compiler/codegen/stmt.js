// stmt.js
export default {
  visitBlock(block, lines, depth) {
    this.pushScope();
    for (const s of block.body) this.visitStmt(s, lines, depth);
    this.popScope();
  },

  visitStmtInMain(node) {
    const lines = [];
    this.visitStmt(node, lines, 0);
    for (const l of lines) this.mainStmts.push(l);
  },

  visitStmt(node, lines, depth) {
    const I = ' '.repeat(this.indent * depth);  // indentation at current depth
    const p = (s) => lines.push(I + s);          // push with current-depth indent
    if (!node) return;

    switch (node.kind) {
      case 'VarDecl': {
        const { varKind, name, typeAnn, init } = node;

        // Object.fromEntries<{a: T, b: U}>(array) → compile-time struct init
        if (init?.kind === 'Call' &&
            init.callee?.kind === 'Member' &&
            init.callee?.object?.name === 'Object' &&
            init.callee?.prop === 'fromEntries' &&
            init.typeArgs?.[0]?.kind === 'TypeObject') {
          const typeArg = init.typeArgs[0];
          const fields = typeArg.fields;
          const fieldNames = fields.map(f => f.name);
          if (!this._fromEntriesCount) this._fromEntriesCount = 0;
          const structName = `_fromEntries_${this._fromEntriesCount++}`;
          const fieldDecls = fields.map(f => `${this.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${structName};`);
          this.classes.set(structName, { isStruct: true, fields });
          const arg = init.args[0]?.expr;
          let entriesElems = null;
          let isVar = false;
          if (arg?.kind === 'ArrayLit') {
            entriesElems = arg.elems;
          } else if (arg?.kind === 'Ident') {
            const consumed = this._fromEntriesConsumed?.get(arg.name);
            if (consumed) {
              // Emit entries typedefs now (after fromEntries struct, to match expected order)
              const et = this.resolveType(consumed.typeAnn.element);
              this.resolveType(consumed.typeAnn); // emits Array_tuple
              entriesElems = consumed.init?.kind === 'ArrayLit' ? consumed.init.elems : null;
            } else {
              const sym = this.lookup(arg.name);
              if (sym?.initNode?.kind === 'ArrayLit') entriesElems = sym.initNode.elems;
            }
            isVar = true;
          }
          const initParts = [];
          for (const elem of (entriesElems ?? [])) {
            const pair = elem.expr;
            if (pair?.kind !== 'ArrayLit' || pair.elems?.length < 2) continue;
            const keyNode = pair.elems[0]?.expr;
            const valNode = pair.elems[1]?.expr;
            if (keyNode?.kind !== 'Literal' || keyNode.litType !== 'string') continue;
            const key = keyNode.value;
            if (!fieldNames.includes(key)) throw new Error(`Object.fromEntries: key "${key}" is not a field of the target type`);
            initParts.push(`.${key} = ${this.exprToC(valNode, lines, depth)}`);
          }
          if (isVar) {
            p(`${structName} ${name} = {0};`);
            p(`${name} = (${structName}){${initParts.join(', ')}};`);
          } else {
            p(`${structName} ${name} = {${initParts.join(', ')}};`);
          }
          this.define(name, { ctype: structName, varKind });
          break;
        }

        // If consumed by fromEntries (Ident arg), defer all processing — no C emit, no typedefs yet
        if (this._fromEntriesConsumed?.has(name) && typeAnn?.kind === 'TypeArray') {
          this._fromEntriesConsumed.set(name, { typeAnn, init });
          this.define(name, { ctype: 'void', isArray: true, varKind, initNode: init });
          break;
        }

        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'never') {
          throw new Error(`"never" cannot be used as a variable type`);
        }
        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'void') {
          throw new Error(`"void" can only be used as a return type`);
        }
        let ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'double');
        // Untyped number literals: integer → int32_t, float/decimal → double
        if (!typeAnn && init && init.kind === 'Literal' && init.litType === 'number') {
          const v = init.value;
          ctype = (v.includes('.') || v.includes('e') || v.includes('E')) ? 'double' : 'int32_t';
        }
        // ObjLit with named fields and no type annotation → anonymous struct
        if (!typeAnn && init?.kind === 'ObjLit' && init.props?.length > 0 && init.props.every(p => !p.spread && !p.computed)) {
          if (!this._anonStructCount) this._anonStructCount = 0;
          const anonName = `_anon_${this._anonStructCount++}`;
          const fields = init.props.map(p => {
            const ft = this.inferType(p.value);
            return { name: p.key, typeAnn: { kind: 'TypeRef', name: ft, typeArgs: [] }, _ctype: ft };
          });
          const fieldDecls = fields.map(f => `${f._ctype} ${f.name};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${anonName};`);
          this.classes.set(anonName, { isStruct: true, fields });
          ctype = anonName;
        }
        // Regular (non-const) enums, opt types, and structs don't use const qualifier in C
        const enumDef2 = this.classes.get(ctype);
        const isGenericClassInst = !enumDef2 && this._genericClasses &&
          [...this._genericClasses.keys()].some(n => ctype.startsWith(n + '_'));
        const suppressConst = (enumDef2?.isEnum && !enumDef2?.isConst && !enumDef2?.isStringLiteralUnion) || enumDef2?.isKeyOf || enumDef2?.isMutable || ctype.startsWith('opt_') || ctype.startsWith('_anon_') || (enumDef2 && !enumDef2.isEnum && !enumDef2.isStruct && !enumDef2.isScalarAlias && !enumDef2.isTuple) || isGenericClassInst;
        const qualifier = (varKind === 'const' && !suppressConst) ? 'const ' : '';

        // Optional type (opt_T): handle null/value init
        if (ctype.startsWith('opt_') && init) {
          const isNullInit = init.kind === 'Literal' && init.litType === 'null';
          if (isNullInit) {
            p(`${qualifier}${ctype} ${name} = {false, 0};`);
          } else {
            const valC = this.exprToC(init, lines, depth);
            // If init already evaluates to opt_T (e.g., from x?.toString()), assign directly
            const initType = this.inferType(init);
            if (initType === ctype) {
              p(`${qualifier}${ctype} ${name} = ${valC};`);
            } else {
              p(`${qualifier}${ctype} ${name} = {true, ${valC}};`);
            }
          }
          // Non-negative at() index: mark as potentially OOB (null check when printing)
          // Must be read AFTER exprToC(init) which sets _lastAtNonNeg
          const atNonNeg = this._lastAtNonNeg ?? false;
          this._lastAtNonNeg = undefined;
          this.define(name, { ctype, varKind, optIsNull: isNullInit || atNonNeg });
          break;
        }

        // String literal union: handle string literal init → enum value
        if (enumDef2?.isStringLiteralUnion && init?.kind === 'Literal' && init.litType === 'string') {
          const val = init.value;
          if (!enumDef2.members.includes(val)) {
            throw new Error(`"${val}" is not a valid value for type ${ctype}`);
          }
          p(`${qualifier}${ctype} ${name} = ${ctype}_${val};`);
          this.define(name, { ctype, varKind });
          break;
        }

        // TypeArray of primitive with ArrayLit init → plain C array (no const — C arrays can't be reassigned anyway)
        if (typeAnn?.kind === 'TypeArray' && typeAnn.element?.kind !== 'TypeFunc' && init) {
          const et = this.resolveType(typeAnn.element);
          if (init.kind === 'ArrayLit') {
            const elems = this.arrayLitToC(init, et, lines, depth);
            p(`${et} ${name}[] = {${elems.join(', ')}};`);
          } else {
            const initC = this.exprToC(init, lines, depth);
            p(`${et} ${name}[] = ${initC};`);
          }
          this.define(name, { ctype: et, isArray: true, arraySize: init.kind === 'ArrayLit' ? this.arrayLitSize(init) : -1, varKind, initNode: init });
          break;
        }

        // Tuple init: let pair: [i32, string] = [1, "hello"] → struct init
        {
          const tupleDef1 = this.classes.get(ctype);
          if (tupleDef1?.isTuple && init?.kind === 'ArrayLit') {
            const initParts = [];
            let fieldIdx = 0;
            for (const el of init.elems) {
              if (el.spread) {
                // spread: [...p] → copy all fields
                const spreadSrc = this.exprToC(el.expr, lines, depth);
                const srcType = this.inferType(el.expr);
                const srcDef = this.classes.get(srcType);
                const tupleHasRest = tupleDef1.fields.some(f => f.rest);
                if (!srcDef?.isTuple && !tupleHasRest) {
                  throw new Error('cannot spread runtime array into fixed-size tuple');
                }
                if (srcDef?.isTuple) {
                  for (const f of srcDef.fields) {
                    initParts.push(`.${tupleDef1.fields[fieldIdx].name} = ${spreadSrc}.${f.name}`);
                    fieldIdx++;
                  }
                }
                continue;
              }
              const field = tupleDef1.fields[fieldIdx++];
              if (!field) continue;
              // Rest field: collect remaining elems into a temp array
              if (field.rest) {
                const tailElems = [el, ...init.elems.slice(init.elems.indexOf(el) + 1)];
                const tailVar = `_tail_${this.tempCount++}`;
                const tailVals = tailElems.map(e => this.exprToC(e.expr, lines, depth)).join(', ');
                lines.push(`${field.elemType} ${tailVar}[] = {${tailVals}};`);
                initParts.push(`.${field.name} = ${tailVar}`);
                // Skip tail_len field — add length directly
                fieldIdx++; // skip _tail_len field
                initParts.push(`._tail_len = ${tailElems.length}`);
                break; // rest consumes all remaining elements
              }
              const valC = this.exprToC(el.expr, lines, depth);
              // Optional field: wrap non-opt value in {true, val}
              if (field.ctype.startsWith('opt_')) {
                const valType = this.inferType(el.expr);
                const initVal = (valType === field.ctype) ? valC : `{true, ${valC}}`;
                initParts.push(`.${field.name} = ${initVal}`);
              } else {
                initParts.push(`.${field.name} = ${valC}`);
              }
            }
            // Fill remaining optional fields with {false, 0}
            while (fieldIdx < tupleDef1.fields.length) {
              const field = tupleDef1.fields[fieldIdx++];
              if (field.ctype.startsWith('opt_')) initParts.push(`.${field.name} = {false, 0}`);
            }
            p(`${qualifier}${ctype} ${name} = {${initParts.join(', ')}};`);
            // Track which optional fields were not provided (null)
            const nullOptFields = new Set();
            for (let i = init.elems.length; i < tupleDef1.fields.length; i++) {
              const f = tupleDef1.fields[i];
              if (f.ctype.startsWith('opt_')) nullOptFields.add(f.name);
            }
            this.define(name, { ctype, varKind, nullOptFields: nullOptFields.size > 0 ? nullOptFields : null });
            break;
          }
        }

        // TypeFunc (or TypeArray of TypeFunc): function pointer declaration
        if (typeAnn?.kind === 'TypeFunc' || (typeAnn?.kind === 'TypeArray' && typeAnn.element?.kind === 'TypeFunc')) {
          let initC;
          if (init?.kind === 'ArrayLit') {
            // {square_i32, ...} — resolve each element as function ref
            const elems = init.elems.map(e => {
              if (e.expr?.kind === 'Ident') {
                const s = this.lookup(e.expr.name);
                return s?.funcName ?? e.expr.name;
              }
              return this.exprToC(e.expr, lines, depth);
            });
            initC = `{${elems.join(', ')}}`;
          } else {
            initC = init ? this.exprToC(init, lines, depth) : '0';
          }
          p(`${this.typeDecl(typeAnn, name)} = ${initC};`);
          this.define(name, { ctype: 'void *', funcPtr: true, varKind });
          break;
        }

        if (init) {
          // Special: arrow function → capture as function pointer
          if (init.kind === 'Arrow') {
            const lambdaName = this.hoistArrow(init, ctype, name);
            // Function pointers don't use const qualifier on the return type
            p(`${ctype} (*${name})(${this.arrowParamTypes(init)}) = ${lambdaName};`);
          } else if (!typeAnn && init.kind === 'Ident') {
            // Possibly a function reference — check symbol table
            const sym = this.lookup(init.name);
            if (sym?.funcName && sym?.params) {
              const pts = sym.params.filter(pp => !pp.rest).map(pp => pp.typeAnn ? this.resolveType(pp.typeAnn) : 'void *');
              p(`${sym.ctype} (*${name})(${pts.join(', ') || 'void'}) = ${sym.funcName};`);
              this.define(name, { ctype: sym.ctype, funcPtr: true, varKind, funcName: sym.funcName });
              break;
            }
            p(`${this.varDecl(qualifier, ctype, name)} = ${this.exprToC(init, lines, depth)};`);
          } else if (init.kind === 'ObjLit' && enumDef2?.isPartial) {
            // Partial<T> ObjLit: expand { name: "Alice" } → { .has_name = true, .name = ..., .has_age = false }
            const provided = new Map();
            for (const prop of init.props) {
              if (!prop.spread && !prop.computed) {
                provided.set(prop.key, this.exprToC(prop.value, lines, depth));
              }
            }
            const initParts = [];
            for (const f of enumDef2.fields ?? []) {
              const fname = typeof f === 'string' ? f : f.name;
              if (provided.has(fname)) {
                initParts.push(`.has_${fname} = true`);
                initParts.push(`.${fname} = ${provided.get(fname)}`);
              } else {
                initParts.push(`.has_${fname} = false`);
              }
            }
            p(`${this.varDecl(qualifier, ctype, name)} = {${initParts.join(', ')}};`);
          } else {
            // Check if init is a Call whose callee returns a TypeFunc
            let callSym = null;
            if (init.kind === 'Call' && init.callee.kind === 'Ident') {
              callSym = this.lookup(init.callee.name);
            }
            if (!typeAnn && callSym?.returnType?.kind === 'TypeFunc') {
              const initC = this.exprToC(init, lines, depth);
              p(`${this.typeDecl(callSym.returnType, name)} = ${initC};`);
              this.define(name, { ctype: 'void *', funcPtr: true, varKind });
              break;
            }
            let initC;
            if (init.kind === 'Literal' && init.litType === 'number') {
              initC = this.literalToCTyped(init, ctype);
            } else {
              // For binary expressions with mixed integer types in const context:
              // cast operands and result explicitly to preserve well-defined semantics
              let mixedBinary = null;
              if (typeAnn && init.kind === 'Binary') {
                mixedBinary = this.tryConstMixedBinary(init, ctype, lines, depth);
              }
              if (mixedBinary !== null) {
                initC = mixedBinary;
              } else if (ctype === 'int64_t' && init.kind === 'Binary') {
                // For binary expressions assigned to int64_t with u32 operands,
                // widen operands individually to avoid overflow before cast
                initC = this.binaryWidened(init, ctype, lines, depth);
              } else {
                // Evaluate init first — this may throw (e.g. mixed let int types in binary)
                initC = this.exprToC(init, lines, depth);
              }
              // Implicit type conversion checks for typed assignments (skip if already handled by mixedBinary)
              if (typeAnn && mixedBinary === null) {
                const srcType = this.inferType(init);
                // Cannot implicitly convert string literal union to string
                if (ctype === 'String') {
                  const srcEnumDef = this.classes.get(srcType);
                  if (srcEnumDef?.isStringLiteralUnion) {
                    throw new Error(`cannot implicitly convert ${srcType} to string: use ".toString()" or "as string"`);
                  }
                }
                const illegalConversions = [
                  ['size_t',    'int32_t',  'usize', 'i32'],
                  ['int32_t',   'float',    'i32',   'f32'],
                  ['int64_t',   'double',   'i64',   'f64'],
                  ['int64_t',   'uint32_t', 'i64',   'u32'],
                  ['uint64_t',  'int64_t',  'u64',   'i64'],
                ];
                for (const [src, dst, srcTs, dstTs] of illegalConversions) {
                  if (srcType === src && ctype === dst) {
                    throw new Error(`cannot implicitly convert ${srcTs} to ${dstTs}: use "as ${dstTs}"`);
                  }
                }
                // Widening casts for non-binary expressions
                if (ctype === 'int64_t' && srcType === 'size_t') {
                  initC = `(int64_t)${initC}`;
                }
              }
            }
            // Cross-struct assignment: const b: Pt2 = a (where a is a different struct type)
            if (init.kind === 'Ident') {
              const initSym = this.lookup(init.name);
              const srcDef = initSym ? this.classes.get(initSym.ctype) : null;
              const dstDef = this.classes.get(ctype);
              if (srcDef?.isStruct && dstDef?.isStruct && initSym.ctype !== ctype) {
                const qualCast = qualifier === 'const ' ? 'const ' : '';
                initC = `*(${qualCast}${ctype} *)&${initC}`;
              }
            }
            p(`${this.varDecl(qualifier, ctype, name)} = ${initC};`);
          }
        } else {
          // No initializer: declare without init
          p(`${this.varDecl(qualifier, ctype, name)};`);
        }
        // Store compile-time value for const variables with literal init (used for const-cast overflow checking)
        let constValue = undefined;
        if (varKind === 'const' && init?.kind === 'Literal' && init.litType === 'number') {
          try { constValue = BigInt(init.value.replace(/_/g, '')); } catch(_) {}
        }
        this.define(name, { ctype, varKind, constValue, initNode: init });
        break;
      }

      case 'VarDestructObj': {
        const { varKind, pattern, init } = node;
        const initC = this.exprToC(init, lines, depth);
        const tmpName = `_obj_${this.tempCount++}`;
        const objType = this.inferType(init);
        p(`${objType} ${tmpName} = ${initC};`);
        for (const { name, alias, defaultVal } of pattern) {
          const qual = varKind === 'const' ? 'const ' : '';
          if (defaultVal) {
            const dC = this.exprToC(defaultVal, lines, depth);
            p(`${qual}int32_t ${alias} = (${tmpName}.${name} != 0) ? ${tmpName}.${name} : ${dC};`);
          } else {
            p(`${qual}int32_t ${alias} = ${tmpName}.${name};`);
          }
          this.define(alias, { ctype: 'int32_t', varKind });
        }
        break;
      }

      case 'VarDestructArr': {
        const { varKind, pattern, init } = node;
        const initType = this.inferType(init);
        const tupleDef0 = this.classes.get(initType);
        const qual = varKind === 'const' ? 'const ' : '';
        if (tupleDef0?.isTuple) {
          // Tuple destructuring: const [a, b] = pair → typed field access
          const initC = this.exprToC(init, lines, depth);
          for (let i = 0; i < pattern.length; i++) {
            const elem = pattern[i];
            if (!elem) continue;
            const field = tupleDef0.fields[i];
            const ctype = field ? field.ctype.replace(' *', '') : 'int32_t'; // strip pointer for rest
            p(`${qual}${ctype} ${elem.name} = ${initC}._${i};`);
            this.define(elem.name, { ctype, varKind });
          }
        } else {
          const initC = this.exprToC(init, lines, depth);
          const tmpName = `_arr_${this.tempCount++}`;
          p(`__auto_type ${tmpName} = ${initC};`);
          for (let i = 0; i < pattern.length; i++) {
            const elem = pattern[i];
            if (!elem) continue;
            if (elem.rest) {
              p(`/* rest: ${elem.name} */`);
            } else {
              p(`${qual}int32_t ${elem.name} = ${tmpName}._${i};`);
              this.define(elem.name, { ctype: 'int32_t', varKind });
            }
          }
        }
        break;
      }

      case 'ExprStmt': {
        const c = this.exprToC(node.expr, lines, depth);
        if (c && c !== '') {
          // Block-form assignments (&&=, ||=, ??=) already include semicolons
          if ((c.startsWith('{') && c.endsWith('}')) || c.startsWith('if (')) p(c);
          else p(`${c};`);
        }
        break;
      }

      case 'Return': {
        if (node.value) {
          const c = this.exprToC(node.value, lines, depth);
          p(`return ${c};`);
        } else {
          p('return;');
        }
        break;
      }

      case 'If': {
        // Detect narrowing: if (x != null) → narrow x to x.value inside block
        const isNullLit = (n) => (n.kind === 'Literal' && n.litType === 'null') || (n.kind === 'Ident' && n.name === 'null');
        let narrowVar = null;
        if (node.test.kind === 'Binary' && (node.test.op === '!=' || node.test.op === '!==')) {
          const nullSide = isNullLit(node.test.right) ? 'right' : isNullLit(node.test.left) ? 'left' : null;
          if (nullSide) {
            const optSide = nullSide === 'right' ? node.test.left : node.test.right;
            if (optSide.kind === 'Ident') {
              const sym = this.lookup(optSide.name);
              if (sym?.ctype?.startsWith('opt_')) narrowVar = optSide.name;
            }
          }
        }
        const testC = this.exprToC(node.test, lines, depth);
        const alt = node.alternate;
        // Single statement consequent (no braces)?
        const hasBraces = node.consequent.kind === 'Block';
        if (narrowVar) {
          if (!this._narrowedVars) this._narrowedVars = new Set();
          this._narrowedVars.add(narrowVar);
        }
        if (hasBraces) {
          p(`if (${testC}) {`);
          this.visitBlock(node.consequent, lines, depth + 1);
        } else if (node.consequent.kind === 'ExprStmt') {
          // Inline: if (cond) expr;
          const exprC = this.exprToC(node.consequent.expr, lines, depth);
          p(`if (${testC}) ${exprC};`);
        } else {
          p(`if (${testC}) {`);
          this.visitStmt(node.consequent, lines, depth + 1);
          p('}');
        }
        if (alt) {
          // else if: collapse into single line
          if (alt.kind === 'If') {
            p('} else if (' + this.exprToC(alt.test, lines, depth) + ') {');
            this.visitStmtOrBlock(alt.consequent, lines, depth + 1);
            // recurse for chained else-if
            let cur = alt.alternate;
            while (cur) {
              if (cur.kind === 'If') {
                p('} else if (' + this.exprToC(cur.test, lines, depth) + ') {');
                this.visitStmtOrBlock(cur.consequent, lines, depth + 1);
                cur = cur.alternate;
              } else {
                p('} else {');
                this.visitStmtOrBlock(cur, lines, depth + 1);
                cur = null;
              }
            }
            p('}');
          } else {
            if (hasBraces) p('} else {');
            else p('} else {');  // wrap single stmt else in braces too
            this.visitStmtOrBlock(alt, lines, depth + 1);
            p('}');
          }
        } else if (hasBraces) {
          p('}');
        }
        if (narrowVar) this._narrowedVars.delete(narrowVar);
        break;
      }

      case 'Block': {
        p('{');
        this.visitBlock(node, lines, depth + 1);
        p('}');
        break;
      }

      case 'For': {
        let initC = '';
        if (node.init) {
          if (node.init.kind === 'VarDecl') {
            const { varKind, name, typeAnn, init } = node.init;
            const ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'int32_t');
            const initExpr = init ? this.exprToC(init, lines, depth) : '0';
            initC = `${ctype} ${name} = ${initExpr}`;
            this.define(name, { ctype, varKind });
          } else if (node.init.kind === 'ExprStmt') {
            initC = this.exprToC(node.init.expr, lines, depth);
          }
        }
        const testC = node.test ? this.exprToC(node.test, lines, depth) : '';
        const updC  = node.update ? this.exprToC(node.update, lines, depth) : '';
        p(`for (${initC}; ${testC}; ${updC}) {`);
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        p('}');
        break;
      }

      case 'ForOf': {
        const iterC = this.exprToC(node.iterable, lines, depth);
        const ivar = `_i_${this.tempCount++}`;
        let elemType = 'int32_t';
        if (node.binding.kind === 'Ident') {
          if (node.binding.typeAnn) elemType = this.resolveType(node.binding.typeAnn);
        }
        const qual = node.varKind === 'const' ? 'const ' : '';
        const bindName = node.binding.kind === 'Ident' ? node.binding.name : null;
        const II = ' '.repeat(this.indent * (depth + 1));

        p(`for (size_t ${ivar} = 0; ${ivar} < ${iterC}.length; ${ivar}++) {`);
        if (bindName) {
          lines.push(`${II}${qual}${elemType} ${bindName} = ${iterC}.data[${ivar}];`);
          this.define(bindName, { ctype: elemType, varKind: node.varKind });
        } else if (node.binding.kind === 'ArrayPattern') {
          for (let i = 0; i < node.binding.elems.length; i++) {
            const elem = node.binding.elems[i];
            if (!elem) continue;
            lines.push(`${II}${qual}int32_t ${elem.name} = ${iterC}.data[${ivar}]._${i};`);
            this.define(elem.name, { ctype: 'int32_t', varKind: node.varKind });
          }
        }
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        p('}');
        break;
      }

      case 'ForIn': {
        p(`/* for-in not supported */`);
        break;
      }

      case 'While': {
        const testC = this.exprToC(node.test, lines, depth);
        p(`while (${testC}) {`);
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        p('}');
        break;
      }

      case 'DoWhile': {
        const testC = this.exprToC(node.test, lines, depth);
        p('do {');
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        p(`} while (${testC});`);
        break;
      }

      case 'Break':
        if (node.label) p(`goto ${node.label}_break;`);
        else p('break;');
        break;
      case 'Continue':
        if (node.label) p(`goto ${node.label}_continue;`);
        else p('continue;');
        break;

      case 'Labeled': {
        const label = node.label;
        const inner = node.body;
        const usesBreak    = this.labelUsed(inner, label, 'break');
        const usesContinue = this.labelUsed(inner, label, 'continue');
        if (inner.kind === 'While' || inner.kind === 'For') {
          let headerLine;
          if (inner.kind === 'While') {
            const testC = this.exprToC(inner.test, lines, depth);
            headerLine = `while (${testC}) {`;
          } else {
            let initC = '';
            if (inner.init?.kind === 'VarDecl') {
              const { varKind, name, typeAnn, init } = inner.init;
              const ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'int32_t');
              const initExpr = init ? this.exprToC(init, lines, depth) : '0';
              initC = `${ctype} ${name} = ${initExpr}`;
              this.define(name, { ctype, varKind });
            }
            const testC = inner.test ? this.exprToC(inner.test, lines, depth) : '';
            const updC  = inner.update ? this.exprToC(inner.update, lines, depth) : '';
            headerLine = `for (${initC}; ${testC}; ${updC}) {`;
          }
          p(headerLine);
          const bodyLines = [];
          this.visitStmtOrBlock(inner.body, bodyLines, depth + 1);
          for (const bl of bodyLines) lines.push(bl);
          if (usesContinue) {
            const II = ' '.repeat(this.indent * (depth + 1));
            lines.push(`${II}${label}_continue:;`);
          }
          p('}');
          if (usesBreak) p(`${label}_break:;`);
        } else {
          this.visitStmt(inner, lines, depth);
        }
        break;
      }

      case 'Throw': {
        // throw new Error(msg) → tsc_throw(msg)
        const val = node.value;
        if (val?.kind === 'New' && val.name === 'Error' && val.args?.length === 1) {
          const msgC = this.exprToC(val.args[0].expr ?? val.args[0], lines, depth);
          p(`tsc_throw(${msgC});`);
        } else {
          const errC = this.exprToC(val, lines, depth);
          p(`tsc_throw(${errC});`);
        }
        break;
      }

      case 'TryCatch': {
        this.visitBlock(node.body, lines, depth);
        for (const c of node.catches) {
          p(`/* catch (${c.param}: ${c.typeAnn ? this.resolveType(c.typeAnn) : 'any'}) */`);
          this.visitBlock(c.body, lines, depth);
        }
        if (node.finally) {
          p('/* finally */');
          this.visitBlock(node.finally, lines, depth);
        }
        break;
      }

      case 'Switch': {
        const discType = this.inferType(node.discriminant);
        if (discType === 'double' || discType === 'float') {
          const loc = node.line ? `\n${this.filename}.tsc:${node.line}:` : '';
          throw new Error(`cannot switch on type 'f64'${loc}`);
        }
        for (let ci = 0; ci < node.cases.length; ci++) {
          const c = node.cases[ci];
          if (c.body.length === 0) continue;
          const last = c.body[c.body.length - 1];
          const isTerminator = last.kind === 'Break' || last.kind === 'Return' ||
                               last.kind === 'Throw' || last.kind === 'Continue';
          if (!isTerminator && ci < node.cases.length - 1) {
            const lastLine = last.line ?? c.line;
            const loc = lastLine ? `\n${this.filename}.tsc:${lastLine}:` : '';
            throw new Error(`implicit fallthrough${loc}`);
          }
        }
        const discC = this.exprToC(node.discriminant, lines, depth);
        const IS = ' '.repeat(this.indent * (depth + 1));
        p(`switch (${discC}) {`);
        // Check if discriminant is a string literal union type
        const discEnumDef = this.classes.get(discType);
        for (const c of node.cases) {
          if (c.test) {
            let caseC;
            if (discEnumDef?.isStringLiteralUnion && c.test.kind === 'Literal' && c.test.litType === 'string') {
              caseC = `${discType}_${c.test.value}`;
            } else {
              caseC = this.exprToC(c.test, lines, depth);
            }
            lines.push(`${IS}case ${caseC}:`);
          } else {
            lines.push(`${IS}default:`);
          }
          for (const s of c.body) this.visitStmt(s, lines, depth + 2);
        }
        p('}');
        break;
      }

      case 'Native': {
        p(node.content);
        break;
      }

      case 'Unsafe': {
        p('{');
        this.visitBlock(node.body, lines, depth + 1);
        p('}');
        break;
      }

      case 'Spawn': {
        p('/* spawn block — not yet implemented */');
        break;
      }

      case 'Noop': break;
      default:
        p(`/* unhandled stmt: ${node.kind} */`);
    }
  },

  visitStmtOrBlock(node, lines, depth) {
    if (node.kind === 'Block') this.visitBlock(node, lines, depth);
    else this.visitStmt(node, lines, depth);
  }

};
