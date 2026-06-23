export default {
  _visitVarDestruct(this: any, node: any, lines: any, depth: any) {
    const I = ' '.repeat(this.indent * depth);
    const p = (s: any) => lines.push(I + s);
    if (node.kind === 'VarDestructObj') {
        const { varKind, pattern, typeAnn, init } = node;
        const qual = varKind === 'const' ? 'const ' : '';
        const objType = this.inferType(init);
        const structDef = this.classes.get(objType);

        // Deferred anon struct (from ObjLit Ident): expand props directly
        if (init.kind === 'Ident') {
          const _dSym = this.lookup(init.name);
          if (_dSym?.deferredAnon && this._deferredAnons?.has(init.name)) {
            const _dAnon = this._deferredAnons.get(init.name);
            const propMap2 = new Map((_dAnon.init.props ?? []).map((pr: any) => [pr.key, pr.value]));
            for (const { name: fname } of _dAnon.fields) {
              const propVal2 = propMap2.get(fname);
              const propC2 = propVal2 ? this.exprToC(propVal2, lines, depth) : '0';
              const propType2 = propVal2 ? this.inferType(propVal2) : 'int32_t';
              p(`${qual}${propType2} _obj_${fname} = ${propC2};`);
              this.define(`_obj_${fname}`, { ctype: propType2, varKind });
            }
            for (const { name: fname, alias, defaultVal } of pattern) {
              const propType2 = this.lookup(`_obj_${fname}`)?.ctype ?? 'int32_t';
              if (defaultVal) {
                const dC2 = this.exprToC(defaultVal, lines, depth);
                p(`${qual}${propType2} ${alias} = (_obj_${fname} != 0) ? _obj_${fname} : ${dC2};`);
              } else {
                p(`${qual}${propType2} ${alias} = _obj_${fname};`);
              }
            this.define(alias, { ctype: propType2, varKind });
            }
            return;
          }
        }

        // ObjLit init: expand props directly as _obj_field variables (no anonymous struct)
        if (init.kind === 'ObjLit') {
          const propMap = new Map((init.props ?? []).map((pr: any) => [pr.key, pr.value]));
          // First pass: emit temp vars for each prop
          for (const { name } of pattern) {
            const propVal = propMap.get(name);
            const propC = propVal ? this.exprToC(propVal, lines, depth) : '0';
            const propType = propVal ? this.inferType(propVal) : 'int32_t';
            p(`${qual}${propType} _obj_${name} = ${propC};`);
            this.define(`_obj_${name}`, { ctype: propType, varKind });
          }
          // Second pass: bind destructured names
          for (const { name, alias, defaultVal } of pattern) {
            const propType = this.lookup(`_obj_${name}`)?.ctype ?? 'int32_t';
            if (defaultVal) {
              const dC = this.exprToC(defaultVal, lines, depth);
              p(`${qual}${propType} ${alias} = (_obj_${name} != 0) ? _obj_${name} : ${dC};`);
            } else {
              p(`${qual}${propType} ${alias} = _obj_${name};`);
            }
            this.define(alias, { ctype: propType, varKind });
          }
          return;
        }

        // Ident init with type annotation: move semantics (copy fields + zero-out source)
        if (typeAnn && init.kind === 'Ident' && structDef?.fields) {
          const srcName = init.name;
          const stringFields: any[] = [];
          for (const { name, alias } of pattern) {
            const field = structDef.fields.find((f: any) => (typeof f === 'string' ? f : (f.name ?? f)) === name);
            const fieldCType = field?.typeAnn ? this.resolveType(field.typeAnn) : 'int32_t';
            if (fieldCType === 'String') {
              p(`tsc_string_retain(${srcName}.${name});`);
              stringFields.push({ src: `${srcName}.${name}`, alias });
            }
            p(`${fieldCType} ${alias} = ${srcName}.${name};`);
            this.define(alias, { ctype: fieldCType, varKind });
            if (fieldCType === 'String') {
              this._registerCleanup(`tsc_string_release(${alias})`);
            }
          }
          // Release string fields in source before zeroing
          for (const { src } of stringFields) {
            p(`tsc_string_release(${src});`);
          }
          p(`${srcName} = (${objType}){0};`);
          return;
        }

        // Ident init with known struct fields: emit pointer borrows
        if (init.kind === 'Ident' && structDef?.fields) {
          const srcName = init.name;
          for (const { name, alias } of pattern) {
            const field = structDef.fields.find((f: any) => (typeof f === 'string' ? f : (f.name ?? f)) === name);
            const fieldCType = field?.typeAnn ? this.resolveType(field.typeAnn) : 'int32_t';
            p(`${qual}${fieldCType} *${alias} = &${srcName}.${name};`);
            this.define(alias, { ctype: `${fieldCType} *`, varKind, isPointer: true, derefType: fieldCType });
          }
          return;
        }

        // Fallback: copy to temp and access
        const initC = this.exprToC(init, lines, depth);
        const tmpName = `_obj_${this.tempCount++}`;
        p(`${objType} ${tmpName} = ${initC};`);
        for (const { name, alias, defaultVal } of pattern) {
          if (defaultVal) {
            const dC = this.exprToC(defaultVal, lines, depth);
            p(`${qual}int32_t ${alias} = (${tmpName}.${name} != 0) ? ${tmpName}.${name} : ${dC};`);
          } else {
            p(`${qual}int32_t ${alias} = ${tmpName}.${name};`);
          }
          this.define(alias, { ctype: 'int32_t', varKind });
        }

    } else if (node.kind === 'VarDestructArr') {
        const { varKind, pattern, typeAnn, init } = node;
        let initType = this.inferType(init);
        const initSym = init.kind === 'Ident' ? this.lookup(init.name) : null;
        let isRefArray = false;
        if (initSym?.isRefParam && initSym?.derefType?.startsWith('Array_')) {
          isRefArray = true;
          initType = initSym.derefType;
        }
        let tupleDef0 = this.classes.get(initType);
        // Defensive fallback: when inferType cannot resolve a tuple/array type from the
        // init expression (e.g. future AST nodes or complex generic inference), use the
        // explicit type annotation to create/register the struct. Currently inference
        // covers 100% of cases (Ident, Call, Cast, Ternary all resolve tuple types), so
        // this path is not exercised by existing tests.
        if (!tupleDef0?.isTuple && !initType?.startsWith('Array_') && typeAnn) {
          const resolved = this.resolveType(typeAnn);
          const resolvedDef = this.classes.get(resolved);
          if (resolvedDef?.isTuple || resolved?.startsWith('Array_')) {
            initType = resolved;
            tupleDef0 = resolvedDef;
          }
        }
        const qual = varKind === 'const' ? 'const ' : '';
        if (tupleDef0?.isTuple) {
          const initC = this.exprToC(init, lines, depth);
          const srcIsLet = init?.kind === 'Ident' && this.lookup(init.name)?.varKind === 'let';
          for (let i = 0; i < pattern.length; i++) {
            const elem = pattern[i];
            if (!elem) continue;
            const field = tupleDef0.fields[i];
            const ctype = field ? field.ctype.replace(' *', '') : 'int32_t';
            p(`${qual}${ctype} ${elem.name} = ${initC}._${i};`);
            this.define(elem.name, { ctype, varKind });
            if (ctype === 'String') {
              p(`tsc_string_retain(${elem.name});`);
              if (srcIsLet && init.kind === 'Ident') {
                p(`memset(&${init.name}._${i}, 0, sizeof(String));`);
              }
            }
          }
          if (srcIsLet && init.kind === 'Ident') {
            const srcSym = this.lookup(init.name);
            if (srcSym) srcSym._moved = true;
          }
        } else if (initType?.startsWith('Array_')) {
          // Array_T destructuring: const [first, ...rest] = arr
          const elemIdent = initType.slice(6);
          const elemCType = this._arrIdentToCType(elemIdent);
          const srcIsLet = init?.kind === 'Ident' && this.lookup(init.name)?.varKind === 'let';
          this._ensureArrayStruct(initType, elemCType);
          const srcC = this.exprToC(init, lines, depth);
          const srcUse = isRefArray ? `(*${srcC})` : srcC;
          let idx = 0;
          for (const elem of pattern) {
            if (!elem) { idx++; continue; }
            if (elem.rest) {
              // Rest: deep copy via tsc_array_slice_*
              p(`${initType} ${elem.name} = tsc_array_slice_${elemIdent}(${srcUse}, ${idx}, (int32_t)${srcUse}.length);`);
              this.define(elem.name, { ctype: initType, elemType: elemIdent, arrElemCType: elemCType, isArray: true, varKind });
              this._registerCleanup(`tsc_array_free_${elemIdent}(&${elem.name})`);
            } else {
              // Regular element: direct index
              p(`${qual}${elemCType} ${elem.name} = ${srcUse}.data[${idx}];`);
              this.define(elem.name, { ctype: elemCType, varKind });
              if (elemCType === 'String') {
                p(`tsc_string_retain(${elem.name});`);
                this._registerCleanup(`tsc_string_release(${elem.name})`);
              }
              idx++;
            }
          }
          if (srcIsLet && init.kind === 'Ident' && elemCType === 'String') {
            const srcSym = this.lookup(init.name);
            if (srcSym) srcSym._moved = true;
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

      }

  },
};

