#!/usr/bin/env node
/**
 * Vercel pre-build script.
 * Replaces pnpm workspace catalog: refs with real semver ranges
 * so that the project can be installed with plain npm on Vercel.
 * Also strips "type":"module" so Node can run this script without issues.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

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
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

function resolveCatalog(deps) {
  if (!deps) return deps;
  const out = {};
  for (const [k, v] of Object.entries(deps)) {
    if (v === 'catalog:') {
      if (!CATALOG[k]) throw new Error(`[prepare-standalone] No catalog entry for: ${k}`);
      out[k] = CATALOG[k];
    } else if (v.startsWith('workspace:')) {
      // skip workspace-internal deps
    } else {
      out[k] = v;
    }
  }
  return out;
}

pkg.name = 'salarn';
delete pkg.workspaces;
// Keep type:module so vite.config.ts works (ESM)
pkg.devDependencies = resolveCatalog(pkg.devDependencies);
pkg.dependencies = resolveCatalog(pkg.dependencies);

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log('[prepare-standalone] package.json updated for standalone Vercel deployment.');
