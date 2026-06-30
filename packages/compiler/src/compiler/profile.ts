import { lex, TK } from './lexer.js';
import { TSC_DEFINES } from '@tsclang/shared';

export interface Capabilities {
  target?: string;
  allocator?: string;
  async?: string;
  fpu?: boolean;
  bits?: number;
  usize?: string;
  defaultNumber?: string;
  unaligned_access?: boolean;
  os?: boolean;
  posix?: boolean;
  strtoll?: boolean;
  console_uart?: boolean;
  console_baud?: number;
  toolchain?: string;
  toolchainFile?: string;
  include?: string;
  heap_size?: number;
  stack_size?: number;
  ram_size?: number;
  flash_size?: number;
}

export function capabilityDefines(caps: Capabilities | null | undefined): string[] {
  if (!caps) return [];
  const defs: string[] = [];
  if (caps.posix === false) defs.push(`-D${TSC_DEFINES.NO_POSIX}`);
  if (caps.strtoll === false) defs.push(`-D${TSC_DEFINES.NO_STRTOLL}`);
  if (caps.console_uart) {
    defs.push(`-D${TSC_DEFINES.CONSOLE_UART}`);
    if (caps.console_baud) defs.push(`-D${TSC_DEFINES.CONSOLE_BAUD}=${caps.console_baud}`);
  }
  return defs;
}

const VALID_FIELDS = {
  target:            'string',
  allocator:         'string',
  async:             'string',
  fpu:               'boolean',
  bits:              'number',
  usize:             'string',
  defaultNumber:     'string',
  unaligned_access:  'boolean',
  os:                'boolean',
  posix:             'boolean',
  strtoll:           'boolean',
  console_uart:      'boolean',
  console_baud:      'number',
  toolchain:         'string',
  toolchainFile:     'string',
  include:           'string',
  heap_size:         'number',
  stack_size:        'number',
  ram_size:          'number',
  flash_size:        'number',
};

function parseValue(tok: any) {
  if (tok.type === TK.STRING) return tok.value;
  if (tok.type === TK.BOOL)   return tok.value === 'true';
  if (tok.type === TK.NUMBER) return Number(tok.value);
  return undefined;
}

export function parsePlatformDecl(src: string, filename = '<profile>') {
  const tokens = lex(src, filename);
  let pos = 0;

  function cur()    { return tokens[pos] || tokens[tokens.length - 1]; }
  function advance() { return tokens[pos++]; }

  while (pos < tokens.length && cur().type !== TK.EOF) {
    if (cur().type === TK.IDENT && cur().value === 'declare') {
      advance();
      if (cur().type === TK.IDENT && cur().value === 'platform') {
        advance();
        if (cur().type !== TK.LBRACE) {
          throw new Error(`${filename}: expected '{' after 'declare platform'`);
        }
        advance();

        const caps = {};
        while (cur().type !== TK.RBRACE && cur().type !== TK.EOF) {
          if (cur().type !== TK.IDENT) { advance(); continue; }
          const key = cur().value;
          advance();

          if (cur().type !== TK.COLON) { continue; }
          advance();

          const val = parseValue(cur());
          if (val === undefined) {
            throw new Error(`${filename}: unexpected token '${cur().value}' for field '${key}'`);
          }
          advance();

          if (!(VALID_FIELDS as Record<string, string>)[key]) {
            throw new Error(`${filename}: unknown capability field '${key}'`);
          }
          const expected = (VALID_FIELDS as Record<string, string>)[key];
          if (typeof val !== expected) {
            throw new Error(`${filename}: field '${key}' expects ${expected}, got ${typeof val}`);
          }
          (caps as Record<string, any>)[key] = val;
        }

        if (cur().type === TK.RBRACE) advance();
        return caps;
      }
    }
    advance();
  }
  return null;
}
