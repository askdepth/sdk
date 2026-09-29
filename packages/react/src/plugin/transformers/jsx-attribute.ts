import { createHash } from 'node:crypto';
import { isAbsolute, relative } from 'node:path';
import { parse } from '@babel/parser';
import generateModule from '@babel/generator';
import traverseModule from '@babel/traverse';
import * as t from '@babel/types';
import type { NodePath } from '@babel/traverse';
import { ASKDEPTH_ID_ATTR, ASKDEPTH_SRC_ATTR } from '../../constants.js';

export interface JsxTransformOptions {
  production: boolean;
}

export interface JsxTransformResult {
  code: string;
  map: ReturnType<typeof import('@babel/generator').default>['map'] | null;
  locations: Record<string, string>;
}

type Traverse = {
  (parent: t.Node, opts: Record<string, unknown>): void;
};

function unwrap<T>(mod: T): T extends { default: infer D } ? D : T {
  if (typeof mod === 'function') return mod as T extends { default: infer D } ? D : T;
  if (mod && typeof mod === 'object' && 'default' in mod) {
    return (mod as { default: T extends { default: infer D } ? D : T }).default;
  }
  return mod as T extends { default: infer D } ? D : T;
}

const traverse = unwrap(traverseModule) as unknown as Traverse;
const generate = unwrap(generateModule) as unknown as typeof import('@babel/generator').default;

const JSX_RUNTIME = new Set(['react/jsx-runtime', 'react/jsx-dev-runtime']);

function containsJsx(code: string): boolean {
  return (
    code.includes('jsx-runtime') ||
    code.includes('jsx-dev-runtime') ||
    code.includes('react/jsx') ||
    code.includes('</') ||
    code.includes('<>') ||
    /<[A-Za-z_$][\w.-]*(?:\s|>|\/)/.test(code)
  );
}

export function shouldTransform(id: string, code?: string): boolean {
  const clean = id.split('?')[0]?.split('#')[0] ?? id;
  if (!clean || clean.includes('\0') || clean.includes('node_modules')) return false;
  if (/\.(tsx|jsx)$/.test(clean)) return true;
  if (/\.(js|mjs|cjs)$/.test(clean)) {
    if (code !== undefined) {
      return containsJsx(code);
    }
    return true;
  }
  return false;
}

export function sourceLabel(filename: string, line: number, column: number): string {
  const clean = filename.split('?')[0]?.split('#')[0] ?? filename;
  const file = isAbsolute(clean) ? relative(process.cwd(), clean) : clean;
  return `${file.split('\\').join('/')}:${line}:${column}`;
}

export function hashComponentId(label: string): string {
  return `cmp_${createHash('sha256').update(label).digest('hex').slice(0, 8)}`;
}

function marker(filename: string, line: number, column: number, production: boolean): { name: string; value: string } {
  const label = sourceLabel(filename, line, column);
  if (production) return { name: ASKDEPTH_ID_ATTR, value: hashComponentId(label) };
  return { name: ASKDEPTH_SRC_ATTR, value: label };
}

function isFragmentName(path: NodePath<t.JSXOpeningElement>): boolean {
  const name = path.node.name;
  if (t.isJSXIdentifier(name)) {
    const binding = path.scope.getBinding(name.name);
    if (!binding?.path.isImportSpecifier()) return false;
    const imported = binding.path.node.imported;
    return (t.isIdentifier(imported) ? imported.name : imported.value) === 'Fragment' &&
      !!binding.path.parent && t.isImportDeclaration(binding.path.parent) && binding.path.parent.source.value === 'react';
  }
  if (!t.isJSXMemberExpression(name) || !t.isJSXIdentifier(name.object) || name.property.name !== 'Fragment') return false;
  const binding = path.scope.getBinding(name.object.name);
  if (!binding) return name.object.name === 'React';
  return (binding.path.isImportDefaultSpecifier() || binding.path.isImportNamespaceSpecifier()) &&
    !!binding.path.parent && t.isImportDeclaration(binding.path.parent) && binding.path.parent.source.value === 'react';
}

function isCompiledFragment(path: NodePath<t.CallExpression>): boolean {
  const type = path.node.arguments[0];
  if (!type || !t.isIdentifier(type)) return false;
  const binding = path.scope.getBinding(type.name);
  if (!binding?.path.isImportSpecifier()) return false;
  const imported = binding.path.node.imported;
  return (t.isIdentifier(imported) ? imported.name : imported.value) === 'Fragment' &&
    !!binding.path.parent && t.isImportDeclaration(binding.path.parent) && JSX_RUNTIME.has(binding.path.parent.source.value);
}

function hasJsxAttribute(opening: t.JSXOpeningElement, name: string): boolean {
  return opening.attributes.some(
    (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === name,
  );
}

function hasObjectProperty(object: t.ObjectExpression, name: string): boolean {
  return object.properties.some(
    (prop) =>
      t.isObjectProperty(prop) &&
      ((t.isIdentifier(prop.key) && prop.key.name === name) ||
        (t.isStringLiteral(prop.key) && prop.key.value === name)),
  );
}

function jsxRuntimeSource(path: NodePath<t.CallExpression>): string | null {
  const callee = path.node.callee;
  if (!t.isIdentifier(callee)) return null;
  const binding = path.scope.getBinding(callee.name);
  const parent = binding?.path.parent;
  if (!parent || !t.isImportDeclaration(parent)) return null;
  return JSX_RUNTIME.has(parent.source.value) ? parent.source.value : null;
}

function locationOf(node: t.Node, filename: string, path: NodePath<t.CallExpression> | null): { line: number; column: number } | null {
  if (path && jsxRuntimeSource(path) === 'react/jsx-dev-runtime' && path.node.arguments[4] && t.isObjectExpression(path.node.arguments[4])) {
    const source = path.node.arguments[4];
    const line = numericProp(source, 'lineNumber');
    const column = numericProp(source, 'columnNumber');
    if (line !== null) return { line, column: column ?? 1 };
  }
  if (!node.loc) return null;
  return { line: node.loc.start.line, column: node.loc.start.column + 1 };
}

function numericProp(object: t.ObjectExpression, name: string): number | null {
  for (const prop of object.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
    if (key === name && t.isNumericLiteral(prop.value)) return prop.value.value;
  }
  return null;
}

export function transformJsxSource(code: string, filename: string, options: JsxTransformOptions): JsxTransformResult | null {
  if (!shouldTransform(filename, code)) return null;
  let ast: t.File;
  try {
    ast = parse(code, {
      sourceType: 'module',
      sourceFilename: filename,
      plugins: ['jsx', 'typescript'],
    });
  } catch {
    return null;
  }

  let changed = false;
  const locations: Record<string, string> = {};
  const file = filename.split('?')[0]?.split('#')[0] ?? filename;

  traverse(ast, {
    JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
      if (isFragmentName(path)) return;
      const loc = locationOf(path.node, file, null);
      if (!loc) return;
      const attr = marker(file, loc.line, loc.column, options.production);
      if (hasJsxAttribute(path.node, attr.name)) return;
      path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier(attr.name), t.stringLiteral(attr.value)));
      if (options.production) locations[attr.value] = sourceLabel(file, loc.line, loc.column);
      changed = true;
    },
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!jsxRuntimeSource(path)) return;
      if (isCompiledFragment(path)) return;
      const props = path.node.arguments[1];
      if (!props || !t.isObjectExpression(props)) return;
      const loc = locationOf(path.node, file, path);
      if (!loc) return;
      const attr = marker(file, loc.line, loc.column, options.production);
      if (hasObjectProperty(props, attr.name)) return;
      props.properties.push(t.objectProperty(t.stringLiteral(attr.name), t.stringLiteral(attr.value)));
      if (options.production) locations[attr.value] = sourceLabel(file, loc.line, loc.column);
      changed = true;
    },
  });

  if (!changed) return null;
  const generated = generate(ast, { sourceMaps: true, sourceFileName: file, comments: true }, code);
  return { code: generated.code, map: generated.map ?? null, locations };
}
