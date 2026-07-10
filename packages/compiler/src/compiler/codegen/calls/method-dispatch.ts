import type { CodeGenContext } from '../../codegen.js';
import { DEFAULT_TARGET } from '@tsclang/shared';
import type { Expression, Argument, TypeAnn, Member } from '@tsclang/ast';
import type { SymbolInfo } from '@tsclang/ast';
import { resolveDecimalBase, decimalScale } from '../types/decimal.js';
export function methodCall(ctx: CodeGenContext, callee: Member, args: Argument[], lines: string[], depth: number) {
    let baseObject = callee.object;
    if (baseObject.kind === 'Call' && baseObject.callee?.kind === 'Member') {
      const I = ' '.repeat(ctx.indent * depth);
      const chainLinks: Expression[] = [];
      while (baseObject.kind === 'Call' && baseObject.callee?.kind === 'Member') {
        chainLinks.push(baseObject);
        baseObject = baseObject.callee.object;
      }
      for (let i = chainLinks.length - 1; i >= 0; i--) {
        const link = chainLinks[i];
        if (link.kind !== 'Call' || link.callee?.kind !== 'Member') continue;
        const flatCallee = { ...link.callee, object: baseObject };
        const innerC = ctx.methodCall(flatCallee, link.args, lines, depth);
        const resultType = ctx.inferType(link);
        const prevLink = i > 0 ? chainLinks[i - 1] : null;
        const nextProp = (prevLink?.kind === 'Call' && prevLink.callee?.kind === 'Member') ? prevLink.callee.prop : callee.prop;
        const nextTargetClass = ctx.classes.get(resultType);
        const nextTargetIface = ctx.interfaces.get(resultType);
        const hasNextMethod = (nextTargetClass?.methods?.some((m) => m.name === nextProp))
          || (nextTargetIface?.some((m: { kind: string; name?: string }) => m.kind === 'MethodSig' && m.name === nextProp))
          || (resultType.startsWith('Array_') && ['map','filter','slice','join','every','some','find','findIndex','forEach','sort','reduce','reduceRight','findLast','findLastIndex','flatMap','keys','values','entries','flat','concat','includes','indexOf','lastIndexOf','at','with','toReversed','toSorted','toSpliced','clone','pop','shift','unshift','splice','reverse','push','resize','reallocate','fill','set','view','viewMut','length','capacity'].includes(nextProp))
          || (resultType === 'String' && ['slice','indexOf','lastIndexOf','at','includes','startsWith','endsWith','split','trim','toUpperCase','toLowerCase','replace','padStart','padEnd','repeat','charAt','charCodeAt','concat','codePoints','graphemes','replaceAll','substring','trimStart','trimEnd','search','match','matchAll','length','toString'].includes(nextProp));
        if (hasNextMethod) {
          const tmpName = `_chain_${ctx.tempCount++}`;
          lines.push(`${I}${resultType} ${tmpName} = ${innerC};`);
          const chainDef: SymbolInfo = { ctype: resultType, varKind: 'const' };
          if (resultType.startsWith('Array_')) {
            const chainElemIdent = resultType.slice(6);
            chainDef.elemType = chainElemIdent;
            chainDef.arrElemCType = ctx._arrIdentToCType(chainElemIdent);
            chainDef.isArray = true;
          }
          ctx.define(tmpName, chainDef);
          baseObject = { kind: 'Ident', name: tmpName };
        } else {
          lines.push(`${I}${innerC};`);
        }
      }
    } else if (baseObject.kind === 'Call' && baseObject.callee?.kind === 'Ident') {
      const I = ' '.repeat(ctx.indent * depth);
      const resultType = ctx.inferType(baseObject);
      const tmpName = `_chain_${ctx.tempCount++}`;
      const innerC = ctx.callToC(baseObject, lines, depth);
      lines.push(`${I}${resultType} ${tmpName} = ${innerC};`);
      ctx.define(tmpName, { ctype: resultType, varKind: 'const' });
      baseObject = { kind: 'Ident', name: tmpName };
    } else if (baseObject.kind === 'New') {
      const I = ' '.repeat(ctx.indent * depth);
      const resultType = ctx.inferType(baseObject);
      const tmpName = `_chain_${ctx.tempCount++}`;
      const innerC = ctx.exprToC(baseObject, lines, depth);
      lines.push(`${I}${resultType} ${tmpName} = ${innerC};`);
      ctx.define(tmpName, { ctype: resultType, varKind: 'let' });
      baseObject = { kind: 'Ident', name: tmpName };
    }
    const prop  = callee.prop;
    const sym: SymbolInfo | null = baseObject.kind === 'Ident' ? ctx.lookup(baseObject.name) : null;
    if (prop === 'upgrade' && sym?.isWeak) ctx._inWeakUpgrade = true;
    const objC = ctx.exprToC(baseObject, lines, depth);
    if (prop === 'upgrade' && sym?.isWeak) ctx._inWeakUpgrade = false;
    if (sym?._mutQuarantined) {
      throw ctx.errorCode('E011', baseObject, { name: baseObject.kind === 'Ident' ? baseObject.name : '?' });
    }
    let et    = sym?.elemType ?? 'i32';
    let etC   = sym?.arrElemCType ?? 'int32_t';
    let arrObjC = objC;

    // Ref<T[]> / Mut<T[]>: dereference pointer for array operations
    if (sym?.isRefParam && sym?.derefType?.startsWith('Array_')) {
      et = sym.derefType.slice(6);
      etC = ctx._arrIdentToCType(et);
      arrObjC = `(*${objC})`;
    }

    const lambdaOutET = (argsC: string): string => {
      const m = argsC.match(/_lambda_\d+_(\w+)/);
      return m ? m[1] : et;
    };

    const isArrayObj = sym?.isArray || ctx.inferType(baseObject)?.startsWith('Array_')
                     || (sym?.isRefParam && sym?.derefType?.startsWith('Array_'));
    const arrayCallbackProps = new Set(['filter','map','every','some','find','findIndex','forEach','sort','reduce','reduceRight','findLast','findLastIndex','flatMap']);
    let cbFnName: string | null = null;
    let cbExtraArgs = '';
    let argsForC = args;
    if (isArrayObj && arrayCallbackProps.has(prop) && args.length > 0) {
      const _refHint = etC === 'String' ? 'String *' : etC;
      if (prop === 'reduce' || prop === 'reduceRight') {
        const initExpr = args[1]?.expr;
        const accType = initExpr ? ctx.inferType(initExpr) : etC;
        ctx._lambdaParamHint = [accType, _refHint];
      } else if (prop === 'sort') {
        ctx._lambdaParamHint = [_refHint, _refHint];
      } else {
        ctx._lambdaParamHint = [_refHint];
      }
      cbFnName = ctx._extractCallbackFn(args[0], lines, depth);
      ctx._lambdaParamHint = null;
      if (cbFnName) {
        argsForC = args.slice(1);
        if (argsForC.length > 0) {
          cbExtraArgs = argsForC.map((a: { spread?: boolean; expr: Expression }) => a.spread ? `/* ...${ctx.exprToC(a.expr, lines, depth)} */` : ctx.exprToC(a.expr, lines, depth)).join(', ');
        }
      }
    }
    const _objType = ctx.inferType(baseObject);
    if (_objType?.startsWith('Promise_') && ['then','catch','finally'].includes(prop) && args.length > 0) {
      const innerType = _objType.slice(8);
      const innerCType = ctx._arrIdentToCType(innerType);
      if (prop !== 'finally') ctx._lambdaParamHint = [innerCType];
      cbFnName = ctx._extractCallbackFn(args[0], lines, depth);
      ctx._lambdaParamHint = null;
      if (cbFnName) {
        argsForC = [];
      }
    }
    const argsC = ctx.argsToC(argsForC, lines, depth);
    if (isArrayObj) {
      switch (prop) {
        case 'push': {
          if ((sym?._refBorrowCount || 0) > 0)
            throw ctx.errorCode('E010', baseObject, { name: baseObject.kind === 'Ident' ? baseObject.name : '?' });
          const _prevET_push = ctx._expectedType;
          const _pushDecBase = resolveDecimalBase(ctx, etC);
          ctx._expectedType = _pushDecBase ?? etC;
          let elemC = args[0] ? ctx.exprToC(args[0].expr, [], depth) : '0';
          ctx._expectedType = _prevET_push;
          const _pushArrName = `Array_${et}`;
          if (_pushDecBase) {
            ctx._ensureArrayFreeMacro(et, _pushArrName, etC);
            ctx._ensureArrayPushMacro(et, _pushArrName, etC);
          }
          if (et === 'tsc_unknown' && args[0]) {
            const _argType = ctx.inferType(args[0].expr);
            if (_argType !== 'tsc_unknown') {
              ctx._ensureUnknownStruct();
              const _packer = ctx._unknownPackerFor(_argType);
              elemC = `${_packer}(${elemC})`;
            }
          }
          if (ctx._isOptType(etC) && args[0]) {
            elemC = ctx._wrapOptValue(elemC, args[0].expr, etC);
          }
          if (args[0] && args[0].expr.kind === 'Ident') {
            const _pushCls = ctx.classes.get(et);
            const _pushIsArr = et.startsWith('Array_');
            if ((_pushCls?.fields || _pushIsArr)) {
              const _pushSym = ctx.lookup(args[0].expr.name);
              if (_pushSym) {
                if (_pushSym._moved)
                  throw ctx.errorCode('E002', args[0].expr, { name: args[0].expr.name });
                _pushSym._moved = true;
                _pushSym._movedLine = args[0].expr.line;
                _pushSym._movedSourceNode = args[0].expr;
              }
            }
          }
          if (baseObject.kind === 'Ident') {
            ctx._registerCleanup(`tsc_array_free_${et}(&${objC})`);
            if (sym) sym.arraySize = undefined;
          }
          if (args[0]?.expr.kind === 'Ident') {
            const _pushArgSym = ctx.lookup(args[0].expr.name);
            elemC = ctx._derefStrPtr(_pushArgSym, elemC);
          }
          return `tsc_array_push_${et}(&${objC}, ${elemC})`;
        }
        case 'pop': {
          if ((sym?._refBorrowCount || 0) > 0)
            throw ctx.errorCode('E010', baseObject, { name: baseObject.kind === 'Ident' ? baseObject.name : '?' });
          if (!ctx._isOptType(etC)) {
            ctx._ensureOptStruct(`opt_${et}`, etC);
          }
          if (sym?.arraySize === 0) ctx._lastPopEmpty = true;
          return `tsc_array_pop_${et}(&${objC})`;
        }
        case 'remove': {
          if ((sym?._refBorrowCount || 0) > 0)
            throw ctx.errorCode('E010', baseObject, { name: baseObject.kind === 'Ident' ? baseObject.name : '?' });
          const idxC = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : '0';
          ctx._lastArrayElemReturn = true;
          ctx._ensureArrayRemoveMacro(et, etC);
          return `tsc_array_remove_${et}(&${objC}, ${idxC})`;
        }
        case 'view': {
          const slName = `Slice_${et}`;
          ctx._ensureSliceStruct(slName, etC, false);
          if (baseObject.kind === 'Ident' && sym) ctx._trackRefBorrow(sym);
          let _vs = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : '0';
          const _ve = args[1] ? ctx.exprToC(args[1].expr, lines, depth) : `(size_t)${objC}.length`;
          if (args[0] && !['Ident','Literal'].includes(args[0].expr.kind)) {
            const vsTmp = `_tsc_vs_${ctx.tempCount++}`;
            lines.push(`${' '.repeat(ctx.indent * depth)}int32_t ${vsTmp} = ${_vs};`);
            _vs = vsTmp;
          }
          return `(${slName}){ .ptr = ${objC}.data + (${_vs}), .length = (size_t)(${_ve}) - (${_vs}) }`;
        }
        case 'viewMut': {
          const msName = `MutSlice_${et}`;
          ctx._ensureSliceStruct(msName, etC, true);
          if (baseObject.kind === 'Ident' && sym) ctx._trackRefBorrow(sym);
          let _ms = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : '0';
          const _me = args[1] ? ctx.exprToC(args[1].expr, lines, depth) : `(size_t)${objC}.length`;
          if (args[0] && !['Ident','Literal'].includes(args[0].expr.kind)) {
            const msTmp = `_tsc_vs_${ctx.tempCount++}`;
            lines.push(`${' '.repeat(ctx.indent * depth)}int32_t ${msTmp} = ${_ms};`);
            _ms = msTmp;
          }
          return `(${msName}){ .ptr = ${objC}.data + (${_ms}), .length = (size_t)(${_me}) - (${_ms}) }`;
        }
        case 'length':   return `${objC}.length`;
        case 'capacity': return `${objC}.capacity`;
        case 'sort': {
          if (args.length && ctx._strictRules?.has('no-sort')) {
            throw ctx.errorCode('E202', baseObject);
          }
          const fnC = args.length ? (cbFnName ?? argsC) : 'NULL';
          return `tsc_array_sort_${et}(&${objC}, ${fnC})`;
        }
        case 'reverse': {
          ctx._ensureArrayReverseMacro(et, etC);
          return `tsc_array_reverse_${et}(&${objC})`;
        }
        case 'fill': {
          ctx._ensureArrayFillMacro(et, etC);
          const v     = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : '0';
          const start = args[1] ? ctx.exprToC(args[1].expr, lines, depth) : '0';
          const end   = args[2] ? ctx.exprToC(args[2].expr, lines, depth) : `(int32_t)${objC}.length`;
          return `tsc_array_fill_${et}(&${objC}, ${v}, ${start}, ${end})`;
        }
        case 'resize': {
          ctx._ensureArrayResizeMacro(et, etC);
          const nNode = args[0]?.expr;
          const nC    = nNode ? ctx.exprToC(nNode, lines, depth) : '0';
          const fillC = args[1] ? ctx.exprToC(args[1].expr, lines, depth) : '0';
          if (baseObject.kind === 'Ident') {
            const nLit = nNode?.kind === 'Literal' ? parseFloat(nNode.value) : NaN;
            const curSize = sym?.arraySize ?? NaN;
            if (isNaN(nLit) || isNaN(curSize) || nLit > curSize) {
              ctx._registerCleanup(`tsc_array_free_${et}(&${objC})`);
            }
            if (sym) sym.arraySize = isNaN(nLit) ? undefined : nLit;
          }
          return `tsc_array_resize_${et}(&${objC}, ${nC}, ${fillC})`;
        }
        case 'reallocate': {
          ctx._ensureArrayReallocateMacro(et, etC);
          const capNode = args[0]?.expr;
          const capC = capNode ? ctx.exprToC(capNode, lines, depth) : '0';
          if (baseObject.kind === 'Ident') {
            const capLit = capNode?.kind === 'Literal' ? parseFloat(capNode.value) : NaN;
            const curSize = sym?.arraySize ?? NaN;
            if (isNaN(capLit) || isNaN(curSize) || capLit > curSize) {
              ctx._registerCleanup(`tsc_array_free_${et}(&${objC})`);
            }
            if (sym) sym.arraySize = undefined;
          }
          return `tsc_array_reallocate_${et}(&${objC}, ${capC})`;
        }
        case 'filter': {
          ctx._ensureArrayFilterMacro(et, etC);
          return `tsc_array_filter_${et}(${arrObjC}, ${cbFnName ?? argsC})`;
        }
        case 'forEach': {
          ctx._ensureArrayForeachMacro(et, etC);
          return `tsc_array_foreach_${et}(${arrObjC}, ${cbFnName ?? argsC})`;
        }
        case 'map': {
          const outET = cbFnName ? (ctx._lastCbRetType ? ctx.cTypeToIdent(ctx._lastCbRetType) : et) : lambdaOutET(argsC);
          const outElemCType = ctx._arrIdentToCType(outET);
          ctx._ensureArrayMapMacro(et, outET, etC, outElemCType);
          return `tsc_array_map_${et}_${outET}(${arrObjC}, ${cbFnName ?? argsC})`;
        }
        case 'reduce': {
          const initExpr = args[1]?.expr;
          const outET = initExpr ? ctx.cTypeToIdent(ctx.inferType(initExpr)) : et;
          const outCType = initExpr ? ctx.inferType(initExpr) : etC;
          ctx._ensureArrayReduceMacro(et, outET, etC, outCType, false);
          const reduceArgs = cbFnName ? `${cbFnName}${cbExtraArgs ? ', ' + cbExtraArgs : ''}` : argsC;
          return `tsc_array_reduce_${et}_${outET}(${arrObjC}, ${reduceArgs})`;
        }
        case 'reduceRight': {
          const initExpr2 = args[1]?.expr;
          const outET2 = initExpr2 ? ctx.cTypeToIdent(ctx.inferType(initExpr2)) : et;
          const outCType2 = initExpr2 ? ctx.inferType(initExpr2) : etC;
          ctx._ensureArrayReduceMacro(et, outET2, etC, outCType2, true);
          const reduceArgs2 = cbFnName ? `${cbFnName}${cbExtraArgs ? ', ' + cbExtraArgs : ''}` : argsC;
          return `tsc_array_reduce_right_${et}_${outET2}(${arrObjC}, ${reduceArgs2})`;
        }
        case 'every': {
          ctx._ensureArrayEveryMacro(et, etC);
          return `tsc_array_every_${et}(${arrObjC}, ${cbFnName ?? argsC})`;
        }
        case 'some': {
          ctx._ensureArraySomeMacro(et, etC);
          return `tsc_array_some_${et}(${arrObjC}, ${cbFnName ?? argsC})`;
        }
        case 'find': {
          ctx._ensureArrayFindMacro(et, etC, false);
          return `tsc_array_find_${et}(${arrObjC}, ${cbFnName ?? argsC})`;
        }
        case 'findIndex': {
          ctx._ensureArrayFindIndexMacro(et, etC, false);
          return `(int)tsc_array_find_index_${et}(${arrObjC}, ${cbFnName ?? argsC})`;
        }
        case 'indexOf': {
          ctx._ensureArrayIndexOfMacro(et, etC, false);
          return `(int)tsc_array_index_of_${et}(${arrObjC}, ${argsC})`;
        }
        case 'includes': {
          ctx._ensureArrayIncludesMacro(et, etC);
          return `tsc_array_includes_${et}(${arrObjC}, ${argsC})`;
        }
        case 'concat': {
          ctx._ensureArrayConcatMacro(et, etC);
          return `tsc_array_concat_${et}(${arrObjC}, ${argsC})`;
        }
        case 'set': {
          ctx._ensureArraySetMacro(et, etC);
          const srcExpr = args[0]?.expr;
          const srcC = srcExpr ? ctx.exprToC(srcExpr, lines, depth) : '';
          const offsetC = args[1] ? ctx.exprToC(args[1].expr, lines, depth) : '0';
          return `tsc_array_set_${et}(&${objC}, ${srcC}, ${offsetC})`;
        }
        case 'slice': {
          ctx._ensureArraySliceMacro(et, etC);
          const s = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : '0';
          const e = args[1] ? ctx.exprToC(args[1].expr, lines, depth) : `(int32_t)${arrObjC}.length`;
          return `tsc_array_slice_${et}(${arrObjC}, ${s}, ${e})`;
        }
        case 'join': {
          const sep = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : 'STR_LIT(",")';
          return `tsc_array_join_${et}(${arrObjC}, ${sep})`;
        }
        case 'keys': {
          ctx._ensureArrayKeysMacro(et, etC);
          return `tsc_array_keys_${et}(${arrObjC})`;
        }
        case 'values': {
          ctx._ensureArrayValuesMacro(et, etC);
          return `tsc_array_values_${et}(${arrObjC})`;
        }
        case 'entries': return `tsc_array_entries_${et}(${arrObjC})`;
        case 'flat': {
          ctx._ensureArrayFlatMacro(et, etC);
          return `tsc_array_flat_${et}(${arrObjC})`;
        }
        case 'shift': {
          ctx._ensureArrayShiftMacro(et, etC);
          ctx._lastSuppressConst = true;
          return `tsc_array_shift_${et}(&${objC})`;
        }
        case 'unshift': {
          ctx._ensureArrayUnshiftMacro(et, etC);
          if ((sym?._refBorrowCount || 0) > 0)
            throw ctx.errorCode('E010', baseObject, { name: baseObject.kind === 'Ident' ? baseObject.name : '?' });
          const uv = args[0] ? ctx.exprToC(args[0].expr, [], depth) : '0';
          return `tsc_array_unshift_${et}(&${objC}, ${uv})`;
        }
        case 'splice': {
          ctx._ensureArraySpliceMacro(et, etC);
          if ((sym?._refBorrowCount || 0) > 0)
            throw ctx.errorCode('E010', baseObject, { name: baseObject.kind === 'Ident' ? baseObject.name : '?' });
          const spStart = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : '0';
          const spDel = args[1] ? ctx.exprToC(args[1].expr, lines, depth) : '0';
          const spItems = argsForC.slice(2).map((a: { spread?: boolean; expr: Expression }) => a.spread ? `/* ...${ctx.exprToC(a.expr, lines, depth)} */` : ctx.exprToC(a.expr, lines, depth));
          const spArgs = spItems.length > 0 ? `${spStart}, ${spDel}, ${spItems.join(', ')}` : `${spStart}, ${spDel}`;
          return `tsc_array_splice_${et}(&${objC}, ${spArgs})`;
        }
        case 'at': {
          ctx._ensureArrayAtMacro(et, etC);
          const atIdx = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : '0';
          return `tsc_array_at_${et}(${arrObjC}, ${atIdx})`;
        }
        case 'with': {
          ctx._ensureArrayWithMacro(et, etC);
          const wIdx = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : '0';
          const wVal = args[1] ? ctx.exprToC(args[1].expr, lines, depth) : '0';
          return `tsc_array_with_${et}(${arrObjC}, ${wIdx}, ${wVal})`;
        }
        case 'lastIndexOf': {
          ctx._ensureArrayIndexOfMacro(et, etC, true);
          return `(int)tsc_array_last_index_of_${et}(${arrObjC}, ${argsC})`;
        }
        case 'findLast': {
          ctx._ensureArrayFindMacro(et, etC, true);
          return `tsc_array_find_last_${et}(${arrObjC}, ${cbFnName ?? argsC})`;
        }
        case 'findLastIndex': {
          ctx._ensureArrayFindIndexMacro(et, etC, true);
          return `(int)tsc_array_find_last_index_${et}(${arrObjC}, ${cbFnName ?? argsC})`;
        }
        case 'flatMap': {
          let fmOutET = et;
          if (cbFnName && ctx._lastCbRetType) {
            const fmRet = ctx._lastCbRetType;
            fmOutET = fmRet.startsWith('Array_') ? fmRet.slice(6) : ctx.cTypeToIdent(fmRet);
          }
          const fmOutCType = ctx._arrIdentToCType(fmOutET);
          ctx._ensureArrayFlatMapMacro(et, fmOutET, etC, fmOutCType);
          return `tsc_array_flat_map_${et}_${fmOutET}(${arrObjC}, ${cbFnName ?? argsC})`;
        }
        case 'toReversed': {
          ctx._ensureArrayToReversedMacro(et, etC);
          return `tsc_array_to_reversed_${et}(${arrObjC})`;
        }
        case 'toSorted': {
          const tsCmp = args.length ? (cbFnName ?? argsC) : 'NULL';
          return tsCmp === 'NULL' ? `tsc_array_to_sorted_${et}(${arrObjC})` : `tsc_array_to_sorted_${et}(${arrObjC})`;
        }
        case 'toSpliced': {
          ctx._ensureArrayToSplicedMacro(et, etC);
          const tsStart = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : '0';
          const tsDel = args[1] ? ctx.exprToC(args[1].expr, lines, depth) : '0';
          const tsItems = argsForC.slice(2).map((a: { spread?: boolean; expr: Expression }) => a.spread ? `/* ...${ctx.exprToC(a.expr, lines, depth)} */` : ctx.exprToC(a.expr, lines, depth));
          const tsArgs = tsItems.length > 0 ? `${tsStart}, ${tsDel}, ${tsItems.join(', ')}` : `${tsStart}, ${tsDel}`;
          return `tsc_array_to_spliced_${et}(${arrObjC}, ${tsArgs})`;
        }
        case 'clone': {
          if (baseObject.kind === 'Ident') {
            return `tsc_array_slice_${et}(${arrObjC}, 0, (int32_t)${arrObjC}.length)`;
          }
          const arrType = ctx.inferType(baseObject) ?? `Array_${etC}`;
          const tmp = `_tsc_arr_${ctx.tempCount++}`;
          lines.push(`${' '.repeat(ctx.indent * depth)}${arrType} ${tmp} = ${arrObjC};`);
          return `tsc_array_slice_${et}(${tmp}, 0, (int32_t)${tmp}.length)`;
        }
      }
    }

    const baseObjType = ctx.inferType(baseObject);
    const isSliceObj = baseObjType?.startsWith('Slice_') || baseObjType?.startsWith('MutSlice_');
    if (isSliceObj) {
      const isMut = baseObjType.startsWith('MutSlice_');
      const sliceEtC = baseObjType.slice(isMut ? 9 : 6);
      const sliceEt  = ctx.cTypeToIdent(sliceEtC);
      switch (prop) {
        case 'view': {
          const slName = `Slice_${sliceEt}`;
          ctx._ensureSliceStruct(slName, sliceEtC, false);
          let _vs = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : '0';
          const _ve = args[1] ? ctx.exprToC(args[1].expr, lines, depth) : `${objC}.length`;
          if (args[0] && !['Ident','Literal'].includes(args[0].expr.kind)) {
            const vsTmp = `_tsc_vs_${ctx.tempCount++}`;
            lines.push(`${' '.repeat(ctx.indent * depth)}int32_t ${vsTmp} = ${_vs};`);
            _vs = vsTmp;
          }
          return `(${slName}){ .ptr = ${objC}.ptr + (${_vs}), .length = (size_t)(${_ve}) - (${_vs}) }`;
        }
        case 'viewMut': {
          const msName = `MutSlice_${sliceEt}`;
          ctx._ensureSliceStruct(msName, sliceEtC, true);
          let _ms = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : '0';
          const _me = args[1] ? ctx.exprToC(args[1].expr, lines, depth) : `${objC}.length`;
          if (args[0] && !['Ident','Literal'].includes(args[0].expr.kind)) {
            const msTmp = `_tsc_vs_${ctx.tempCount++}`;
            lines.push(`${' '.repeat(ctx.indent * depth)}int32_t ${msTmp} = ${_ms};`);
            _ms = msTmp;
          }
          return `(${msName}){ .ptr = ${objC}.ptr + (${_ms}), .length = (size_t)(${_me}) - (${_ms}) }`;
        }
      }
    }

    const _isStrPtr = sym?.ctype === 'String *';
    const strObjC = _isStrPtr ? `(*${objC})` : objC;
    const strMethods: Record<string, () => string> = {
      length:     () => `${_isStrPtr ? objC + '->' : objC + '.'}length`,
      slice:      () => { const a = args.map((a: { expr: Expression }) => ctx.exprToC(a.expr, lines, depth)); return `tsc_string_slice(${strObjC}, ${a[0]??0}, ${a[1]??'(int32_t)'+strObjC+'.length'})`; },
      indexOf:      () => `(int)tsc_string_index_of(${strObjC}, ${ctx.exprToC(args[0].expr, lines, depth)})`,
      lastIndexOf:  () => `(int)tsc_string_last_index_of(${strObjC}, ${ctx.exprToC(args[0].expr, lines, depth)})`,
      at:           () => {
        const idxNode = args[0]?.expr;
        const idxC = ctx.exprToC(idxNode, lines, depth);
        if (!ctx._emittedOptStructs.has('opt_u8')) {
          ctx._emittedOptStructs.add('opt_u8');
        }
        const idxVal = (idxNode?.kind === 'Literal' && idxNode?.litType === 'number') ? parseFloat(idxNode.value) : NaN;
        ctx._lastAtNonNeg = !isNaN(idxVal) && idxVal >= 0;
        return `tsc_string_at(${strObjC}, ${idxC})`;
      },
      includes:   () => `tsc_string_includes(${strObjC}, ${ctx.exprToC(args[0].expr, lines, depth)})`,
      startsWith: () => `tsc_string_starts_with(${strObjC}, ${ctx.exprToC(args[0].expr, lines, depth)})`,
      endsWith:   () => `tsc_string_ends_with(${strObjC}, ${ctx.exprToC(args[0].expr, lines, depth)})`,
      split:      () => { ctx._ensureArrayStruct('Array_string', 'String'); return `tsc_string_split_expr(${strObjC}, ${ctx.exprToC(args[0].expr, lines, depth)})`; },
      trim:       () => `tsc_string_trim(${strObjC})`,
      toUpperCase:() => `tsc_string_to_upper(${strObjC})`,
      toLowerCase:() => `tsc_string_to_lower(${strObjC})`,
      replace:    () => { const a = args.map((a: { expr: Expression }) => ctx.exprToC(a.expr, lines, depth)); return `tsc_string_replace(${strObjC}, ${a[0]}, ${a[1]})`; },
      padStart:   () => { const a = args.map((a: { expr: Expression }) => ctx.exprToC(a.expr, lines, depth)); return `tsc_string_pad_start(${strObjC}, ${a[0]}, ${a[1]??'STR_LIT(" ")'})`; },
      padEnd:     () => { const a = args.map((a: { expr: Expression }) => ctx.exprToC(a.expr, lines, depth)); return `tsc_string_pad_end(${strObjC}, ${a[0]}, ${a[1]??'STR_LIT(" ")'})`; },
      repeat:     () => `tsc_string_repeat(${strObjC}, ${ctx.exprToC(args[0].expr, lines, depth)})`,
      charAt:     () => `tsc_string_char_at(${strObjC}, ${ctx.exprToC(args[0].expr, lines, depth)})`,
      charCodeAt: () => { const idxC = ctx.exprToC(args[0].expr, lines, depth); return `(unsigned)(uint8_t)TSC_STRING_GET_CHAR(${strObjC}, ${idxC})`; },
      concat:     () => `tsc_string_concat(${strObjC}, ${ctx.exprToC(args[0].expr, lines, depth)})`,
      codePoints:  () => `tsc_codepoints(${strObjC})`,
      graphemes:   () => `tsc_graphemes(${strObjC})`,
      replaceAll:  () => { const a = args.map((a: { expr: Expression }) => ctx.exprToC(a.expr, lines, depth)); return `tsc_string_replace_all(${strObjC}, ${a[0]}, ${a[1]})`; },
      substring:   () => {
                     const a = args.map((a: { expr: Expression }) => ctx.exprToC(a.expr, lines, depth));
                     if (a[1] === undefined && baseObject.kind !== 'Ident') {
                       const tmp = `_tsc_str_${ctx.tempCount++}`;
                       lines.push(`${' '.repeat(ctx.indent * depth)}String ${tmp} = ${strObjC};`);
                       return `tsc_string_substring(${tmp}, ${a[0]}, (int32_t)${tmp}.length)`;
                     }
                     return `tsc_string_substring(${strObjC}, ${a[0]}, ${a[1] ?? `(int32_t)${strObjC}.length`})`;
                   },
      trimStart:   () => `tsc_string_trim_start(${strObjC})`,
      trimEnd:     () => `tsc_string_trim_end(${strObjC})`,
      search:      () => {
                     const rArg = args[0]?.expr;
                     const rC = ctx.exprToC(rArg, lines, depth);
                     const rSym = rArg?.kind === 'Ident' ? ctx.lookup(rArg.name) : null;
                      if (rSym?._isRegex && rArg?.kind === 'Ident') return `tsc_regex_search(&${rArg.name}, ${strObjC})`;
                     return `tsc_regex_search(&(TscRegex){0}, ${strObjC})`;
                   },
      match:       () => {
                     const rArg = args[0]?.expr;
                     const rC = ctx.exprToC(rArg, lines, depth);
                     const rSym = rArg?.kind === 'Ident' ? ctx.lookup(rArg.name) : null;
                     ctx._ensureArrayStruct('Array_string', 'String');
                     ctx._ensureOptStruct('opt_Array_string', 'Array_string');
                      if (rSym?._isRegex && rArg?.kind === 'Ident') return `tsc_regex_match(&${rArg.name}, ${strObjC})`;
                     return `tsc_regex_match(&(TscRegex){0}, ${strObjC})`;
                   },
      matchAll:    () => {
                     const rArg = args[0]?.expr;
                     const rSym = rArg?.kind === 'Ident' ? ctx.lookup(rArg.name) : null;
                     ctx._ensureArrayStruct('Array_string', 'String');
                     ctx._ensureArrayStruct('Array_Array_string', 'Array_string');
                      if (rSym?._isRegex && rArg?.kind === 'Ident') return `tsc_regex_match_all(&${rArg.name}, ${strObjC})`;
                     return `tsc_regex_match_all(&(TscRegex){0}, ${strObjC})`;
                   },
    };

    const _smInlineSym = baseObject.kind === 'Ident' ? ctx.lookup(baseObject.name) : null;
    if (_smInlineSym?._isStaticMapInline && prop === 'get') {
      const sym = _smInlineSym;
      if (!sym._getFn) {
        const idx = sym._smIdx;
        const fnName = `_staticmap_${idx}_get`;
        sym._getFn = fnName;
        const entries = sym._entries;
        const n = entries.length;
        const buckets = Math.max(1, n);

        ctx.addTop('typedef struct { bool has_value; int32_t value; } opt_i32;');
        ctx.addTop('');

        const djb2 = (s: string): number => {
          let h = 5381;
          for (let i = 0; i < s.length; i++) {
            h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
          }
          return h;
        };

        const bucketMap = new Map();
        for (const e of entries) {
          const b = djb2(e.key) % buckets;
          if (!bucketMap.has(b)) bucketMap.set(b, []);
          bucketMap.get(b).push(e);
        }

        const fnLines: string[] = [];
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
        if (ctx._strictRules?.has('switch-default')) {
          fnLines.push('        default: break;');
        }
        fnLines.push('    }');
        fnLines.push('    return (opt_i32){false, 0};');
        fnLines.push('}');
        for (const l of fnLines) ctx.topLevel.push(l);
        ctx.topLevel.push('');
        ctx._lastSuppressConst = true;
      }
      const keyC = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      return `${sym._getFn}(${keyC})`;
    }

    const _smSym = baseObject.kind === 'Ident' ? ctx.lookup(baseObject.name) : null;
    if (_smSym?._isStaticMap) {
      const sfx = _smSym._smSuffix;
      const varName = baseObject.kind === 'Ident' ? baseObject.name : '';
      if (prop === 'set')    return `tsc_staticmap_set_${sfx}(&${varName}, ${argsC})`;
      if (prop === 'get')    return `tsc_staticmap_get_${sfx}(&${varName}, ${argsC})`;
      if (prop === 'has')    return `tsc_staticmap_has_${sfx}(&${varName}, ${argsC})`;
      if (prop === 'delete') return `tsc_staticmap_delete_${sfx}(&${varName}, ${argsC})`;
      if (prop === 'clear')  return `tsc_staticmap_clear_${sfx}(&${varName})`;
    }

    const objType2 = (baseObject.kind === 'Ident' ? ctx.lookup(baseObject.name)?.ctype : null)
      ?? ctx.inferType(baseObject);
    const _mapSfx2 = ctx._mapSuffix(objType2);
    if (_mapSfx2) {
      const mapSuffix = _mapSfx2;
      const mapVarName = baseObject.kind === 'Ident' ? baseObject.name : null;
      if (prop === 'set') {
        if (mapVarName) {
          ctx._mapHasSetCalls.add(mapVarName);
        }
        return `tsc_map_set_${mapSuffix}(&${objC}, ${argsC})`;
      }
      if (prop === 'get' || prop === 'delete') {
        if (mapVarName) {
          const hasSet = ctx._mapHasSetCalls?.has(mapVarName) ?? false;
          ctx._lastOptIsNull = !hasSet;
        }
        if (prop === 'get') {
          const parts = mapSuffix.split('_');
          const vIdent = parts.slice(1).join('_');
          const vCType = ctx._arrIdentToCType(vIdent);
          ctx._ensureOptRefStruct(`opt_ref_${vIdent}`, vCType);
          return `tsc_map_get_ref_${mapSuffix}(&${objC}, ${argsC})`;
        }
        if (prop === 'delete') return `tsc_map_delete_${mapSuffix}(&${objC}, ${argsC})`;
      }
      if (prop === 'has')    return `tsc_map_has_${mapSuffix}(&${objC}, ${argsC})`;
      if (prop === 'clear')  return `tsc_map_clear_${mapSuffix}(&${objC})`;
      if (prop === 'forEach') {
        const cbArg = args[0]?.expr;
        if (!cbArg || cbArg.kind !== 'Arrow') return null;
        const parts = mapSuffix.split('_');
        const kIdent = parts[0];
        const vIdent = parts.slice(1).join('_');
        const kCType = ctx._arrIdentToCType(kIdent);
        const vCType = ctx._arrIdentToCType(vIdent);
        ctx._lambdaParamHint = [vCType, kCType];
        const cbFnName = ctx._extractCallbackFn(args[0], lines, depth);
        ctx._lambdaParamHint = null;
        if (!cbFnName) return null;
        return `tsc_map_for_each_${mapSuffix}(&${objC}, ${cbFnName})`;
      }
      if (prop === 'values') {
        const parts = mapSuffix.split('_');
        const vIdent = parts.slice(1).join('_');
        const vCType = ctx._arrIdentToCType(vIdent);
        ctx._ensureArrayStruct(`Array_${vIdent}`, vCType);
        ctx._lastSuppressConst = true;
        return `tsc_map_values_${mapSuffix}(&${objC})`;
      }
      if (prop === 'keys') {
        ctx._lastSuppressConst = true;
        return `tsc_map_keys_${mapSuffix}(&${objC})`;
      }
      if (prop === 'entries') return `tsc_map_entries_${mapSuffix}(&${objC})`;
    }

    const numMethods: Record<string, () => string> = {
      toFixed: () => {
        const objType = ctx.inferType(baseObject);
        const decBase = resolveDecimalBase(ctx, objType);
        const nArg = args[0]?.expr;
        if (!nArg || nArg.kind !== 'Literal')
          throw ctx.error(`"toFixed()" argument must be a compile-time literal`);
        const n = nArg.value;
        const buf = `_buf_${ctx.tempCount++}`;
        lines.push(`char ${buf}[64];`);
        if (decBase) {
          const scale = decimalScale(decBase)!;
          lines.push(`snprintf(${buf}, sizeof(${buf}), "%.${n}f", (double)(${objC}) / ${scale}.0);`);
        } else {
          if (objType === 'int32_t' || objType === 'int64_t' || objType === 'uint32_t')
            throw ctx.errorCode('E120', null, { detail: '"toFixed()" is only available on f32/f64/decimal' });
          lines.push(`snprintf(${buf}, sizeof(${buf}), "%.${n}f", ${objC});`);
        }
        return `STR_LIT_RUNTIME(${buf})`;
      },
      toPrecision: () => {
        const objType = ctx.inferType(baseObject);
        const decBase = resolveDecimalBase(ctx, objType);
        const nArg = args[0]?.expr;
        if (!nArg || nArg.kind !== 'Literal')
          throw ctx.error(`"toPrecision()" argument must be a compile-time literal`);
        const n = nArg.value;
        const buf = `_buf_${ctx.tempCount++}`;
        lines.push(`char ${buf}[64];`);
        if (decBase) {
          const scale = decimalScale(decBase)!;
          lines.push(`snprintf(${buf}, sizeof(${buf}), "%.*g", ${n}, (double)(${objC}) / ${scale}.0);`);
        } else {
          lines.push(`snprintf(${buf}, sizeof(${buf}), "%.*g", ${n}, ${objC});`);
        }
        return `STR_LIT_RUNTIME(${buf})`;
      },
    };

    const hasOwn = (obj: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(obj, k);
    if (hasOwn(strMethods, prop) && strMethods[prop]) return strMethods[prop]();
    if (hasOwn(numMethods, prop) && numMethods[prop]) return numMethods[prop]();

    if (prop === 'toString') {
      const objType5 = (baseObject.kind === 'Ident' ? ctx.lookup(baseObject.name)?.ctype : null)
                       ?? ctx.inferType(baseObject);
      if (objType5 === 'String') return objC;
      if (objType5 && !objType5.startsWith('Array_') && !ctx._mapSuffix(objType5) &&
          !objType5.startsWith('opt_') && objType5 !== 'void') {
        const etId5 = ctx.cTypeToIdent(objType5);
        return `tsc_${etId5}_to_string(${objC})`;
      }
    }

    if (baseObject.kind === 'Ident' && ctx.classes.has(baseObject.name)) {
      const poolDef = ctx.classes.get(baseObject.name);
      if (poolDef?._isPool && prop === 'alloc') {
        throw ctx.error(`PoolClass.alloc() is removed; use "new ${baseObject.name}()" instead`, baseObject);
      }
      if (poolDef?._isPool && prop === 'drop') {
        ctx._ensurePoolDrop(baseObject.name);
        return `${poolDef._poolDropFn}(${argsC})`;
      }
    }

    if (prop === 'upgrade' && sym?.isWeak) {
      return `tsc_weak_upgrade(${objC})`;
    }

    if (baseObject.kind === 'Ident' && ctx.classes.has(baseObject.name)) {
      const classDef = ctx.classes.get(baseObject.name);
      const methodInfo = classDef?._methodNames?.get(prop);
      if (methodInfo?.isStatic) {
        return `${methodInfo.nameMangled}(${argsC})`;
      }
      if (ctx._platformSkipped?.has(`${baseObject.name}.${prop}`)) {
        const allowed = ctx._platformSkipped.get(`${baseObject.name}.${prop}`)!.join('", "');
        const target = ctx._targetName ?? DEFAULT_TARGET;
        throw ctx.error(`TypeError: '${baseObject.name}.${prop}' is only available on platform "${allowed}", but current target is "${target}"`);
      }
    }

    const ifaceSym = baseObject.kind === 'Ident' ? ctx.lookup(baseObject.name) : null;
    if (ifaceSym?.ctype && ctx.interfaces.has(ifaceSym.ctype)) {
      const ifaceArgsC = argsC ? `, ${argsC}` : '';
      return `${objC}.vtable->${prop}(${objC}.self${ifaceArgsC})`;
    }

    const objType = ctx.inferType(baseObject);
    if (objType?.startsWith('Promise_') && (prop === 'then' || prop === 'catch' || prop === 'finally')) {
      const innerType = objType.slice(8);
      const innerCType = ctx._arrIdentToCType(innerType);
      const I = ' '.repeat(ctx.indent * depth);
      const cbRetType = ctx._lastCbRetType ?? innerCType;
      const cbRetIdent = ctx.cTypeToIdent(cbRetType);
      const resultPromiseType = `Promise_${cbRetIdent}`;

      if (prop === 'then') {
        ctx._emitPromiseTypedef(resultPromiseType, cbRetType);
        const tmpName = `_then_${ctx.tempCount++}`;
        lines.push(`${I}${cbRetType} ${tmpName} = ${cbFnName}(${objC}._result);`);
        ctx.define(tmpName, { ctype: cbRetType, varKind: 'const' });
        return `(${resultPromiseType}){._done = true, ._result = ${tmpName}, ._ok = true}`;
      }
      if (prop === 'catch') {
        ctx._emitPromiseTypedef(resultPromiseType, cbRetType);
        const tmpName = `_catch_${ctx.tempCount++}`;
        lines.push(`${I}${cbRetType} ${tmpName} = ${objC}._ok ? ${objC}._result : ${cbFnName}(${objC}._error);`);
        ctx.define(tmpName, { ctype: cbRetType, varKind: 'const' });
        return `(${resultPromiseType}){._done = true, ._result = ${tmpName}, ._ok = true}`;
      }
      if (prop === 'finally') {
        ctx._emitPromiseTypedef(objType, innerCType);
        lines.push(`${I}${cbFnName}();`);
        return objC;
      }
    }

    const classSym = baseObject.kind === 'Ident' ? ctx.lookup(baseObject.name) : null;
    if (classSym?._isHeap) {
      const poolClassName = classSym.ctype!.replace(/ \*$/, '');
      const poolCls = ctx.classes.get(poolClassName);
      if (poolCls) {
        const methodInfo = poolCls._methodNames?.get(prop);
        if (methodInfo?.isMoveMethod) {
          if (classSym.varKind === 'const') {
            throw ctx.errorCode('E003', null, { name: baseObject.kind === 'Ident' ? baseObject.name : '?' });
          }
          return `${methodInfo.nameMangled}(*${objC}${argsC ? ', ' + argsC : ''})`;
        }
        if (methodInfo?.isExplicitMut && classSym.varKind === 'const') {
          throw ctx.errorCode('E013');
        }
        if (methodInfo) {
          return `${poolClassName}_${prop}(${objC}${argsC ? ', ' + argsC : ''})`;
        }
      }
    }
    if (classSym?.ctype?.startsWith('opt_ref_')) {
      const poolClassName = classSym.ctype.slice(8);
      const poolCls = ctx.classes.get(poolClassName);
      if (poolCls?._isPool) {
        const methodInfo = poolCls._methodNames?.get(prop);
        if (methodInfo?.isMoveMethod) {
          if (classSym.varKind === 'const') {
            throw ctx.errorCode('E003', null, { name: baseObject.kind === 'Ident' ? baseObject.name : '?' });
          }
          return `${methodInfo.nameMangled}(*${objC}.value${argsC ? ', ' + argsC : ''})`;
        }
        if (methodInfo?.isExplicitMut && classSym.varKind === 'const') {
          throw ctx.errorCode('E013');
        }
        if (methodInfo) {
          return `${poolClassName}_${prop}(${objC}.value${argsC ? ', ' + argsC : ''})`;
        }
      }
    }
    if (classSym?.ctype && ctx.classes.has(classSym.ctype)) {
      const classDef2 = ctx.classes.get(classSym.ctype);
      const methodInfo2 = classDef2?._methodNames?.get(prop);
      if (methodInfo2?.isMoveMethod) {
        if (classSym.varKind === 'const') {
          throw ctx.errorCode('E003', null, { name: baseObject.kind === 'Ident' ? baseObject.name : '?' });
        }
        return `${methodInfo2.nameMangled}(${objC}${argsC ? ', ' + argsC : ''})`;
      }
      if (methodInfo2?.isExplicitMut && classSym.varKind === 'const') {
        throw ctx.errorCode('E013');
      }
      if (methodInfo2) {
        return `${classSym.ctype}_${prop}(&${objC}${argsC ? ', ' + argsC : ''})`;
      }
    }

    if (ctx._extensions) {
      const objType = ctx.inferType(baseObject);
      if (objType) {
        const typeIdent = ctx.cTypeToIdent(objType);
        const extKey = `${typeIdent}.${prop}`;
        const ext = ctx._extensions.get(extKey);
        if (ext) {
          return `${ext.cFuncName}(${objC}${argsC ? ', ' + argsC : ''})`;
        }
      }
    }

    if (classSym?.ctype && ctx.classes.has(classSym.ctype)) {
      if (ctx._platformSkipped?.has(`${classSym.ctype}.${prop}`)) {
        const allowed = ctx._platformSkipped.get(`${classSym.ctype}.${prop}`)!.join('", "');
        const target = ctx._targetName ?? DEFAULT_TARGET;
        throw ctx.error(`TypeError: '${classSym.ctype}.${prop}' is only available on platform "${allowed}", but current target is "${target}"`);
      }
      return `${classSym.ctype}_${prop}(&${objC}${argsC ? ', ' + argsC : ''})`;
    }
    return `${objC}.${prop}(${argsC})`;
}

export function argsToC(ctx: CodeGenContext, args: Argument[], lines: string[], depth: number) {
    const parts: string[] = [];
    const I = ' '.repeat(ctx.indent * depth);
    for (const a of args) {
      if (a.spread) {
        const spreadSym = a.expr?.kind === 'Ident' ? ctx.lookup(a.expr.name) : null;
        if (spreadSym?.isArray && spreadSym.arraySize >= 0) {
          const n = a.expr?.kind === 'Ident' ? a.expr.name : '';
          const useData = spreadSym.ctype?.startsWith('Array_');
          for (let i = 0; i < spreadSym.arraySize; i++)
            parts.push(useData ? `${n}.data[${i}]` : `${n}[${i}]`);
        } else {
          parts.push(`/* ...${ctx.exprToC(a.expr, lines, depth)} */`);
        }
      } else {
        let c = ctx.exprToC(a.expr, lines, depth);
        if (ctx._isHeapStringInit(a.expr)) {
          const tmp = `_arg_${ctx.tempCount++}`;
          lines.push(`${I}String ${tmp} = ${c};`);
          ctx._pushPostStmtCleanup(`${I}tsc_string_release(${tmp});`);
          c = tmp;
        }
        parts.push(c);
      }
    }
    return parts.join(', ');
}

export function _getIfaceParamName(ctx: CodeGenContext, typeAnn: TypeAnn | null | undefined) {
    if (!typeAnn || typeAnn.kind !== 'TypeRef') return null;
    if (ctx.interfaces.has(typeAnn.name)) return typeAnn.name;
    if ((typeAnn.name === 'Mut' || typeAnn.name === 'Ref') && typeAnn.typeArgs?.[0]?.kind === 'TypeRef') {
      const inner = typeAnn.typeArgs[0].name;
      if (ctx.interfaces.has(inner)) return inner;
    }
    return null;
}

export function _extractCallbackFn(ctx: CodeGenContext, arg: Argument, lines: string[], depth: number) {
    const expr = arg.expr ?? arg;
    if (expr.kind === 'Arrow') {
      if (ctx._strictRules?.has('no-closures')) {
        throw ctx.errorCode('E200', expr);
      }
      const closure = ctx.hoistClosure(expr, `_cb_${ctx.closureCount ?? 0}`);
      if (closure) {
        if (closure.retainLines?.length) {
          const I = ' '.repeat(ctx.indent * depth);
          for (const rl of closure.retainLines) lines.push(`${I}${rl}`);
        }
        const envIdx = ctx.closureCount - 1;
        const envLocal = `_cb_env_${envIdx}`;
        const envGlobal = `_tsc_cb_env_${envIdx}`;
        ctx.addLambda(`static ${closure.envName} *${envGlobal};`);
        lines.push(`${' '.repeat(ctx.indent * depth)}${closure.envName} *${envLocal} = tsc_malloc(sizeof(${closure.envName}));`);
        lines.push(`${' '.repeat(ctx.indent * depth)}*${envLocal} = (${closure.envName})${closure.envInit};`);
        lines.push(`${' '.repeat(ctx.indent * depth)}${envGlobal} = ${envLocal};`);
        const hint = ctx._lambdaParamHint ?? [];
        const adapterParams = hint.length > 0
          ? hint.map((ct: string, i: number) => `${ct} _p${i}`).join(', ')
          : 'void *_elem';
        const adapterArgs = hint.length > 0
          ? hint.map((_ct: string, i: number) => `_p${i}`).join(', ')
          : '_elem';
        const adapterName = `${closure.closureName}_adapter`;
        ctx.addLambda(`static ${closure.ret} ${adapterName}(${adapterParams}) {`);
        if (closure.ret === 'void') {
          ctx.addLambda(`    ${closure.fnName}(${envGlobal}, ${adapterArgs});`);
        } else {
          ctx.addLambda(`    return ${closure.fnName}(${envGlobal}, ${adapterArgs});`);
        }
        ctx.addLambda(`}`);
        ctx.addLambda('');
        ctx._lastCbRetType = closure.ret;
        return adapterName;
      }
      const fnName = ctx.hoistArrow(expr, 'void', '_cb');
      ctx._lastCbRetType = ctx.inferArrowReturn(expr);
      return fnName;
    }
    if (expr.kind === 'Ident') {
      const sym = ctx.lookup(expr.name);
      if (sym?._closureFnName) { ctx._lastCbRetType = sym.closureRetType; return sym._closureFnName; }
      if (sym?.funcName) { ctx._lastCbRetType = sym.ctype!; return sym.funcName; }
    }

    return null;
}

export function _ensureImplicitVtable(ctx: CodeGenContext, className: string, ifaceName: string) {
    const key = `${className}_${ifaceName}`;
    if (ctx._emittedImplicitVtables.has(key)) return;
    ctx._emittedImplicitVtables.add(key);

    const ifaceDef = ctx.interfaces.get(ifaceName);
    if (!ifaceDef) return;
    const ifaceMethods = ifaceDef.filter((m: { kind: string }) => m.kind === 'MethodSig');
    const classDef = ctx.classes.get(className);
    for (const im of ifaceMethods) {
      const methodExists = classDef?.methods?.some((mm) => mm.name === im.name);
      if (!methodExists) {
        throw ctx.errorCode('E118', null, { detail: `class '${className}' does not implement interface '${ifaceName}': missing method '${im.name}'` });
      }
    }
    const vtableName = `_${className}_${ifaceName}_vtable`;

    const entries = ifaceMethods.map((m) => {
      const retType = ('returnType' in m && m.returnType) ? ctx.resolveType(m.returnType) : 'void';
      return `    .${m.name} = (${retType} (*)(void *))${className}_${m.name}`;
    });
    ctx.topLevel.push(
      `static const ${ifaceName}_vtable ${vtableName} = {`,
      ...entries.map((e: string) => e + ','),
      `};`,
      ``
    );
}
