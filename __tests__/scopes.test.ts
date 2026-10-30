import fs from 'fs';
import os from 'os';
import path from 'path';
import {test, expect, beforeEach, afterEach} from 'vitest';
import {LoadScopeRules, parseScopeList, parseScopes} from '../src/releasetag/scopes';

let dir = '';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scopes-'));
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

function write(name: string, text: string): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return file;
}

test('parse a scope list with comments and blank lines', () => {
  expect([...parseScopeList('# CI and tests\n.github\nCI\n\n  e2e  \n# docs\ndocs\n')]).toEqual([
    '.github',
    'ci',
    'e2e',
    'docs',
  ]);
});

test('parse a scope group', () => {
  expect(parseScopes('(netsim, Dashboard)')).toEqual(['netsim', 'dashboard']);
  expect(parseScopes(undefined)).toEqual([]);
  expect(parseScopes('()')).toEqual([]);
});

test('load both lists', () => {
  const rules = LoadScopeRules(write('product', 'bacnet\n'), write('tooling', 'ci\n'));
  expect(rules?.isToolingOnly('(ci)')).toBe(true);
  expect(rules?.isToolingOnly('(bacnet)')).toBe(false);
  expect(rules?.isToolingOnly(undefined)).toBe(false);
});

test('without a tooling list the scope rules are off', () => {
  expect(LoadScopeRules(write('product', 'bacnet\n'), path.join(dir, 'missing'))).toBeNull();
  expect(LoadScopeRules('', '')).toBeNull();
});

test('a missing product list only means everything outside tooling is product', () => {
  const rules = LoadScopeRules(path.join(dir, 'missing'), write('tooling', 'ci\n'));
  expect(rules?.isToolingOnly('(ci)')).toBe(true);
  expect(rules?.isToolingOnly('(bacnet)')).toBe(false);
});

test('a scope in both lists counts as product', () => {
  const rules = LoadScopeRules(write('product', 'docs\n'), write('tooling', 'docs\nci\n'));
  expect(rules?.isToolingOnly('(docs)')).toBe(false);
  expect(rules?.isToolingOnly('(ci)')).toBe(true);
});

// The lists as ugagent keeps them: comments, a scope starting with a dot.
test('read the ugagent scope list format', () => {
  const tooling = write(
    'tooling',
    '# CI, tests and release tooling.\n.github\nbuild-tools\nci\n\n# Docs\ndoc\ndocs\n',
  );
  const product = write('product', '# Protocols\nbacnet\nmodbus\n\n# Packaging\ndeps\nsecurity\n');
  const rules = LoadScopeRules(product, tooling);
  expect(rules?.isToolingOnly('(.github)')).toBe(true);
  expect(rules?.isToolingOnly('(docs,ci)')).toBe(true);
  expect(rules?.isToolingOnly('(security)')).toBe(false);
});
