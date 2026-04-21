// TSClang Parser
// Produces an AST from a token stream.

import { TK, KEYWORDS } from './lexer.js';
import { TscError } from './error.js';

export function parse(tokens, filename = '<input>', src = null) {
  let pos = 0;

  function cur()  { return tokens[pos]; }
  function peek(n = 1) { return tokens[pos + n]; }
  function done() { return cur().type === TK.EOF; }

  function err(msg, tok = cur()) {
    throw new TscError(msg, {
      filename,
      line:   tok.line,
      col:    tok.col,
      endCol: tok.endCol,
      src,
    });
  }

  function eat(type, value = null) {
    const t = cur();
    if (t.type !== type) err(`Expected ${type}${value ? ' "' + value + '"' : ''}, got ${t.type} "${t.value}"`);
    if (value !== null && t.value !== value) err(`Expected "${value}", got "${t.value}"`);
    pos++;
    return t;
  }

  function tryEat(type, value = null) {
    const t = cur();
    if (t.type !== type) return null;
    if (value !== null && t.value !== value) return null;
    pos++;
    return t;
  }

  function eatSemi() { tryEat(TK.SEMI); } // optional semicolons

  // Eat a closing '>' for type args; handles >> and >>> by splitting them into single GT tokens
  function eatGT() {
    if (cur().type === TK.RSHIFT) {
      // '>>' → split into two '>' tokens, consume one
      tokens.splice(pos, 1,
        { type: TK.GT, value: '>', line: cur().line, col: cur().col },
        { type: TK.GT, value: '>', line: cur().line, col: cur().col + 1 });
    } else if (cur().type === TK.RSHIFTU) {
      // '>>>' → split into three '>' tokens, consume one
      tokens.splice(pos, 1,
        { type: TK.GT, value: '>', line: cur().line, col: cur().col },
        { type: TK.GT, value: '>', line: cur().line, col: cur().col + 1 },
        { type: TK.GT, value: '>', line: cur().line, col: cur().col + 2 });
    }
    eat(TK.GT);
  }

  // -------------------------------------------------------------------------
  // Type annotation  e.g. : i32 | null, : string[], : Map<K,V>
  // -------------------------------------------------------------------------
  function parseTypeAnnotation() {
    return parseTypeUnion();
  }

  function parseTypeUnion() {
    let t = parseTypeSingle();
    while (cur().type === TK.PIPE) {
      eat(TK.PIPE);
      const right = parseTypeSingle();
      t = { kind: 'TypeUnion', types: [t, right] };
    }
    return t;
  }

  function parseTypeSingle() {
    // Parenthesized type or function type: (T1, T2) => R or ((T) => R)[]
    if (cur().type === TK.LPAREN) {
      // Lookahead: scan for matching ')' and check if followed by '=>'
      let depth = 0, k = pos;
      while (k < tokens.length) {
        if (tokens[k].type === TK.LPAREN) depth++;
        else if (tokens[k].type === TK.RPAREN) { depth--; if (depth === 0) break; }
        k++;
      }
      const afterParen = tokens[k + 1]?.type;
      if (afterParen === TK.ARROW) {
        // Function type: (T1, T2, ...) => R
        eat(TK.LPAREN);
        const paramTypes = [];
        while (cur().type !== TK.RPAREN) {
          // Allow optional param name before type: (x: i32) or just (i32)
          if (cur().type === TK.IDENT && peek().type === TK.COLON) {
            eat(TK.IDENT); eat(TK.COLON);
          }
          paramTypes.push(parseTypeUnion());
          tryEat(TK.COMMA);
        }
        eat(TK.RPAREN);
        eat(TK.ARROW);
        const ret = parseTypeUnion();
        let t = { kind: 'TypeFunc', params: paramTypes, ret };
        while (cur().type === TK.LBRACK && peek().type === TK.RBRACK) {
          eat(TK.LBRACK); eat(TK.RBRACK);
          t = { kind: 'TypeArray', element: t };
        }
        return t;
      } else {
        // Grouped type: ((T) => R)[] — parse inner and apply array suffix
        eat(TK.LPAREN);
        let t = parseTypeUnion();
        eat(TK.RPAREN);
        while (cur().type === TK.LBRACK && peek().type === TK.RBRACK) {
          eat(TK.LBRACK); eat(TK.RBRACK);
          t = { kind: 'TypeArray', element: t };
        }
        return t;
      }
    }

    // Pointer type: *T
    if (cur().type === TK.STAR) {
      eat(TK.STAR);
      const pointee = parseTypeSingle();
      return { kind: 'TypePointer', pointee };
    }

    // String literal type: "north"
    if (cur().type === TK.STRING) {
      const val = eat(TK.STRING).value;
      return { kind: 'TypeLiteral', litKind: 'string', value: val };
    }

    // Number literal type: 42
    if (cur().type === TK.NUMBER) {
      const val = eat(TK.NUMBER).value;
      return { kind: 'TypeLiteral', litKind: 'number', value: val };
    }

    // null/undefined in type position: i32 | null
    if (cur().type === TK.NULL) {
      eat(TK.NULL);
      return { kind: 'TypeRef', name: 'null', typeArgs: [] };
    }

    // Tuple type: [T1, T2] or readonly [T1, T2] or labeled [x: T, y: T]
    {
      let isTupleReadonly = false;
      if (cur().type === TK.IDENT && cur().value === 'readonly' && peek().type === TK.LBRACK) {
        eat(TK.IDENT); // consume 'readonly'
        isTupleReadonly = true;
      }
      if (cur().type === TK.LBRACK) {
        eat(TK.LBRACK);
        const elements = [];
        while (cur().type !== TK.RBRACK) {
          let label = null;
          let rest = false;
          let optional = false;
          if (cur().type === TK.SPREAD) { eat(TK.SPREAD); rest = true; }
          // Labeled element: name: T (but not rest)
          if (!rest && cur().type === TK.IDENT && peek().type === TK.COLON) {
            label = eat(TK.IDENT).value;
            eat(TK.COLON);
          }
          const elemType = parseTypeUnion();
          if (!rest && cur().type === TK.QUEST) { eat(TK.QUEST); optional = true; }
          elements.push({ typeAnn: elemType, label, rest, optional });
          tryEat(TK.COMMA);
        }
        eat(TK.RBRACK);
        // Structural tuple validations
        const restCount = elements.filter(e => e.rest).length;
        if (restCount > 1) err('tuple cannot have more than one rest element');
        const restIdx = elements.findIndex(e => e.rest);
        if (restIdx !== -1 && restIdx !== elements.length - 1) err('rest element must be the last element in a tuple');
        const hasOptional = elements.some(e => e.optional);
        const hasRest = restCount > 0;
        if (hasOptional && hasRest) err('tuple cannot have both optional and rest elements');
        if (hasOptional) {
          let seenOptional = false;
          for (const el of elements) {
            if (el.optional) { seenOptional = true; }
            else if (seenOptional) err('optional tuple element must be at the end');
          }
        }
        const hasLabeled = elements.some(e => e.label);
        const hasUnlabeled = elements.some(e => !e.label && !e.rest);
        if (hasLabeled && hasUnlabeled) err('tuple labels must be all-or-nothing: mix of labeled and unlabeled elements');
        for (const el of elements) {
          if (el.label === 'length') err('"length" is a reserved label for tuples');
        }
        let t = { kind: 'TypeTuple', elements, readonly: isTupleReadonly };
        // Array suffix: [T1, T2][]
        while (cur().type === TK.LBRACK && peek().type === TK.RBRACK) {
          eat(TK.LBRACK); eat(TK.RBRACK);
          t = { kind: 'TypeArray', element: t };
        }
        return t;
      }
      // If we consumed 'readonly' but didn't find '[', put back is not possible
      // but this case shouldn't happen in valid code (readonly is only for arrays/tuples in types)
    }

    // Inline object type: { x: f64; y: f64 } or { getX(): i32; }
    if (cur().type === TK.LBRACE) {
      eat(TK.LBRACE);
      const fields = [];
      while (cur().type !== TK.RBRACE) {
        const fname = eat(TK.IDENT).value;
        const fopt = tryEat(TK.QUEST) !== null;
        if (cur().type === TK.LPAREN) {
          // Method signature: name(params): returnType
          eat(TK.LPAREN);
          while (cur().type !== TK.RPAREN) { parseTypeAnnotation(); tryEat(TK.COMMA); }
          eat(TK.RPAREN);
          eat(TK.COLON);
          const retType = parseTypeUnion();
          fields.push({ name: fname, typeAnn: { kind: 'TypeFunc', params: [], ret: retType }, optional: fopt, isMethod: true });
        } else {
          eat(TK.COLON);
          const ftype = parseTypeUnion();
          fields.push({ name: fname, typeAnn: ftype, optional: fopt });
        }
        tryEat(TK.SEMI); tryEat(TK.COMMA);
      }
      eat(TK.RBRACE);
      return { kind: 'TypeObject', fields };
    }

    // Optional prefix: Ref<T>, Mut<T>, Shared<T>, Weak<T>, etc.
    // keyof T in type position
    if (cur().type === TK.IDENT && cur().value === 'keyof') {
      eat(TK.IDENT);
      const target = parseTypeSingle();
      return { kind: 'TypeKeyOf', target };
    }

    // typeof X in type position (e.g. ReturnType<typeof fn>)
    if (cur().type === TK.IDENT && cur().value === 'typeof') {
      eat(TK.IDENT);
      const targetName = eat(TK.IDENT).value;
      return { kind: 'TypeTypeof', name: targetName };
    }

    let name = '';
    if (cur().type === TK.IDENT) {
      name = eat(TK.IDENT).value;
    }

    let typeArgs = [];
    if (cur().type === TK.LT) {
      eat(TK.LT);
      typeArgs.push(parseTypeUnion());
      while (tryEat(TK.COMMA)) typeArgs.push(parseTypeUnion());
      eatGT();
    }

    let t = { kind: 'TypeRef', name, typeArgs };

    // Fixed-size array suffix: T[N]
    if (cur().type === TK.LBRACK && peek().type === TK.NUMBER) {
      eat(TK.LBRACK);
      const sizeTok = eat(TK.NUMBER);
      eat(TK.RBRACK);
      return { kind: 'TypeFixedArray', element: t, size: parseInt(sizeTok.value, 10) };
    }

    // Array suffix: T[]
    while (cur().type === TK.LBRACK && peek().type === TK.RBRACK) {
      eat(TK.LBRACK); eat(TK.RBRACK);
      t = { kind: 'TypeArray', element: t };
    }

    return t;
  }

  // -------------------------------------------------------------------------
  // Decorators  @name, @name(args)
  // -------------------------------------------------------------------------
  function parseDecorators() {
    const decorators = [];
    while (cur().type === TK.AT) {
      eat(TK.AT);
      let name = eat(TK.IDENT).value;
      // @embedded.inline etc.
      while (cur().type === TK.DOT) { eat(TK.DOT); name += '.' + eat(TK.IDENT).value; }
      let args = null;
      if (cur().type === TK.LPAREN) {
        eat(TK.LPAREN);
        args = [];
        while (cur().type !== TK.RPAREN) {
          args.push(parseExpr());
          tryEat(TK.COMMA);
        }
        eat(TK.RPAREN);
      }
      decorators.push({ name, args });
    }
    return decorators;
  }

  // -------------------------------------------------------------------------
  // Statements
  // -------------------------------------------------------------------------
  function parseProgram() {
    const body = [];
    while (!done()) {
      // #[...] — profile/target annotation
      if (cur().type === TK.HASH && peek().type === TK.LBRACK) {
        eat(TK.HASH); eat(TK.LBRACK);
        let content = '';
        let depth = 1;
        while (!done() && depth > 0) {
          if (cur().type === TK.LBRACK) depth++;
          else if (cur().type === TK.RBRACK) { depth--; if (depth === 0) break; }
          content += cur().value;
          pos++;
        }
        eat(TK.RBRACK);
        body.push({ kind: 'ProfileAnnotation', content });
        continue;
      }
      body.push(parseStmt());
    }
    return { kind: 'Program', body };
  }

  function parseStmt() {
    const decorators = parseDecorators();

    const t = cur();

    if (t.type === TK.IDENT && t.value === 'import') return parseImport();
    if (t.type === TK.IDENT && t.value === 'export') return parseExport();
    if (t.type === TK.IDENT && t.value === 'let')    return parseVarDecl('let', decorators);
    if (t.type === TK.IDENT && t.value === 'const')  return parseVarDecl('const', decorators);
    if (t.type === TK.IDENT && t.value === 'var')    return parseVarDecl('var', decorators);
    if (t.type === TK.IDENT && t.value === 'function')  return parseFunctionDecl(decorators);
    if (t.type === TK.IDENT && t.value === 'decorator' && pos + 1 < tokens.length && tokens[pos + 1]?.value === 'function') {
      pos++; // eat 'decorator'
      const decl = parseFunctionDecl(decorators);
      decl.isDecorator = true;
      return decl;
    }
    if (t.type === TK.IDENT && t.value === 'extension') return parseExtensionFunc();
    if (t.type === TK.IDENT && t.value === 'async')  return parseAsyncDecl(decorators);
    if (t.type === TK.IDENT && t.value === 'class')  return parseClassDecl(decorators);
    if (t.type === TK.IDENT && t.value === 'interface') return parseInterface();
    if (t.type === TK.IDENT && t.value === 'enum')   return parseEnum();
    if (t.type === TK.IDENT && t.value === 'type')   return parseTypeAlias();
    if (t.type === TK.IDENT && t.value === 'return') return parseReturn();
    if (t.type === TK.IDENT && t.value === 'if')     return parseIf();
    if (t.type === TK.IDENT && t.value === 'for')    return parseFor();
    if (t.type === TK.IDENT && t.value === 'while')  return parseWhile();
    if (t.type === TK.IDENT && t.value === 'do')     return parseDoWhile();
    if (t.type === TK.IDENT && t.value === 'break') {
      eat(TK.IDENT);
      const label = (cur().type === TK.IDENT && !KEYWORDS.has(cur().value) && cur().type !== TK.SEMI)
        ? eat(TK.IDENT).value : null;
      eatSemi();
      return { kind: 'Break', label };
    }
    if (t.type === TK.IDENT && t.value === 'continue') {
      eat(TK.IDENT);
      const label = (cur().type === TK.IDENT && !KEYWORDS.has(cur().value) && cur().type !== TK.SEMI)
        ? eat(TK.IDENT).value : null;
      eatSemi();
      return { kind: 'Continue', label };
    }
    if (t.type === TK.IDENT && t.value === 'throw')  return parseThrow();
    if (t.type === TK.IDENT && t.value === 'try')    return parseTryCatch();
    if (t.type === TK.IDENT && t.value === 'switch') return parseSwitch();
    if (t.type === TK.IDENT && t.value === 'native') return parseNative();
    if (t.type === TK.IDENT && t.value === 'unsafe') return parseUnsafe();
    if (t.type === TK.IDENT && t.value === 'spawn')  return parseSpawn();
    if (t.type === TK.IDENT && t.value === 'declare') return parseDeclare();
    if (t.type === TK.LBRACE) return parseBlock();

    // @embedded.stack_push/pop/empty as standalone statement (decorators consumed above but not a decl)
    if (decorators.length > 0) {
      // Emit each decorator as an EmbeddedMacro ExprStmt
      const stmts = decorators.map(d => ({
        kind: 'ExprStmt',
        expr: { kind: 'EmbeddedMacro', name: d.name, typeArgs: [], args: d.args ?? [] },
      }));
      eatSemi();
      return stmts.length === 1 ? stmts[0] : { kind: 'Block', body: stmts };
    }

    // Labeled statement: IDENT: stmt
    if (t.type === TK.IDENT && !KEYWORDS.has(t.value) && peek().type === TK.COLON) {
      const label = eat(TK.IDENT).value;
      eat(TK.COLON);
      const body = parseStmt();
      return { kind: 'Labeled', label, body };
    }

    // Expression statement
    const exprLine = cur().line;
    const expr = parseExpr();
    eatSemi();
    return { kind: 'ExprStmt', expr, line: exprLine };
  }

  function parseDeclare() {
    eat(TK.IDENT, 'declare');
    if (cur().type === TK.IDENT && (cur().value === 'const' || cur().value === 'let')) {
      const varKind = eat(TK.IDENT).value;
      const name = eat(TK.IDENT).value;
      eat(TK.COLON);
      const typeAnn = parseTypeAnnotation();
      let init = null;
      if (tryEat(TK.EQ)) init = parseExpr();
      eatSemi();
      return { kind: 'DeclareConst', name, typeAnn, init };
    }
    if (cur().type === TK.IDENT && cur().value === 'function') {
      eat(TK.IDENT, 'function');
      const name = eat(TK.IDENT).value;
      const params = parseParams();
      let returnType = null;
      if (tryEat(TK.COLON)) returnType = parseTypeAnnotation();
      eatSemi();
      return { kind: 'DeclareFunction', name, params, returnType };
    }
    // declare module "name" { ... } → ambient module declaration (declaration merging)
    if (cur().type === TK.IDENT && cur().value === 'module') {
      eat(TK.IDENT, 'module');
      const moduleName = eat(TK.STRING).value;
      eat(TK.LBRACE);
      const body = [];
      while (!done() && cur().type !== TK.RBRACE) {
        if (cur().type === TK.IDENT && cur().value === 'function') {
          eat(TK.IDENT, 'function');
          const name = eat(TK.IDENT).value;
          const params = parseParams();
          let returnType = null;
          if (tryEat(TK.COLON)) returnType = parseTypeAnnotation();
          eatSemi();
          body.push({ kind: 'DeclareFunction', name, params, returnType });
        } else if (cur().type === TK.IDENT && (cur().value === 'const' || cur().value === 'let')) {
          const varKind = eat(TK.IDENT).value;
          const name = eat(TK.IDENT).value;
          eat(TK.COLON);
          const typeAnn = parseTypeAnnotation();
          eatSemi();
          body.push({ kind: 'DeclareConst', name, typeAnn });
        } else {
          // Skip unknown
          while (!done() && cur().type !== TK.SEMI && cur().type !== TK.RBRACE) pos++;
          tryEat(TK.SEMI);
        }
      }
      eat(TK.RBRACE);
      return { kind: 'DeclareModule', moduleName, body };
    }
    // Skip unknown declare forms
    while (!done() && cur().type !== TK.SEMI && cur().type !== TK.RBRACE) pos++;
    tryEat(TK.SEMI);
    return { kind: 'Noop' };
  }

  function parseImport() {
    eat(TK.IDENT, 'import');
    // import type { X } from "..." — type-only imports (compile-time only, no C emit)
    const isTypeOnly = cur().type === TK.IDENT && cur().value === 'type';
    if (isTypeOnly) eat(TK.IDENT, 'type');
    const names = [];
    let namespace = false;
    if (tryEat(TK.LBRACE)) {
      while (cur().type !== TK.RBRACE) {
        names.push(eat(TK.IDENT).value);
        tryEat(TK.COMMA);
      }
      eat(TK.RBRACE);
    } else if (cur().type !== TK.IDENT || cur().value !== 'from') {
      // Namespace import: import X from "./module"
      names.push(eat(TK.IDENT).value);
      namespace = true;
    }
    eat(TK.IDENT, 'from');
    const source = eat(TK.STRING).value;
    eatSemi();
    return { kind: 'Import', names, source, namespace, typeOnly: isTypeOnly };
  }

  function parseExport() {
    eat(TK.IDENT, 'export');
    if (cur().type === TK.IDENT && cur().value === 'default') {
      eat(TK.IDENT);
      const decl = parseStmt();
      return { kind: 'Export', default: true, decl };
    }
    // export { X, Y } from "./module"  OR  export { X, Y }
    if (cur().type === TK.LBRACE) {
      eat(TK.LBRACE);
      const names = [];
      while (cur().type !== TK.RBRACE) {
        names.push(eat(TK.IDENT).value);
        tryEat(TK.COMMA);
      }
      eat(TK.RBRACE);
      let source = null;
      if (cur().type === TK.IDENT && cur().value === 'from') {
        eat(TK.IDENT, 'from');
        source = eat(TK.STRING).value;
      }
      eatSemi();
      return { kind: 'ExportFrom', names, source };
    }
    const decl = parseStmt();
    return { kind: 'Export', default: false, decl };
  }

  function parseVarDecl(kind, decorators = []) {
    const startLine = cur().line;
    eat(TK.IDENT, kind);
    // const enum Foo { ... }
    if (kind === 'const' && cur().type === TK.IDENT && cur().value === 'enum') {
      const node = parseEnum();
      node.isConst = true;
      return node;
    }
    // Destructuring
    if (cur().type === TK.LBRACE) {
      const pattern = parseObjectPattern();
      let typeAnn = null;
      if (tryEat(TK.COLON)) typeAnn = parseTypeAnnotation();
      eat(TK.EQ);
      const init = parseExpr();
      eatSemi();
      return { kind: 'VarDestructObj', varKind: kind, pattern, typeAnn, init };
    }
    if (cur().type === TK.LBRACK) {
      const pattern = parseArrayPattern();
      let typeAnn = null;
      if (tryEat(TK.COLON)) typeAnn = parseTypeAnnotation();
      eat(TK.EQ);
      const init = parseExpr();
      eatSemi();
      return { kind: 'VarDestructArr', varKind: kind, pattern, typeAnn, init };
    }

    const name = eat(TK.IDENT).value;
    let typeAnn = null;
    let optionalVar = false;
    if (cur().type === TK.QUEST && peek().type === TK.COLON) {
      eat(TK.QUEST);
      optionalVar = true;
    }
    if (tryEat(TK.COLON)) typeAnn = parseTypeAnnotation();
    if (optionalVar && typeAnn) {
      typeAnn = { kind: 'TypeUnion', types: [typeAnn, { kind: 'TypeRef', name: 'null', typeArgs: [] }] };
    }
    let init = null;
    if (tryEat(TK.EQ)) init = parseExpr();
    if (optionalVar && !init) init = { kind: 'Literal', litType: 'null', value: 'null' };
    eatSemi();
    return { kind: 'VarDecl', varKind: kind, name, typeAnn, init, decorators, line: startLine };
  }

  function parseObjectPattern() {
    eat(TK.LBRACE);
    const props = [];
    while (cur().type !== TK.RBRACE) {
      const name = eat(TK.IDENT).value;
      let alias = name, defaultVal = null;
      if (tryEat(TK.COLON)) alias = eat(TK.IDENT).value;
      if (tryEat(TK.EQ)) defaultVal = parseExpr();
      props.push({ name, alias, defaultVal });
      tryEat(TK.COMMA);
    }
    eat(TK.RBRACE);
    return props;
  }

  function parseArrayPattern() {
    eat(TK.LBRACK);
    const elems = [];
    while (cur().type !== TK.RBRACK) {
      if (tryEat(TK.COMMA)) { elems.push(null); continue; }
      if (cur().type === TK.SPREAD) {
        eat(TK.SPREAD);
        elems.push({ rest: true, name: eat(TK.IDENT).value });
      } else {
        elems.push({ rest: false, name: eat(TK.IDENT).value });
      }
      tryEat(TK.COMMA);
    }
    eat(TK.RBRACK);
    return elems;
  }

  function parseFunctionDecl(decorators = []) {
    let generator = false;
    eat(TK.IDENT, 'function');
    if (tryEat(TK.STAR)) generator = true;
    const name = cur().type === TK.IDENT ? eat(TK.IDENT).value : null;
    // Type parameters: function foo<T>(...)
    let typeParams = [];
    if (cur().type === TK.LT) {
      eat(TK.LT);
      while (cur().type !== TK.GT) {
        const tpName = eat(TK.IDENT).value;
        let constraint = null;
        if (cur().type === TK.IDENT && cur().value === 'implements') {
          eat(TK.IDENT);
          constraint = parseTypeAnnotation();
        }
        typeParams.push({ name: tpName, constraint });
        tryEat(TK.COMMA);
      }
      eat(TK.GT);
    }
    const params = parseParams();
    let returnType = null;
    if (tryEat(TK.COLON)) returnType = parseTypeAnnotation();
    // throws annotation
    let throwsTypes = [];
    if (cur().type === TK.IDENT && cur().value === 'throws') {
      eat(TK.IDENT);
      if (cur().type !== TK.LBRACE && cur().type !== TK.SEMI) {
        throwsTypes.push(parseTypeAnnotation());
        while (cur().type === TK.PIPE) { eat(TK.PIPE); throwsTypes.push(parseTypeAnnotation()); }
      }
    }
    // Overload signature (no body)
    if (cur().type === TK.SEMI) { eat(TK.SEMI); return { kind: 'FuncOverload', name, params, returnType }; }
    const body = parseBlock();
    return { kind: 'FuncDecl', name, params, returnType, throwsTypes, body, generator, decorators, typeParams };
  }

  function parseExtensionFunc() {
    eat(TK.IDENT, 'extension');
    eat(TK.IDENT, 'function');
    const name = eat(TK.IDENT).value;
    // params: first param must be (this: Type)
    eat(TK.LPAREN);
    eat(TK.IDENT, 'this');
    eat(TK.COLON);
    const thisType = parseTypeAnnotation();
    let params = [];
    if (tryEat(TK.COMMA)) {
      while (cur().type !== TK.RPAREN) {
        const pname = eat(TK.IDENT).value;
        let typeAnn = null;
        if (tryEat(TK.COLON)) typeAnn = parseTypeAnnotation();
        params.push({ name: pname, typeAnn });
        tryEat(TK.COMMA);
      }
    }
    eat(TK.RPAREN);
    let returnType = null;
    if (tryEat(TK.COLON)) returnType = parseTypeAnnotation();
    const body = parseBlock();
    return { kind: 'ExtensionFunc', name, thisType, params, returnType, body };
  }

  function parseAsyncDecl(decorators = []) {
    eat(TK.IDENT, 'async');
    let generator = false;
    eat(TK.IDENT, 'function');
    if (tryEat(TK.STAR)) generator = true;
    const name = eat(TK.IDENT).value;
    const params = parseParams();
    let returnType = null;
    if (tryEat(TK.COLON)) returnType = parseTypeAnnotation();
    let throwsTypes = [];
    if (cur().type === TK.IDENT && cur().value === 'throws') {
      eat(TK.IDENT);
      if (cur().type !== TK.LBRACE && cur().type !== TK.SEMI) {
        throwsTypes.push(parseTypeAnnotation());
        while (cur().type === TK.PIPE) { eat(TK.PIPE); throwsTypes.push(parseTypeAnnotation()); }
      }
    }
    const body = cur().type === TK.LBRACE ? parseBlock() : null;
    return { kind: 'FuncDecl', name, params, returnType, throwsTypes, body, async: true, generator, decorators };
  }

  function isSideEffectFree(node) {
    if (!node) return true;
    if (node.kind === 'Literal') return true;
    if (node.kind === 'Ident') return true;
    if (node.kind === 'Unary') return isSideEffectFree(node.expr);
    if (node.kind === 'Binary') return isSideEffectFree(node.left) && isSideEffectFree(node.right);
    if (node.kind === 'Member') return isSideEffectFree(node.object);
    return false; // Call, New, Assign, etc.
  }

  function parseParams() {
    eat(TK.LPAREN);
    const params = [];
    let hadRest = false;
    while (cur().type !== TK.RPAREN) {
      if (hadRest) {
        if (cur().type === TK.SPREAD) err('only one rest parameter is allowed');
        err('rest parameter must be the last parameter');
      }
      // Decorator on parameter → error
      if (cur().type === TK.AT) {
        eat(TK.AT);
        const decName = eat(TK.IDENT).value;
        err(`"@${decName}" cannot be applied to parameters`);
      }

      let rest = false;
      if (cur().type === TK.SPREAD) { eat(TK.SPREAD); rest = true; hadRest = true; }

      // Array destructuring param: [a, b, , c]
      if (cur().type === TK.LBRACK) {
        eat(TK.LBRACK);
        const pattern = [];
        while (cur().type !== TK.RBRACK) {
          if (cur().type === TK.COMMA) {
            pattern.push(null); // skip slot
          } else {
            const n = eat(TK.IDENT).value;
            pattern.push({ name: n });
          }
          if (cur().type !== TK.RBRACK) eat(TK.COMMA);
        }
        eat(TK.RBRACK);
        let typeAnn = null;
        if (tryEat(TK.COLON)) typeAnn = parseTypeAnnotation();
        params.push({ name: '_arr', destructArr: pattern, typeAnn, rest: false, optional: false, defaultVal: null });
        if (cur().type !== TK.RPAREN) tryEat(TK.COMMA);
        continue;
      }

      const name = eat(TK.IDENT).value;
      let typeAnn = null;
      let optional = false;
      if (cur().type === TK.QUEST) { eat(TK.QUEST); optional = true; }
      if (tryEat(TK.COLON)) typeAnn = parseTypeAnnotation();
      let defaultVal = null;
      if (tryEat(TK.EQ)) defaultVal = parseExpr();
      params.push({ name, typeAnn, rest, optional, defaultVal });
      if (cur().type !== TK.RPAREN) tryEat(TK.COMMA);
    }
    eat(TK.RPAREN);
    if (params.filter(p => p.rest).length > 1) err('only one rest parameter is allowed');
    // Check: default params must come at end (no required param after a default param)
    let hadDefault = false;
    for (const p of params) {
      if (p.defaultVal !== null) {
        hadDefault = true;
        if (!isSideEffectFree(p.defaultVal)) err('default parameter expression must be side-effect free');
      } else if (hadDefault && !p.rest) err('default parameter must be at end');
    }
    return params;
  }

  function parseClassDecl(decorators = []) {
    eat(TK.IDENT, 'class');
    const name = eat(TK.IDENT).value;
    // Type parameters: class Foo<T>
    let classTypeParams = [];
    if (cur().type === TK.LT) {
      eat(TK.LT);
      while (cur().type !== TK.GT) {
        classTypeParams.push({ name: eat(TK.IDENT).value });
        tryEat(TK.COMMA);
      }
      eat(TK.GT);
    }
    let superClass = null;
    if (cur().type === TK.IDENT && cur().value === 'extends') {
      eat(TK.IDENT); superClass = eat(TK.IDENT).value;
    }
    let implements_ = [];
    if (cur().type === TK.IDENT && cur().value === 'implements') {
      eat(TK.IDENT);
      const _parseImpl = () => {
        const nm = eat(TK.IDENT).value;
        if (cur().type === TK.LT) {
          eat(TK.LT);
          const tArgs = [];
          while (cur().type !== TK.GT) { tArgs.push(parseTypeAnnotation()); tryEat(TK.COMMA); }
          eat(TK.GT);
          return { name: nm, typeArgs: tArgs };
        }
        return nm;
      };
      implements_.push(_parseImpl());
      while (tryEat(TK.COMMA)) implements_.push(_parseImpl());
    }
    eat(TK.LBRACE);
    const members = [];
    while (cur().type !== TK.RBRACE) {
      const memberDecorators = parseDecorators();
      const modifiers = [];
      while (cur().type === TK.IDENT && ['public','private','protected','static','readonly','abstract','async','override','mut'].includes(cur().value)) {
        modifiers.push(eat(TK.IDENT).value);
      }
      let generator = false;
      if (cur().type === TK.STAR) { eat(TK.STAR); generator = true; }

      const memberName = cur().type === TK.LBRACK
        ? (() => { eat(TK.LBRACK); const e = parseExpr(); eat(TK.RBRACK); return { computed: true, expr: e }; })()
        : eat(TK.IDENT).value;

      if (cur().type === TK.LPAREN || cur().type === TK.LT) {
        // Method
        let typeParams = [];
        if (cur().type === TK.LT) {
          eat(TK.LT);
          while (cur().type !== TK.GT) { typeParams.push(eat(TK.IDENT).value); tryEat(TK.COMMA); }
          eat(TK.GT);
        }
        const params = parseParams();
        let returnType = null;
        if (tryEat(TK.COLON)) returnType = parseTypeAnnotation();
        let throwsTypes = [];
        if (cur().type === TK.IDENT && cur().value === 'throws') {
          eat(TK.IDENT);
          if (cur().type !== TK.LBRACE && cur().type !== TK.SEMI) {
            throwsTypes.push(parseTypeAnnotation());
            while (cur().type === TK.PIPE) { eat(TK.PIPE); throwsTypes.push(parseTypeAnnotation()); }
          }
        }
        let body = null;
        if (cur().type === TK.LBRACE) body = parseBlock();
        else eatSemi();
        members.push({ kind: 'Method', name: memberName, modifiers, params, returnType, throwsTypes, body, generator, decorators: memberDecorators });
      } else {
        // Field
        let typeAnn = null, optional = false;
        if (cur().type === TK.QUEST) { eat(TK.QUEST); optional = true; }
        if (tryEat(TK.COLON)) typeAnn = parseTypeAnnotation();
        let init = null;
        if (tryEat(TK.EQ)) init = parseExpr();
        eatSemi();
        members.push({ kind: 'Field', name: memberName, modifiers, typeAnn, optional, init, decorators: memberDecorators });
      }
    }
    eat(TK.RBRACE);
    return { kind: 'ClassDecl', name, superClass, implements_, members, decorators, typeParams: classTypeParams };
  }

  function parseInterface() {
    eat(TK.IDENT, 'interface');
    const name = eat(TK.IDENT).value;
    let typeParams = [];
    if (cur().type === TK.LT) {
      eat(TK.LT);
      while (cur().type !== TK.GT) { typeParams.push(eat(TK.IDENT).value); tryEat(TK.COMMA); }
      eat(TK.GT);
    }
    let extends_ = [];
    if (cur().type === TK.IDENT && cur().value === 'extends') {
      eat(TK.IDENT); extends_.push(eat(TK.IDENT).value);
      while (tryEat(TK.COMMA)) extends_.push(eat(TK.IDENT).value);
    }
    eat(TK.LBRACE);
    const members = [];
    while (cur().type !== TK.RBRACE) {
      const mname = eat(TK.IDENT).value;
      let optional = false;
      if (cur().type === TK.QUEST) { eat(TK.QUEST); optional = true; }
      if (cur().type === TK.LPAREN) {
        const params = parseParams();
        eat(TK.COLON);
        const retType = parseTypeAnnotation();
        eatSemi();
        members.push({ kind: 'MethodSig', name: mname, params, returnType: retType, optional });
      } else {
        eat(TK.COLON);
        const typeAnn = parseTypeAnnotation();
        eatSemi();
        members.push({ kind: 'PropSig', name: mname, typeAnn, optional });
      }
    }
    eat(TK.RBRACE);
    return { kind: 'Interface', name, typeParams, extends_, members };
  }

  function parseEnum() {
    eat(TK.IDENT, 'enum');
    const name = eat(TK.IDENT).value;
    eat(TK.LBRACE);
    const members = [];
    while (cur().type !== TK.RBRACE) {
      const mname = eat(TK.IDENT).value;
      let value = null;
      if (tryEat(TK.EQ)) value = parseExpr();
      members.push({ name: mname, value });
      tryEat(TK.COMMA);
    }
    eat(TK.RBRACE);
    return { kind: 'Enum', name, members };
  }

  function parseTypeAlias() {
    eat(TK.IDENT, 'type');
    const name = eat(TK.IDENT).value;
    let typeParams = [];
    if (cur().type === TK.LT) {
      eat(TK.LT);
      while (cur().type !== TK.GT) { typeParams.push(eat(TK.IDENT).value); tryEat(TK.COMMA); }
      eat(TK.GT);
    }
    eat(TK.EQ);
    const typeAnn = parseTypeAnnotation();
    eatSemi();
    return { kind: 'TypeAlias', name, typeParams, typeAnn };
  }

  function parseReturn() {
    eat(TK.IDENT, 'return');
    let value = null;
    if (cur().type !== TK.SEMI && cur().type !== TK.RBRACE && !done()) value = parseExpr();
    eatSemi();
    return { kind: 'Return', value };
  }

  function parseIf() {
    eat(TK.IDENT, 'if');
    eat(TK.LPAREN);
    const test = parseExpr();
    eat(TK.RPAREN);
    const consequent = parseStmtOrBlock();
    let alternate = null;
    if (cur().type === TK.IDENT && cur().value === 'else') {
      eat(TK.IDENT);
      alternate = parseStmtOrBlock();
    }
    return { kind: 'If', test, consequent, alternate };
  }

  function parseStmtOrBlock() {
    if (cur().type === TK.LBRACE) return parseBlock();
    return parseStmt();
  }

  function parseFor() {
    eat(TK.IDENT, 'for');
    const isAwait = cur().type === TK.IDENT && cur().value === 'await';
    if (isAwait) eat(TK.IDENT);
    eat(TK.LPAREN);

    // Detect for-of / for-in vs classic for
    const saved = pos;
    let forKind = 'classic';
    try {
      // Heuristic: scan for 'of' or 'in' before ')'
      let depth = 0, p = pos;
      while (p < tokens.length) {
        const tk = tokens[p];
        if (tk.type === TK.LPAREN) depth++;
        if (tk.type === TK.RPAREN && depth === 0) break;
        if (tk.type === TK.IDENT && (tk.value === 'of' || tk.value === 'in') && depth === 0) {
          forKind = tk.value === 'of' ? 'of' : 'in';
          break;
        }
        p++;
      }
    } catch {}

    if (forKind === 'of' || forKind === 'in') {
      // for (const x of expr) / for (let x of expr) / for (const [a,b] of expr)
      const varKind = cur().type === TK.IDENT && ['let','const','var'].includes(cur().value) ? eat(TK.IDENT).value : 'const';
      let binding;
      if (cur().type === TK.LBRACK) {
        binding = { kind: 'ArrayPattern', elems: parseArrayPattern() };
      } else if (cur().type === TK.LBRACE) {
        binding = { kind: 'ObjPattern', props: parseObjectPattern() };
      } else {
        const name = eat(TK.IDENT).value;
        let typeAnn = null;
        if (tryEat(TK.COLON)) typeAnn = parseTypeAnnotation();
        binding = { kind: 'Ident', name, typeAnn };
      }
      eat(TK.IDENT, forKind);
      const iterable = parseExpr();
      eat(TK.RPAREN);
      const body = parseStmtOrBlock();
      return { kind: forKind === 'of' ? 'ForOf' : 'ForIn', varKind, binding, iterable, body, await: isAwait };
    }

    // Classic for
    let init = null;
    if (cur().type !== TK.SEMI) {
      if (cur().type === TK.IDENT && ['let','const','var'].includes(cur().value)) {
        init = parseVarDecl(cur().value); // parseVarDecl eats the keyword itself
      } else {
        init = { kind: 'ExprStmt', expr: parseExpr() };
        eatSemi();
      }
    } else eatSemi();

    let test = null;
    if (cur().type !== TK.SEMI) test = parseExpr();
    eatSemi();

    let update = null;
    if (cur().type !== TK.RPAREN) update = parseExpr();
    eat(TK.RPAREN);

    const body = parseStmtOrBlock();
    return { kind: 'For', init, test, update, body };
  }

  function parseWhile() {
    eat(TK.IDENT, 'while');
    eat(TK.LPAREN);
    const test = parseExpr();
    eat(TK.RPAREN);
    const body = parseStmtOrBlock();
    return { kind: 'While', test, body };
  }

  function parseDoWhile() {
    eat(TK.IDENT, 'do');
    const body = parseStmtOrBlock();
    eat(TK.IDENT, 'while');
    eat(TK.LPAREN);
    const test = parseExpr();
    eat(TK.RPAREN);
    eatSemi();
    return { kind: 'DoWhile', test, body };
  }

  function parseThrow() {
    eat(TK.IDENT, 'throw');
    const value = parseExpr();
    eatSemi();
    return { kind: 'Throw', value };
  }

  function parseTryCatch() {
    eat(TK.IDENT, 'try');
    const body = parseBlock();
    const catches = [];
    while (cur().type === TK.IDENT && cur().value === 'catch') {
      eat(TK.IDENT);
      let param = null, typeAnn = null;
      if (tryEat(TK.LPAREN)) {
        param = eat(TK.IDENT).value;
        if (tryEat(TK.COLON)) typeAnn = parseTypeAnnotation();
        eat(TK.RPAREN);
      }
      catches.push({ param, typeAnn, body: parseBlock() });
    }
    let finally_ = null;
    if (cur().type === TK.IDENT && cur().value === 'finally') {
      eat(TK.IDENT); finally_ = parseBlock();
    }
    return { kind: 'TryCatch', body, catches, finally: finally_ };
  }

  function parseSwitch() {
    const swTok = eat(TK.IDENT, 'switch');
    eat(TK.LPAREN);
    const discriminant = parseExpr();
    eat(TK.RPAREN);
    eat(TK.LBRACE);
    const cases = [];
    while (cur().type !== TK.RBRACE) {
      if (cur().type === TK.IDENT && cur().value === 'case') {
        const caseTok = eat(TK.IDENT);
        const test = parseExpr();
        eat(TK.COLON);
        const stmts = [];
        while (!(cur().type === TK.IDENT && (cur().value === 'case' || cur().value === 'default')) && cur().type !== TK.RBRACE) {
          stmts.push(parseStmt());
        }
        cases.push({ test, body: stmts, line: caseTok.line });
      } else if (cur().type === TK.IDENT && cur().value === 'default') {
        const defTok = eat(TK.IDENT); eat(TK.COLON);
        const stmts = [];
        while (!(cur().type === TK.IDENT && cur().value === 'case') && cur().type !== TK.RBRACE) {
          stmts.push(parseStmt());
        }
        cases.push({ test: null, body: stmts, line: defTok.line });
      } else break;
    }
    eat(TK.RBRACE);
    return { kind: 'Switch', discriminant, cases, line: swTok.line, col: swTok.col };
  }

  function parseNative() {
    eat(TK.IDENT, 'native');
    // native(`...`) call-style with template literal
    if (cur().type === TK.LPAREN) {
      eat(TK.LPAREN);
      let node;
      if (cur().type === TK.TEMPLATE) {
        const tmpl = cur();
        pos++;
        node = { kind: 'Native', content: null, templateParts: tmpl.parts };
      } else {
        const content = eat(TK.STRING).value;
        node = { kind: 'Native', content };
      }
      eat(TK.RPAREN);
      eatSemi();
      return node;
    }
    // native `...` bare template literal
    if (cur().type === TK.TEMPLATE) {
      const tmpl = cur();
      pos++;
      eatSemi();
      return { kind: 'Native', content: null, templateParts: tmpl.parts };
    }
    // native "..." verbatim string
    const content = eat(TK.STRING).value;
    eatSemi();
    return { kind: 'Native', content };
  }

  function parseUnsafe() {
    eat(TK.IDENT, 'unsafe');
    const body = parseBlock();
    return { kind: 'Unsafe', body };
  }

  function parseSpawn() {
    eat(TK.IDENT, 'spawn');
    let throwsTypes = [];
    if (cur().type === TK.IDENT && cur().value === 'throws') {
      eat(TK.IDENT);
      throwsTypes.push(parseTypeAnnotation());
    }
    const body = parseBlock();
    eatSemi();
    return { kind: 'Spawn', throwsTypes, body };
  }

  function parseBlock() {
    eat(TK.LBRACE);
    const stmts = [];
    while (cur().type !== TK.RBRACE && !done()) stmts.push(parseStmt());
    eat(TK.RBRACE);
    return { kind: 'Block', body: stmts };
  }

  // -------------------------------------------------------------------------
  // Expressions (Pratt parser)
  // -------------------------------------------------------------------------
  function parseExpr() { return parseAssign(); }

  function parseAssign() {
    const left = parseTernary();
    const op = cur().value;
    const assignOps = [
      TK.EQ, TK.PLUSEQ, TK.MINUSEQ, TK.STAREQ, TK.SLASHEQ,
      TK.AMPEQ, TK.PIPEEQ, TK.PERCENTEQ, TK.CARETEQ,
      TK.LSHIFTEQ, TK.RSHIFTEQ, TK.RSHIFTUEQ,
      TK.AMP2EQ, TK.PIPE2EQ, TK.QUEST2EQ,
    ];
    if (assignOps.includes(cur().type) || (cur().type === TK.IDENT && cur().value === 'as')) {
      if (cur().type === TK.IDENT && cur().value === 'as') {
        eat(TK.IDENT);
        const castType = parseTypeAnnotation();
        return { kind: 'Cast', expr: left, castType };
      }
      const opTok = cur();
      pos++;
      const right = parseAssign();
      return { kind: 'Assign', op, left, right, line: opTok.line, col: opTok.col };
    }
    return left;
  }

  function parseTernary() {
    const cond = parseOr();
    if (cur().type === TK.QUEST) {
      eat(TK.QUEST);
      const yes = parseExpr();
      eat(TK.COLON);
      const no = parseExpr();
      return { kind: 'Ternary', cond, yes, no };
    }
    return cond;
  }

  const binaryLevels = [
    [[TK.QUEST2],       'left'],  // ??
    [[TK.PIPE2],        'left'],  // ||
    [[TK.AMP2],         'left'],  // &&
    [[TK.PIPE],         'left'],  // |
    [[TK.CARET],        'left'],  // ^
    [[TK.AMP],          'left'],  // &
    [[TK.EQEQ, TK.BANGEQ, TK.EQEQEQ, TK.BANGEQEQ], 'left'],
    [[TK.LT, TK.GT, TK.LTE, TK.GTE], 'left'],
    [[TK.LSHIFT, TK.RSHIFT, TK.RSHIFTU], 'left'],
    [[TK.PLUS, TK.MINUS], 'left'],
    [[TK.STAR, TK.SLASH, TK.PERCENT], 'left'],
  ];

  function parseBinary(level) {
    if (level >= binaryLevels.length) return parsePow();
    const [ops] = binaryLevels[level];
    let left = parseBinary(level + 1);
    while (ops.includes(cur().type) ||
           (cur().type === TK.IDENT && (cur().value === 'instanceof' || cur().value === 'in') && level === 6)) {
      const op = cur().value;
      // Disallow mixing || and ?? without parentheses
      if (op === '??' && left.kind === 'Binary' && (left.op === '||' || left.op === '&&')) {
        err(`"||" and "??" require parentheses when mixed`);
      }
      if ((op === '||' || op === '&&') && left.kind === 'Binary' && left.op === '??') {
        err(`"||" and "??" require parentheses when mixed`);
      }
      pos++;
      const right = parseBinary(level + 1);
      left = { kind: 'Binary', op, left, right };
    }
    return left;
  }

  // ** is right-associative, higher precedence than unary... actually lower than unary in JS
  // x ** y === x ** y, -x ** y is a SyntaxError in JS but we allow it as -(x**y)
  function parsePow() {
    const base = parseUnary();
    if (cur().type === TK.STARSTAR) {
      pos++;
      const exp = parsePow(); // right-associative
      return { kind: 'Binary', op: '**', left: base, right: exp };
    }
    return base;
  }

  function parseOr() { return parseBinary(0); }

  function parseUnary() {
    if (cur().type === TK.BANG)  { pos++; return { kind: 'Unary', op: '!',     expr: parseUnary() }; }
    if (cur().type === TK.MINUS) { pos++; return { kind: 'Unary', op: '-',     expr: parseUnary() }; }
    if (cur().type === TK.TILDE) { pos++; return { kind: 'Unary', op: '~',     expr: parseUnary() }; }
    if (cur().type === TK.PLUS2) { pos++; return { kind: 'Unary', op: '++pre', expr: parseUnary() }; }
    if (cur().type === TK.MINUS2){ pos++; return { kind: 'Unary', op: '--pre', expr: parseUnary() }; }
    if (cur().type === TK.AMP)   { pos++; return { kind: 'Unary', op: '&',     expr: parseUnary() }; }
    if (cur().type === TK.STAR)  { pos++; return { kind: 'Unary', op: '*',     expr: parseUnary() }; }
    if (cur().type === TK.IDENT && cur().value === 'typeof')  { pos++; return { kind: 'Typeof',  expr: parseUnary() }; }
    if (cur().type === TK.IDENT && cur().value === 'await')   { pos++; return { kind: 'Await',   expr: parseUnary() }; }
    if (cur().type === TK.IDENT && cur().value === 'yield') {
      pos++;
      const delegate = tryEat(TK.STAR) !== null;
      const value = (cur().type !== TK.SEMI && cur().type !== TK.RBRACE && !done()) ? parseExpr() : null;
      return { kind: 'Yield', delegate, value };
    }
    if (cur().type === TK.IDENT && cur().value === 'drop') { pos++; return { kind: 'Drop', expr: parseUnary() }; }
    if (cur().type === TK.IDENT && cur().value === 'new')  return parseNew();
    // @embedded.stack_push/pop/empty("name", ...) as expressions
    if (cur().type === TK.AT) {
      eat(TK.AT);
      let macroName = eat(TK.IDENT).value;
      while (cur().type === TK.DOT) { eat(TK.DOT); macroName += '.' + eat(TK.IDENT).value; }
      let typeArgs = [];
      if (cur().type === TK.LT) {
        eat(TK.LT);
        while (cur().type !== TK.GT) { typeArgs.push(parseTypeAnnotation()); tryEat(TK.COMMA); }
        eat(TK.GT);
      }
      let args = [];
      if (cur().type === TK.LPAREN) {
        eat(TK.LPAREN);
        while (cur().type !== TK.RPAREN) { args.push(parseExpr()); tryEat(TK.COMMA); }
        eat(TK.RPAREN);
      }
      return { kind: 'EmbeddedMacro', name: macroName, typeArgs, args };
    }
    return parsePostfix();
  }

  function parseNew() {
    const newTok = eat(TK.IDENT, 'new');
    let name = eat(TK.IDENT).value;
    let typeArgs = [];
    if (cur().type === TK.LT) {
      eat(TK.LT);
      while (cur().type !== TK.GT) { typeArgs.push(parseTypeAnnotation()); tryEat(TK.COMMA); }
      eat(TK.GT);
    }
    let args = [];
    let arraySize = null;
    if (cur().type === TK.LBRACK) {
      eat(TK.LBRACK);
      arraySize = parseExpr();
      eat(TK.RBRACK);
    } else if (cur().type === TK.LPAREN) {
      eat(TK.LPAREN);
      while (cur().type !== TK.RPAREN) {
        if (cur().type === TK.SPREAD) { eat(TK.SPREAD); args.push({ spread: true, expr: parseExpr() }); }
        else args.push({ spread: false, expr: parseExpr() });
        tryEat(TK.COMMA);
      }
      eat(TK.RPAREN);
    }
    return { kind: 'New', name, typeArgs, args, arraySize, line: newTok.line, col: newTok.col };
  }

  function parsePostfix() {
    let expr = parsePrimary();
    while (true) {
      if (cur().type === TK.DOT) {
        eat(TK.DOT);
        const propTok = eat(TK.IDENT);
        expr = { kind: 'Member', object: expr, prop: propTok.value, line: propTok.line, col: propTok.col, endCol: propTok.endCol };
      } else if (cur().type === TK.QUESTDOT) {
        eat(TK.QUESTDOT);
        const prop = eat(TK.IDENT).value;
        expr = { kind: 'OptChain', object: expr, prop };
      } else if (cur().type === TK.LBRACK) {
        eat(TK.LBRACK);
        // Range slice: [..], [start..], [..end], [start..end]
        if (cur().type === TK.DOTDOT) {
          eat(TK.DOTDOT);
          const end = cur().type !== TK.RBRACK ? parseExpr() : null;
          eat(TK.RBRACK);
          expr = { kind: 'RangeIndex', object: expr, start: null, end };
        } else {
          const startExpr = parseExpr();
          if (cur().type === TK.DOTDOT) {
            eat(TK.DOTDOT);
            const end = cur().type !== TK.RBRACK ? parseExpr() : null;
            eat(TK.RBRACK);
            expr = { kind: 'RangeIndex', object: expr, start: startExpr, end };
          } else {
            eat(TK.RBRACK);
            expr = { kind: 'Index', object: expr, index: startExpr };
          }
        }
      } else if (cur().type === TK.LPAREN) {
        const callTok = cur();
        const args = parseCallArgs();
        expr = { kind: 'Call', callee: expr, args, line: callTok.line, col: callTok.col };
      } else if (cur().type === TK.LT && isGenericCall()) {
        // generic call: fn<T>(args)
        const callTok2 = cur();
        eat(TK.LT);
        const typeArgs = [];
        while (cur().type !== TK.GT) { typeArgs.push(parseTypeAnnotation()); tryEat(TK.COMMA); }
        eat(TK.GT);
        const args = parseCallArgs();
        expr = { kind: 'Call', callee: expr, typeArgs, args, line: callTok2.line, col: callTok2.col };
      } else if (cur().type === TK.BANG && peek().type !== TK.EQ) {
        // x! — non-null assertion / error propagation
        eat(TK.BANG);
        expr = { kind: 'NonNull', expr };
      } else if (cur().type === TK.QUEST && peek().type === TK.SEMI) {
        // x? — error propagation
        eat(TK.QUEST);
        expr = { kind: 'Propagate', expr };
      } else if (cur().type === TK.PLUS2) {
        eat(TK.PLUS2); expr = { kind: 'Unary', op: '++post', expr };
      } else if (cur().type === TK.MINUS2) {
        eat(TK.MINUS2); expr = { kind: 'Unary', op: '--post', expr };
      } else break;
    }
    return expr;
  }

  function isGenericCall() {
    // Heuristic: <IDENT> followed by ( is likely a generic call
    const saved = pos;
    try {
      pos++; // eat <
      let depth = 1;
      let braceDepth = 0;
      while (pos < tokens.length && depth > 0) {
        if (tokens[pos].type === TK.LBRACE) braceDepth++;
        else if (tokens[pos].type === TK.RBRACE) braceDepth--;
        else if (tokens[pos].type === TK.LT) depth++;
        else if (tokens[pos].type === TK.GT) depth--;
        else if ((tokens[pos].type === TK.SEMI || tokens[pos].type === TK.EOF) && braceDepth === 0) { pos = saved; return false; }
        pos++;
      }
      const ok = tokens[pos] && tokens[pos].type === TK.LPAREN;
      pos = saved;
      return ok;
    } catch { pos = saved; return false; }
  }

  function parseCallArgs() {
    eat(TK.LPAREN);
    const args = [];
    while (cur().type !== TK.RPAREN) {
      if (cur().type === TK.SPREAD) { eat(TK.SPREAD); args.push({ spread: true, expr: parseExpr() }); }
      else args.push({ spread: false, expr: parseExpr() });
      if (cur().type !== TK.RPAREN) tryEat(TK.COMMA);
    }
    eat(TK.RPAREN);
    return args;
  }

  function parseMatchPattern() {
    // Parse a single (possibly OR-combined) match pattern
    const parseSinglePattern = () => {
      const t = cur();
      // Wildcard
      if (t.type === TK.IDENT && t.value === '_') { pos++; return { kind: 'MatchWild' }; }
      // Null
      if (t.type === TK.NULL) { pos++; return { kind: 'MatchNull' }; }
      // Array/tuple destructuring [p1, p2, ...]
      if (t.type === TK.LBRACK) {
        eat(TK.LBRACK);
        const elements = [];
        while (cur().type !== TK.RBRACK) {
          elements.push(parseSinglePattern());
          tryEat(TK.COMMA);
        }
        eat(TK.RBRACK);
        return { kind: 'MatchTuple', elements };
      }
      // Negative number literal
      if (t.type === TK.MINUS && peek().type === TK.NUMBER) {
        eat(TK.MINUS);
        const numTok = eat(TK.NUMBER);
        const lo = '-' + numTok.value;
        if (cur().type === TK.DOTDOT) {
          eat(TK.DOTDOT);
          const hiNeg = cur().type === TK.MINUS ? (eat(TK.MINUS), true) : false;
          const hi = (hiNeg ? '-' : '') + eat(TK.NUMBER).value;
          return { kind: 'MatchRange', lo, hi };
        }
        return { kind: 'MatchLit', value: lo, litType: 'number' };
      }
      // Number literal (possibly range)
      if (t.type === TK.NUMBER) {
        const lo = eat(TK.NUMBER).value;
        if (cur().type === TK.DOTDOT) {
          eat(TK.DOTDOT);
          const hiNeg = cur().type === TK.MINUS ? (eat(TK.MINUS), true) : false;
          const hi = (hiNeg ? '-' : '') + eat(TK.NUMBER).value;
          return { kind: 'MatchRange', lo, hi };
        }
        return { kind: 'MatchLit', value: lo, litType: 'number' };
      }
      // String literal
      if (t.type === TK.STRING) {
        pos++;
        return { kind: 'MatchLit', value: t.value, litType: 'string' };
      }
      // Identifier: wildcard _, enum case Foo.Bar, or bare enum value
      if (t.type === TK.IDENT) {
        const name = eat(TK.IDENT).value;
        if (cur().type === TK.DOT) {
          eat(TK.DOT);
          const member = eat(TK.IDENT).value;
          return { kind: 'MatchEnum', enumName: name, caseName: member, path: `${name}.${member}` };
        }
        return { kind: 'MatchIdent', name };
      }
      err(`Unexpected token in match pattern: ${t.type} "${t.value}"`);
    };

    // Collect OR-joined patterns
    const first = parseSinglePattern();
    if (cur().type !== TK.PIPE) return first;
    const patterns = [first];
    while (cur().type === TK.PIPE) {
      eat(TK.PIPE);
      patterns.push(parseSinglePattern());
    }
    return { kind: 'MatchOr', patterns };
  }

  function parseMatch() {
    eat(TK.IDENT); // eat 'match'
    let discriminant;
    let hasParens = false;
    if (cur().type === TK.LPAREN) {
      hasParens = true;
      eat(TK.LPAREN);
      discriminant = parseExpr();
      eat(TK.RPAREN);
    } else {
      discriminant = parsePrimary();
    }
    eat(TK.LBRACE);
    const cases = [];
    while (cur().type !== TK.RBRACE) {
      const pattern = parseMatchPattern();
      eat(TK.ARROW);
      const body = parseExpr();
      tryEat(TK.COMMA);
      cases.push({ pattern, body });
    }
    eat(TK.RBRACE);
    return { kind: 'Match', discriminant, cases, hasParens };
  }

  function parsePrimary() {
    const t = cur();

    // Match expression
    if (t.type === TK.IDENT && t.value === 'match') return parseMatch();

    // Literals
    if (t.type === TK.NUMBER) { pos++; return { kind: 'Literal', litType: 'number', value: t.value, line: t.line, col: t.col, endCol: t.endCol }; }
    if (t.type === TK.STRING) { pos++; return { kind: 'Literal', litType: 'string', value: t.value, line: t.line, col: t.col, endCol: t.endCol }; }
    if (t.type === TK.CHAR)   { pos++; return { kind: 'Literal', litType: 'char',   value: t.value, line: t.line, col: t.col, endCol: t.endCol }; }
    if (t.type === TK.BOOL)   { pos++; return { kind: 'Literal', litType: 'bool',   value: t.value, line: t.line, col: t.col, endCol: t.endCol }; }
    if (t.type === TK.NULL)   { pos++; return { kind: 'Literal', litType: 'null',   value: 'null',  line: t.line, col: t.col, endCol: t.endCol }; }
    if (t.type === TK.TEMPLATE) {
      pos++;
      return { kind: 'TemplateLit', parts: t.parts };
    }

    // Grouped / arrow function
    if (t.type === TK.LPAREN) return parseParenOrArrow();

    // Array literal
    if (t.type === TK.LBRACK) {
      eat(TK.LBRACK);
      const elems = [];
      while (cur().type !== TK.RBRACK) {
        if (cur().type === TK.SPREAD) { eat(TK.SPREAD); elems.push({ spread: true, expr: parseExpr() }); }
        else elems.push({ spread: false, expr: parseExpr() });
        tryEat(TK.COMMA);
      }
      eat(TK.RBRACK);
      return { kind: 'ArrayLit', elems };
    }

    // Object literal
    if (t.type === TK.LBRACE) {
      eat(TK.LBRACE);
      const props = [];
      while (cur().type !== TK.RBRACE) {
        if (cur().type === TK.SPREAD) {
          eat(TK.SPREAD);
          props.push({ spread: true, expr: parseExpr() });
        } else if (cur().type === TK.LBRACK) {
          eat(TK.LBRACK);
          const key = parseExpr();
          eat(TK.RBRACK);
          eat(TK.COLON);
          props.push({ computed: true, key, value: parseExpr() });
        } else {
          // Allow string literal keys: { "key": val }
          const isStringKey = cur().type === TK.STRING;
          const keyTok = isStringKey ? eat(TK.STRING) : eat(TK.IDENT);
          const key = keyTok.value;
          if (tryEat(TK.COLON)) props.push({ key, value: parseExpr(), isStringKey });
          else props.push({ key, value: { kind: 'Ident', name: key } }); // shorthand
        }
        tryEat(TK.COMMA);
      }
      eat(TK.RBRACE);
      return { kind: 'ObjLit', props };
    }

    // spawn { ... } / spawn throws T { ... } used as expression
    if (t.type === TK.IDENT && t.value === 'spawn') {
      eat(TK.IDENT, 'spawn');
      let throwsTypes2 = [];
      if (cur().type === TK.IDENT && cur().value === 'throws') {
        eat(TK.IDENT);
        throwsTypes2.push(parseTypeAnnotation());
      }
      const spawnBody = parseBlock();
      return { kind: 'Spawn', throwsTypes: throwsTypes2, body: spawnBody };
    }

    // Function expression: function(...)  or  function name(...)
    if (t.type === TK.IDENT && t.value === 'function') {
      pos++;
      const exprFnName = (cur().type === TK.IDENT) ? eat(TK.IDENT).value : null;
      const exprParams = parseParams();
      let exprRetType = null;
      if (tryEat(TK.COLON)) exprRetType = parseTypeAnnotation();
      const exprBody = parseBlock();
      return { kind: 'FuncExpr', name: exprFnName, params: exprParams, returnType: exprRetType, body: exprBody };
    }

    // Identifier
    if (t.type === TK.IDENT) {
      pos++;
      // Arrow function: x => ...
      if (cur().type === TK.ARROW) {
        eat(TK.ARROW);
        const body = cur().type === TK.LBRACE ? parseBlock() : parseExpr();
        return { kind: 'Arrow', params: [{ name: t.value, typeAnn: null, rest: false, optional: false, defaultVal: null }], body };
      }
      return { kind: 'Ident', name: t.value, line: t.line, col: t.col, endCol: t.endCol };
    }

    err(`Unexpected token: ${t.type} "${t.value}"`);
  }

  function parseParenOrArrow() {
    // Could be (expr), (a, b) => ..., or (a: T) => ...
    const savedPos = pos;
    try {
      eat(TK.LPAREN);
      const params = [];
      while (cur().type !== TK.RPAREN) {
        let rest = false;
        if (cur().type === TK.SPREAD) { eat(TK.SPREAD); rest = true; }
        const name = eat(TK.IDENT).value;
        let typeAnn = null, optional = false;
        if (cur().type === TK.QUEST) { eat(TK.QUEST); optional = true; }
        if (tryEat(TK.COLON)) typeAnn = parseTypeAnnotation();
        let defaultVal = null;
        if (tryEat(TK.EQ)) defaultVal = parseExpr();
        params.push({ name, typeAnn, rest, optional, defaultVal });
        if (cur().type !== TK.RPAREN) eat(TK.COMMA);
      }
      eat(TK.RPAREN);
      let retType = null;
      if (tryEat(TK.COLON)) retType = parseTypeAnnotation();
      if (cur().type === TK.ARROW) {
        eat(TK.ARROW);
        const body = cur().type === TK.LBRACE ? parseBlock() : parseExpr();
        return { kind: 'Arrow', params, returnType: retType, body };
      }
      // Not an arrow — restore and parse as grouped expr
      pos = savedPos;
    } catch { pos = savedPos; }

    eat(TK.LPAREN);
    const expr = parseExpr();
    eat(TK.RPAREN);
    return expr;
  }

  return parseProgram();
}
