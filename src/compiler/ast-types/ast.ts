// AST type definitions for TSClang compiler

// ---------------------------------------------------------------------------
// Position info (attached to some nodes for error reporting)
// ---------------------------------------------------------------------------

export interface NodePos {
  line?: number;
  col?: number;
  endCol?: number;
}

// ---------------------------------------------------------------------------
// Base types
// ---------------------------------------------------------------------------

export interface BaseNode extends NodePos {
  kind: string;
}

// ---------------------------------------------------------------------------
// Type annotations (TypeAnn)
// ---------------------------------------------------------------------------

export type TypeAnn =
  | TypeUnion | TypeFunc | TypeArray | TypePointer | TypeLiteral
  | TypeRef | TypeTuple | TypeObject | TypeKeyOf | TypeTypeof | TypeFixedArray;

export interface TypeUnion extends BaseNode {
  kind: 'TypeUnion';
  types: TypeAnn[];
}

export interface TypeFunc extends BaseNode {
  kind: 'TypeFunc';
  params: Param[];
  returnType: TypeAnn;
  throwsTypes?: TypeAnn[];
  isAsync?: boolean;
  isGenerator?: boolean;
}

export interface TypeArray extends BaseNode {
  kind: 'TypeArray';
  elemType: TypeAnn;
}

export interface TypePointer extends BaseNode {
  kind: 'TypePointer';
  pointee: TypeAnn;
  isMutable?: boolean;
}

export interface TypeLiteral extends BaseNode {
  kind: 'TypeLiteral';
  litKind: 'string' | 'number' | 'boolean';
  value: string;
}

export interface TypeRef extends BaseNode {
  kind: 'TypeRef';
  name: string;
  typeArgs: TypeAnn[];
}

export interface TupleElement {
  name?: string;
  type: TypeAnn;
  optional?: boolean;
  rest?: boolean;
}

export interface TypeTuple extends BaseNode {
  kind: 'TypeTuple';
  elements: TupleElement[];
}

export interface ObjectField {
  name: string;
  type: TypeAnn;
  optional?: boolean;
}

export interface TypeObject extends BaseNode {
  kind: 'TypeObject';
  fields: ObjectField[];
}

export interface TypeKeyOf extends BaseNode {
  kind: 'TypeKeyOf';
  target: TypeRef;
}

export interface TypeTypeof extends BaseNode {
  kind: 'TypeTypeof';
  name: string;
}

export interface TypeFixedArray extends BaseNode {
  kind: 'TypeFixedArray';
  element: TypeAnn;
  size: number;
}

// ---------------------------------------------------------------------------
// Function parameter
// ---------------------------------------------------------------------------

export interface Param {
  name: string;
  typeAnn: TypeAnn;
  default?: Expression;
  rest?: boolean;
  spread?: boolean;
  optional?: boolean;
}

// ---------------------------------------------------------------------------
// Decorator
// ---------------------------------------------------------------------------

export interface Decorator {
  name: string;
  args?: Expression[];
}

// ---------------------------------------------------------------------------
// Statements (Stmt)
// ---------------------------------------------------------------------------

export type Stmt =
  | Program | Import | Export | ExportFrom | VarDecl | VarDecls
  | VarDestructObj | VarDestructArr | FuncDecl | FuncOverload | ExtensionFunc
  | ClassDecl | Interface | Enum | TypeAlias | DeclareConst | DeclareFunction
  | DeclareModule | DeclarePlatform | Return | If | For | While | DoWhile
  | Throw | TryCatch | Switch | Native | Unsafe | Spawn | Block | ExprStmt
  | Break | Continue | Labeled | Noop | Match;

export interface Program extends BaseNode {
  kind: 'Program';
  body: Stmt[];
}

export interface Import extends BaseNode {
  kind: 'Import';
  names: ImportName[];
  source: string;
  namespace: boolean;
  typeOnly: boolean;
}

export interface ImportName {
  name: string;
  alias?: string;
}

export interface Export extends BaseNode {
  kind: 'Export';
  default?: boolean;
  decl: Stmt;
}

export interface ExportFrom extends BaseNode {
  kind: 'ExportFrom';
  names: ImportName[];
  source: string;
}

export interface VarDecl extends BaseNode {
  kind: 'VarDecl';
  varKind: 'let' | 'const' | 'var';
  name: string;
  typeAnn?: TypeAnn;
  init?: Expression | null;
  decorators?: Decorator[];
}

export interface VarDecls extends BaseNode {
  kind: 'VarDecls';
  decls: VarDecl[];
}

export interface VarDestructObj extends BaseNode {
  kind: 'VarDestructObj';
  varKind: 'let' | 'const' | 'var';
  pattern: ObjPattern;
  typeAnn?: TypeAnn;
  init: Expression;
}

export interface VarDestructArr extends BaseNode {
  kind: 'VarDestructArr';
  varKind: 'let' | 'const' | 'var';
  pattern: ArrayPattern;
  typeAnn?: TypeAnn;
  init: Expression;
}

export interface FuncDecl extends BaseNode {
  kind: 'FuncDecl';
  name: string;
  params: Param[];
  returnType?: TypeAnn;
  throwsTypes?: TypeAnn[];
  body: Stmt[];
  generator?: boolean;
  isAsync?: boolean;
  decorators?: Decorator[];
  typeParams?: string[];
}

export interface FuncOverload extends BaseNode {
  kind: 'FuncOverload';
  name: string;
  params: Param[];
  returnType?: TypeAnn;
}

export interface ExtensionFunc extends BaseNode {
  kind: 'ExtensionFunc';
  name: string;
  thisType: TypeAnn;
  params: Param[];
  returnType?: TypeAnn;
  body: Stmt[];
}

export interface ClassDecl extends BaseNode {
  kind: 'ClassDecl';
  name: string;
  superClass?: string | null;
  implements_?: TypeRef[];
  members: ClassMember[];
  decorators?: Decorator[];
  typeParams?: string[];
}

export type ClassMember = Method | Field;

export interface Method extends BaseNode {
  kind: 'Method';
  name: string;
  params: Param[];
  returnType?: TypeAnn;
  throwsTypes?: TypeAnn[];
  body: Stmt[];
  isStatic?: boolean;
  isMut?: boolean;
  isAsync?: boolean;
  isGenerator?: boolean;
  isOverride?: boolean;
  isAbstract?: boolean;
  decorators?: Decorator[];
  typeParams?: string[];
}

export interface Field extends BaseNode {
  kind: 'Field';
  name: string;
  typeAnn?: TypeAnn;
  init?: Expression | null;
  isStatic?: boolean;
  isReadonly?: boolean;
  isPrivate?: boolean;
  decorators?: Decorator[];
}

export interface Interface extends BaseNode {
  kind: 'Interface';
  name: string;
  typeParams?: string[];
  extends_?: TypeRef[];
  members: (MethodSig | PropSig)[];
}

export interface MethodSig extends BaseNode {
  kind: 'MethodSig';
  name: string;
  params: Param[];
  returnType?: TypeAnn;
  isStatic?: boolean;
  isMut?: boolean;
}

export interface PropSig extends BaseNode {
  kind: 'PropSig';
  name: string;
  typeAnn?: TypeAnn;
  isReadonly?: boolean;
}

export interface Enum extends BaseNode {
  kind: 'Enum';
  name: string;
  members: EnumMember[];
  isConst?: boolean;
}

export interface EnumMember {
  name: string;
  value?: number | string;
}

export interface TypeAlias extends BaseNode {
  kind: 'TypeAlias';
  name: string;
  typeParams?: string[];
  typeAnn: TypeAnn;
}

export interface DeclareConst extends BaseNode {
  kind: 'DeclareConst';
  name: string;
  typeAnn?: TypeAnn;
  init?: Expression;
}

export interface DeclareFunction extends BaseNode {
  kind: 'DeclareFunction';
  name: string;
  params: Param[];
  returnType?: TypeAnn;
  isExtern?: boolean;
  isVariadic?: boolean;
}

export interface DeclareModule extends BaseNode {
  kind: 'DeclareModule';
  moduleName: string;
  body: Stmt[];
}

export interface DeclarePlatform extends BaseNode {
  kind: 'DeclarePlatform';
  fields: Record<string, unknown>;
}

export interface Return extends BaseNode {
  kind: 'Return';
  value?: Expression | null;
}

export interface If extends BaseNode {
  kind: 'If';
  test: Expression;
  consequent: Stmt;
  alternate?: Stmt | null;
}

export interface For extends BaseNode {
  kind: 'For';
  init?: Stmt | null;
  test?: Expression | null;
  update?: Expression | null;
  body: Stmt;
}

export interface While extends BaseNode {
  kind: 'While';
  test: Expression;
  body: Stmt;
}

export interface DoWhile extends BaseNode {
  kind: 'DoWhile';
  test: Expression;
  body: Stmt;
}

export interface Throw extends BaseNode {
  kind: 'Throw';
  value: Expression;
}

export interface CatchClause {
  param?: string | null;
  typeAnn?: TypeAnn;
  body: Stmt[];
}

export interface TryCatch extends BaseNode {
  kind: 'TryCatch';
  body: Stmt[];
  catches: CatchClause[];
  finally?: Stmt[] | null;
}

export interface SwitchCase {
  test?: Expression | null;
  consequent: Stmt[];
}

export interface Switch extends BaseNode {
  kind: 'Switch';
  discriminant: Expression;
  cases: SwitchCase[];
}

export interface Native extends BaseNode {
  kind: 'Native';
  content?: string | null;
  templateParts?: unknown[];
}

export interface Unsafe extends BaseNode {
  kind: 'Unsafe';
  body: Stmt[];
}

export interface Spawn extends BaseNode {
  kind: 'Spawn';
  throwsTypes?: TypeAnn[];
  body: Stmt[];
}

export interface Block extends BaseNode {
  kind: 'Block';
  body: Stmt[];
}

export interface ExprStmt extends BaseNode {
  kind: 'ExprStmt';
  expr: Expression;
}

export interface Break extends BaseNode {
  kind: 'Break';
  label?: string | null;
}

export interface Continue extends BaseNode {
  kind: 'Continue';
  label?: string | null;
}

export interface Labeled extends BaseNode {
  kind: 'Labeled';
  label: string;
  body: Stmt;
}

export interface Noop extends BaseNode {
  kind: 'Noop';
}

// ---------------------------------------------------------------------------
// Match statement
// ---------------------------------------------------------------------------

export interface MatchCase {
  pattern: MatchPattern;
  guard?: Expression | null;
  body: Stmt[];
}

export interface Match extends BaseNode {
  kind: 'Match';
  discriminant: Expression;
  cases: MatchCase[];
  hasParens?: boolean;
}

// ---------------------------------------------------------------------------
// Expressions (Expr)
// ---------------------------------------------------------------------------

export type Expression =
  | Literal | TemplateLit | Ident | Member | OptChain | Call | New
  | Index | RangeIndex | Binary | Unary | Ternary | Assign | Cast
  | ArrayLit | ObjLit | NonNull | Propagate | Typeof | Await | Yield
  | Drop | Arrow | FuncExpr;

export interface Literal extends BaseNode {
  kind: 'Literal';
  litType: 'number' | 'string' | 'boolean' | 'null' | 'int';
  value: string;
}

export interface TemplateLit extends BaseNode {
  kind: 'TemplateLit';
  parts: unknown[];
}

export interface Ident extends BaseNode {
  kind: 'Ident';
  name: string;
}

export interface Member extends BaseNode {
  kind: 'Member';
  object: Expression;
  prop: string;
  optional?: boolean;
}

export interface OptChain extends BaseNode {
  kind: 'OptChain';
  object: Expression;
  prop: string;
}

export interface Call extends BaseNode {
  kind: 'Call';
  callee: Expression;
  args: Argument[];
  typeArgs?: TypeAnn[];
}

export interface Argument {
  expr: Expression;
  spread?: boolean;
}

export interface New extends BaseNode {
  kind: 'New';
  callee: Expression;
  args: Argument[];
  typeArgs?: TypeAnn[];
}

export interface Index extends BaseNode {
  kind: 'Index';
  object: Expression;
  index: Expression;
}

export interface RangeIndex extends BaseNode {
  kind: 'RangeIndex';
  object: Expression;
  start?: Expression | null;
  end?: Expression | null;
}

export interface Binary extends BaseNode {
  kind: 'Binary';
  op: string;
  left: Expression;
  right: Expression;
}

export interface Unary extends BaseNode {
  kind: 'Unary';
  op: '!' | '+' | '-' | '~' | '*' | '&' | '++pre' | '--pre' | '++post' | '--post' | 'typeof';
  expr: Expression;
}

export interface Ternary extends BaseNode {
  kind: 'Ternary';
  cond: Expression;
  yes: Expression;
  no: Expression;
}

export interface Assign extends BaseNode {
  kind: 'Assign';
  op: string;
  left: Expression;
  right: Expression;
}

export interface Cast extends BaseNode {
  kind: 'Cast';
  expr: Expression;
  castType: TypeAnn;
}

export interface ArrayLit extends BaseNode {
  kind: 'ArrayLit';
  elems: { expr: Expression; spread?: boolean }[];
}

export interface ObjLitProp {
  key: string;
  value: Expression;
  computed?: boolean;
  spread?: boolean;
}

export interface ObjLit extends BaseNode {
  kind: 'ObjLit';
  props: ObjLitProp[];
}

export interface NonNull extends BaseNode {
  kind: 'NonNull';
  expr: Expression;
}

export interface Propagate extends BaseNode {
  kind: 'Propagate';
  expr: Expression;
}

export interface Typeof extends BaseNode {
  kind: 'Typeof';
  expr: Expression;
}

export interface Await extends BaseNode {
  kind: 'Await';
  expr: Expression;
}

export interface Yield extends BaseNode {
  kind: 'Yield';
  delegate?: boolean;
  value?: Expression | null;
}

export interface Drop extends BaseNode {
  kind: 'Drop';
  expr: Expression;
}

export interface Arrow extends BaseNode {
  kind: 'Arrow';
  captures: unknown[];
  params: Param[];
  returnType?: TypeAnn;
  body: Stmt[] | Expression;
  isAsync?: boolean;
}

export interface FuncExpr extends BaseNode {
  kind: 'FuncExpr';
  name?: string | null;
  params: Param[];
  returnType?: TypeAnn;
  body: Stmt[];
  isAsync?: boolean;
}

// ---------------------------------------------------------------------------
// Match patterns
// ---------------------------------------------------------------------------

export type MatchPattern =
  | MatchWild | MatchNull | MatchTuple | MatchRange | MatchLit
  | MatchObjLit | MatchEnum | MatchClass | MatchIdent | MatchOr;

export interface MatchWild extends BaseNode {
  kind: 'MatchWild';
}

export interface MatchNull extends BaseNode {
  kind: 'MatchNull';
}

export interface MatchTuple extends BaseNode {
  kind: 'MatchTuple';
  elements: MatchPattern[];
}

export interface MatchRange extends BaseNode {
  kind: 'MatchRange';
  lo: Expression;
  hi: Expression;
}

export interface MatchLit extends BaseNode {
  kind: 'MatchLit';
  value: Expression;
  litType: 'number' | 'string' | 'boolean';
}

export interface MatchObjLitDiscriminator {
  key: string;
  value: MatchPattern;
}

export interface MatchObjLit extends BaseNode {
  kind: 'MatchObjLit';
  discriminators: MatchObjLitDiscriminator[];
  fields: { name: string; pattern: MatchPattern }[];
}

export interface MatchEnum extends BaseNode {
  kind: 'MatchEnum';
  enumName: string;
  caseName: string;
  path: string;
}

export interface MatchClass extends BaseNode {
  kind: 'MatchClass';
  className: string;
  fields: { name: string; pattern: MatchPattern }[];
}

export interface MatchIdent extends BaseNode {
  kind: 'MatchIdent';
  name: string;
}

export interface MatchOr extends BaseNode {
  kind: 'MatchOr';
  patterns: MatchPattern[];
}

// ---------------------------------------------------------------------------
// Binding patterns
// ---------------------------------------------------------------------------

export interface ArrayPatternElement {
  name?: string;
  default?: Expression;
  rest?: boolean;
  pattern?: ArrayPattern | ObjPattern;
}

export interface ArrayPattern {
  kind: 'ArrayPattern';
  elements: ArrayPatternElement[];
}

export interface ObjPatternProp {
  key: string;
  name?: string;
  default?: Expression;
}

export interface ObjPattern {
  kind: 'ObjPattern';
  properties: ObjPatternProp[];
}

// ---------------------------------------------------------------------------
// Convenience aliases
// ---------------------------------------------------------------------------

export type ASTNode = Stmt | Expression | TypeAnn | MatchPattern | ArrayPattern | ObjPattern;
