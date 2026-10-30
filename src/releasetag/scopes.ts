import fs from 'fs';
import * as core from '@actions/core';

// ScopeRules says which conventional-commit scopes ship to users (product) and which
// only serve development (tooling, e.g. CI or internal CLIs). A `feat` whose scopes are
// all tooling bumps the patch version instead of the minor one.
export class ScopeRules {
  private readonly warned = new Set<string>();

  constructor(
    readonly product: ReadonlySet<string>,
    readonly tooling: ReadonlySet<string>,
  ) {}

  // isToolingOnly reports whether the scope group of a commit subject ("(a,b)", or
  // undefined without a scope) names tooling scopes only. A commit without a scope, or
  // with any product or unknown scope, is not tooling-only: an unknown scope counts as
  // product (the conservative choice) and is warned about once.
  isToolingOnly(scopeGroup: string | undefined): boolean {
    const scopes = parseScopes(scopeGroup);
    if (scopes.length === 0) {
      return false;
    }
    let toolingOnly = true;
    for (const scope of scopes) {
      if (this.tooling.has(scope)) {
        continue;
      }
      toolingOnly = false;
      if (!this.product.has(scope) && !this.warned.has(scope)) {
        this.warned.add(scope);
        core.warning(`Scope '${scope}' is in neither scope list; counting it as a product scope.`);
      }
    }
    return toolingOnly;
  }
}

// parseScopes splits a scope group such as "(netsim, bacnet)" into lower-case scopes.
export function parseScopes(scopeGroup: string | undefined): string[] {
  if (!scopeGroup) {
    return [];
  }
  return scopeGroup
    .replace(/^\(/, '')
    .replace(/\)$/, '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s !== '');
}

// parseScopeList reads one scope per line; blank lines and lines starting with '#' are
// skipped.
export function parseScopeList(text: string): Set<string> {
  const scopes = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const scope = line.trim().toLowerCase();
    if (scope === '' || scope.startsWith('#')) {
      continue;
    }
    scopes.add(scope);
  }
  return scopes;
}

// LoadScopeRules reads the product and tooling scope lists. Without a tooling list there
// is nothing to treat differently, so it returns null and every `feat` bumps the minor
// version as before. A missing product list only means that every scope outside the
// tooling list counts as product.
export function LoadScopeRules(productFile: string, toolingFile: string): ScopeRules | null {
  const read = (file: string): Set<string> | null => {
    if (!file || !fs.existsSync(file)) {
      return null;
    }
    return parseScopeList(fs.readFileSync(file, 'utf8'));
  };
  const tooling = read(toolingFile);
  if (tooling === null) {
    core.info(`No tooling scope list at '${toolingFile}': every feat bumps the minor version.`);
    return null;
  }
  const product = read(productFile) ?? new Set<string>();
  // A scope in both lists counts as product: a wrong list must never cost a minor bump.
  for (const scope of [...tooling]) {
    if (product.has(scope)) {
      tooling.delete(scope);
      core.warning(`Scope '${scope}' is in both '${productFile}' and '${toolingFile}'; counting it as a product scope.`);
    }
  }
  core.info(
    `Scope lists: ${product.size} product scope(s) from '${productFile}', ${tooling.size} tooling scope(s) from '${toolingFile}'. ` +
      'A feat with tooling scopes only bumps the patch version.',
  );
  return new ScopeRules(product, tooling);
}
