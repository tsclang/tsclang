export default {
  _visitVarDestruct(node, lines, depth) {
    const I = ' '.repeat(this.indent * depth);
    const p = (s) => lines.push(I + s);
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
            const propMap2 = new Map((_dAnon.init.props ?? []).map(pr => [pr.key, pr.value]));
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
          const propMap = new Map((init.props ?? []).map(pr => [pr.key, pr.value]));
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
          const stringFields = [];
          for (const { name, alias } of pattern) {
            const field = structDef.fields.find(f => (typeof f === 'string' ? f : (f.name ?? f)) === name);
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
            const field = structDef.fields.find(f => (typeof f === 'string' ? f : (f.name ?? f)) === name);
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
        } else if (initType?.startsWith('Array_')) {
          // Array_T destructuring: const [first, ...rest] = arr
          const elemIdent = initType.slice(6); // Array_i32 → i32
          const elemCType = this._arrIdentToCType(elemIdent);
          const srcC = this.exprToC(init, lines, depth);
          const nonRestCount = pattern.filter(e => e && !e.rest).length;
          let idx = 0;
          for (const elem of pattern) {
            if (!elem) { idx++; continue; }
            if (elem.rest) {
              // Rest: sub-array slice
              p(`${qual}${initType} ${elem.name} = {.data = ${srcC}.data + ${idx}, .length = ${srcC}.length - ${idx}, .capacity = 0};`);
              this.define(elem.name, { ctype: initType, elemType: elemIdent, arrElemCType: elemCType, isArray: true, varKind });
            } else {
              // Regular element: direct index
              p(`${qual}${elemCType} ${elem.name} = ${srcC}.data[${idx}];`);
              this.define(elem.name, { ctype: elemCType, varKind });
              idx++;
            }
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

