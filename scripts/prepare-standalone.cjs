#!/usr/bin/env node
/**
 * Vercel pre-build script (CommonJS — works with any Node version without flags).
 * Replaces pnpm workspace catalog: refs with real semver ranges
 * so that the project can be installed with plain npm on Vercel.
 *
 * Using .cjs extension so Node always treats this as CommonJS,
 * regardless of the "type": "module" field in package.json.
 */
const { readFileSync, writeFileSync } = require('fs');
const { resolve } = require('path');

const root = resolve(__dirname, '..');

// These versions MUST match the actual workspace catalog in pnpm-workspace.yaml
const CATALOG = {
  '@tailwindcss/vite': '^4.1.14',
  '@tanstack/react-query': '^5.90.21',
  '@types/node': '^25.3.3',
  '@types/react': '^19.2.0',
  '@types/react-dom': '^19.2.0',
  '@vitejs/plugin-react': '^5.0.4',
  'class-variance-authority': '^0.7.1',
  'clsx': '^2.1.1',
  'framer-motion': '^12.23.24',
  'lucide-react': '^0.545.0',
  'react': '19.1.0',
  'react-dom': '19.1.0',
  'tailwind-merge': '^3.3.1',
  'tailwindcss': '^4.1.14',
  'vite': '^7.3.0',
  'zod': '^3.25.76',
};

const pkgPath = resolve(root, 'package.json');
const raw = readFileSync(pkgPath, 'utf-8');
const pkg = JSON.parse(raw);

function resolveCatalog(deps) {
  if (!deps) return deps;
  const out = {};
  for (const [k, v] of Object.entries(deps)) {
    if (v === 'catalog:') {
      if (!CATALOG[k]) {
        console.warn('[prepare-standalone] No catalog entry for:', k, '— using latest');
        out[k] = 'latest';
      } else {
        out[k] = CATALOG[k];
        console.log('  resolved:', k, '->', CATALOG[k]);
      }
    } else if (typeof v === 'string' && v.startsWith('workspace:')) {
      // Skip workspace-internal deps — not needed for standalone build
      console.log('  skipped workspace dep:', k);
    } else {
      out[k] = v;
    }
  }
  return out;
}

pkg.name = 'salarn';
delete pkg.workspaces;
// Keep "type": "module" so vite.config.ts and ESM imports work correctly
if (pkg.devDependencies) pkg.devDependencies = resolveCatalog(pkg.devDependencies);
if (pkg.dependencies) pkg.dependencies = resolveCatalog(pkg.dependencies);

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log('[prepare-standalone] package.json updated for standalone Vercel deployment.');
