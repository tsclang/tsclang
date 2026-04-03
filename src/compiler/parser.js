// TSClang Parser
// Produces an AST from a token stream.

import { TK, KEYWORDS } from './lexer.js';

export function parse(tokens, filename = '<input>') {
  let pos = 0;

  function cur()  { return tokens[pos]; }
  function peek(n = 1) { return tokens[pos + n]; }
  function done() { return cur().type === TK.EOF; }

  function err(msg, tok = cur()) {
    throw new Error(`${filename}:${tok.line}:${tok.col}: ${msg}`);
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
    // Optional prefix: Ref<T>, Mut<T>, Shared<T>, Weak<T>, etc.
    let name = '';
    if (cur().type === TK.IDENT) {
      name = eat(TK.IDENT).value;
    } else if (cur().type === TK.IDENT && cur().value === 'void') {
      name = eat(TK.IDENT).value;
    }

    let typeArgs = [];
    if (cur().type === TK.LT) {
      eat(TK.LT);
      typeArgs.push(parseTypeUnion());
      while (tryEat(TK.COMMA)) typeArgs.push(parseTypeUnion());
      eat(TK.GT);
    }

    let t = { kind: 'TypeRef', name, typeArgs };

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
    if (t.type === TK.IDENT && t.value === 'break')  { eat(TK.IDENT); eatSemi(); return { kind: 'Break' }; }
    if (t.type === TK.IDENT && t.value === 'continue'){ eat(TK.IDENT); eatSemi(); return { kind: 'Continue' }; }
    if (t.type === TK.IDENT && t.value === 'throw')  return parseThrow();
    if (t.type === TK.IDENT && t.value === 'try')    return parseTryCatch();
    if (t.type === TK.IDENT && t.value === 'switch') return parseSwitch();
    if (t.type === TK.IDENT && t.value === 'native') return parseNative();
    if (t.type === TK.IDENT && t.value === 'unsafe') return parseUnsafe();
    if (t.type === TK.IDENT && t.value === 'spawn')  return parseSpawn();
    if (t.type === TK.IDENT && t.value === 'declare') { skipDeclaration(); return { kind: 'Noop' }; }
    if (t.type === TK.LBRACE) return parseBlock();

    // Expression statement
    const expr = parseExpr();
    eatSemi();
    return { kind: 'ExprStmt', expr };
  }

  function skipDeclaration() {
    // skip until semicolon or block
    while (!done() && cur().type !== TK.SEMI && cur().type !== TK.RBRACE) pos++;
    tryEat(TK.SEMI);
  }

  function parseImport() {
    eat(TK.IDENT, 'import');
    const names = [];
    if (tryEat(TK.LBRACE)) {
      while (cur().type !== TK.RBRACE) {
        names.push(eat(TK.IDENT).value);
        tryEat(TK.COMMA);
      }
      eat(TK.RBRACE);
    } else if (cur().type !== TK.IDENT || cur().value !== 'from') {
      names.push(eat(TK.IDENT).value);
    }
    eat(TK.IDENT, 'from');
    const source = eat(TK.STRING).value;
    eatSemi();
    return { kind: 'Import', names, source };
  }

  function parseExport() {
    eat(TK.IDENT, 'export');
    if (cur().type === TK.IDENT && cur().value === 'default') {
      eat(TK.IDENT);
      const decl = parseStmt();
      return { kind: 'Export', default: true, decl };
    }
    const decl = parseStmt();
    return { kind: 'Export', default: false, decl };
  }

  function parseVarDecl(kind, decorators = []) {
    eat(TK.IDENT, kind);
    // Destructuring
    if (cur().type === TK.LBRACE) {
      const pattern = parseObjectPattern();
      let typeAnn = null;
      eat(TK.EQ);
      const init = parseExpr();
      eatSemi();
      return { kind: 'VarDestructObj', varKind: kind, pattern, typeAnn, init };
    }
    if (cur().type === TK.LBRACK) {
      const pattern = parseArrayPattern();
      let typeAnn = null;
      eat(TK.EQ);
      const init = parseExpr();
      eatSemi();
      return { kind: 'VarDestructArr', varKind: kind, pattern, typeAnn, init };
    }

    const name = eat(TK.IDENT).value;
    let typeAnn = null;
    if (tryEat(TK.COLON)) typeAnn = parseTypeAnnotation();
    let init = null;
    if (tryEat(TK.EQ)) init = parseExpr();
    eatSemi();
    return { kind: 'VarDecl', varKind: kind, name, typeAnn, init, decorators };
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
    const name = cur().type === TK.IDENT && !KEYWORDS.has(cur().value) ? eat(TK.IDENT).value : null;
    const params = parseParams();
    let returnType = null;
    if (tryEat(TK.COLON)) returnType = parseTypeAnnotation();
    // throws annotation
    let throwsTypes = [];
    if (cur().type === TK.IDENT && cur().value === 'throws') {
      eat(TK.IDENT);
      throwsTypes.push(parseTypeAnnotation());
      while (cur().type === TK.PIPE) { eat(TK.PIPE); throwsTypes.push(parseTypeAnnotation()); }
    }
    // Overload signature (no body)
    if (cur().type === TK.SEMI) { eat(TK.SEMI); return { kind: 'FuncOverload', name, params, returnType }; }
    const body = parseBlock();
    return { kind: 'FuncDecl', name, params, returnType, throwsTypes, body, generator, decorators };
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
      throwsTypes.push(parseTypeAnnotation());
      while (cur().type === TK.PIPE) { eat(TK.PIPE); throwsTypes.push(parseTypeAnnotation()); }
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
      if (hadRest) err('rest parameter must be the last parameter');
      let rest = false;
      if (cur().type === TK.SPREAD) { eat(TK.SPREAD); rest = true; hadRest = true; }
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
    let superClass = null;
    if (cur().type === TK.IDENT && cur().value === 'extends') {
      eat(TK.IDENT); superClass = eat(TK.IDENT).value;
    }
    let implements_ = [];
    if (cur().type === TK.IDENT && cur().value === 'implements') {
      eat(TK.IDENT);
      implements_.push(eat(TK.IDENT).value);
      while (tryEat(TK.COMMA)) implements_.push(eat(TK.IDENT).value);
    }
    eat(TK.LBRACE);
    const members = [];
    while (cur().type !== TK.RBRACE) {
      const memberDecorators = parseDecorators();
      const modifiers = [];
      while (cur().type === TK.IDENT && ['public','private','protected','static','readonly','abstract','async','override'].includes(cur().value)) {
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
          throwsTypes.push(parseTypeAnnotation());
          while (cur().type === TK.PIPE) { eat(TK.PIPE); throwsTypes.push(parseTypeAnnotation()); }
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
    return { kind: 'ClassDecl', name, superClass, implements_, members, decorators };
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
    eat(TK.IDENT, 'switch');
    eat(TK.LPAREN);
    const discriminant = parseExpr();
    eat(TK.RPAREN);
    eat(TK.LBRACE);
    const cases = [];
    while (cur().type !== TK.RBRACE) {
      if (cur().type === TK.IDENT && cur().value === 'case') {
        eat(TK.IDENT);
        const test = parseExpr();
        eat(TK.COLON);
        const stmts = [];
        while (!(cur().type === TK.IDENT && (cur().value === 'case' || cur().value === 'default')) && cur().type !== TK.RBRACE) {
          stmts.push(parseStmt());
        }
        cases.push({ test, body: stmts });
      } else if (cur().type === TK.IDENT && cur().value === 'default') {
        eat(TK.IDENT); eat(TK.COLON);
        const stmts = [];
        while (!(cur().type === TK.IDENT && cur().value === 'case') && cur().type !== TK.RBRACE) {
          stmts.push(parseStmt());
        }
        cases.push({ test: null, body: stmts });
      } else break;
    }
    eat(TK.RBRACE);
    return { kind: 'Switch', discriminant, cases };
  }

  function parseNative() {
    eat(TK.IDENT, 'native');
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
      TK.AMP2EQ, TK.PIPE2EQ,
    ];
    if (assignOps.includes(cur().type) || (cur().type === TK.IDENT && cur().value === 'as')) {
      if (cur().type === TK.IDENT && cur().value === 'as') {
        eat(TK.IDENT);
        const castType = parseTypeAnnotation();
        return { kind: 'Cast', expr: left, castType };
      }
      pos++;
      const right = parseAssign();
      return { kind: 'Assign', op, left, right };
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
    [[TK.LSHIFT, TK.RSHIFT], 'left'],
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
        err(`|| and ?? cannot be mixed without parentheses`);
      }
      if ((op === '||' || op === '&&') && left.kind === 'Binary' && left.op === '??') {
        err(`|| and ?? cannot be mixed without parentheses`);
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
    return parsePostfix();
  }

  function parseNew() {
    eat(TK.IDENT, 'new');
    let name = eat(TK.IDENT).value;
    let typeArgs = [];
    if (cur().type === TK.LT) {
      eat(TK.LT);
      while (cur().type !== TK.GT) { typeArgs.push(parseTypeAnnotation()); tryEat(TK.COMMA); }
      eat(TK.GT);
    }
    let args = [];
    if (cur().type === TK.LPAREN) {
      eat(TK.LPAREN);
      while (cur().type !== TK.RPAREN) {
        if (cur().type === TK.SPREAD) { eat(TK.SPREAD); args.push({ spread: true, expr: parseExpr() }); }
        else args.push({ spread: false, expr: parseExpr() });
        tryEat(TK.COMMA);
      }
      eat(TK.RPAREN);
    }
    return { kind: 'New', name, typeArgs, args };
  }

  function parsePostfix() {
    let expr = parsePrimary();
    while (true) {
      if (cur().type === TK.DOT) {
        eat(TK.DOT);
        const prop = eat(TK.IDENT).value;
        expr = { kind: 'Member', object: expr, prop };
      } else if (cur().type === TK.QUEST && peek().type === TK.DOT) {
        eat(TK.QUEST); eat(TK.DOT);
        const prop = eat(TK.IDENT).value;
        expr = { kind: 'OptChain', object: expr, prop };
      } else if (cur().type === TK.LBRACK) {
        eat(TK.LBRACK);
        const index = parseExpr();
        eat(TK.RBRACK);
        expr = { kind: 'Index', object: expr, index };
      } else if (cur().type === TK.LPAREN) {
        const args = parseCallArgs();
        expr = { kind: 'Call', callee: expr, args };
      } else if (cur().type === TK.LT && isGenericCall()) {
        // generic call: fn<T>(args)
        eat(TK.LT);
        const typeArgs = [];
        while (cur().type !== TK.GT) { typeArgs.push(parseTypeAnnotation()); tryEat(TK.COMMA); }
        eat(TK.GT);
        const args = parseCallArgs();
        expr = { kind: 'Call', callee: expr, typeArgs, args };
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
      while (pos < tokens.length && depth > 0) {
        if (tokens[pos].type === TK.LT) depth++;
        else if (tokens[pos].type === TK.GT) depth--;
        else if (tokens[pos].type === TK.SEMI || tokens[pos].type === TK.EOF) { pos = saved; return false; }
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

  function parsePrimary() {
    const t = cur();

    // Literals
    if (t.type === TK.NUMBER) { pos++; return { kind: 'Literal', litType: 'number', value: t.value }; }
    if (t.type === TK.STRING) { pos++; return { kind: 'Literal', litType: 'string', value: t.value }; }
    if (t.type === TK.BOOL)   { pos++; return { kind: 'Literal', litType: 'bool',   value: t.value }; }
    if (t.type === TK.NULL)   { pos++; return { kind: 'Literal', litType: 'null',   value: 'null' }; }

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
          const key = eat(TK.IDENT).value;
          if (tryEat(TK.COLON)) props.push({ key, value: parseExpr() });
          else props.push({ key, value: { kind: 'Ident', name: key } }); // shorthand
        }
        tryEat(TK.COMMA);
      }
      eat(TK.RBRACE);
      return { kind: 'ObjLit', props };
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
      return { kind: 'Ident', name: t.value };
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
