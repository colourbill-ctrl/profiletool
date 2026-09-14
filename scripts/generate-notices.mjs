#!/usr/bin/env node
// (c) 2026 William Li
//
// Writes frontend/public/THIRD-PARTY-NOTICES.txt — the licence notices for everything the
// deployed app distributes that profiletool did not write. Served beside the app (Vite copies
// public/ into dist/), because a deploy distributes binaries: the WASM modules compile in
// iccDEV and several C libraries whose licences (ICC BSD-style, IJG, libpng, BSD-3, …) require
// their notices to accompany binary distribution, and the JS bundle carries MIT packages
// whose notice must travel with copies.
//
// SOURCES ARE THE REAL INPUTS OF THE BUILD, not a hand-kept list:
//   iccDEV + libtiff   ICCDEV_ROOT (build-wasm.sh compiles IccProfLib and libtiff from it)
//   zlib/libpng/libjpeg Emscripten's ports cache (build-wasm.sh stages those ports; iccDEV's
//                       third_party copies of them are NOT what gets linked)
//   libxml2            the FetchContent checkout in validator-wasm/build (pinned in CMakeLists)
//   nlohmann-json      the host header CMakeLists links to
//   tinyexr            validator-wasm/third_party/tinyexr — included only where it exists, so
//                      the same script is right on a branch without the EXR decoder
//   Emscripten runtime its own LICENSE, musl's COPYRIGHT and libc++'s LICENSE.TXT
//   npm packages       the production dependency graph walked from frontend/package.json —
//                      NOT `npm ls`, which also lists ad-hoc tools installed with --no-save
//                      (xlsx for sync-translations.mjs), which the app never bundles
//
// Output is deterministic (no timestamps, sorted packages), so a diff means a real change.
//
// Usage:
//   node scripts/generate-notices.mjs          # write the file
//   node scripts/generate-notices.mjs --check  # exit 1 if the committed file is out of date
// Env overrides: ICCDEV_ROOT, EMSCRIPTEN, LIBXML2_SRC, NLOHMANN_JSON_HPP.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FRONTEND = join(ROOT, 'frontend')
const ICCDEV = process.env.ICCDEV_ROOT || '/home/colour/code/iccdev'
const EMSCRIPTEN = process.env.EMSCRIPTEN || join(homedir(), 'emsdk-install/emsdk/upstream/emscripten')
const LIBXML2_SRC = process.env.LIBXML2_SRC || join(ROOT, 'validator-wasm/build/_deps/libxml2-src')
const NLOHMANN_HPP = process.env.NLOHMANN_JSON_HPP || '/usr/include/nlohmann/json.hpp'
const OUT = join(FRONTEND, 'public/THIRD-PARTY-NOTICES.txt')
const RULE = '-'.repeat(78)

// A missing input is an error, never a silently shorter notices file.
function read(path, what) {
  if (!existsSync(path)) throw new Error(`missing licence source for ${what}: ${path} (see the env overrides in this script)`)
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trimEnd()
}
function subdir(dir, re, what) {
  if (!existsSync(dir)) throw new Error(`missing ${what} directory: ${dir}`)
  const name = readdirSync(dir).filter((n) => re.test(n)).sort().pop()
  if (!name) throw new Error(`no ${what} source matching ${re} under ${dir}`)
  return join(dir, name)
}
const tryRead = (path) => (existsSync(path) ? readFileSync(path, 'utf8').trim() : null)

// ── native code compiled into the WebAssembly modules ─────────────────────────
function nativeEntries() {
  const ports = join(EMSCRIPTEN, 'cache/ports')
  const zlibDir = subdir(join(ports, 'zlib'), /^zlib-/, 'zlib port')
  const pngDir = subdir(join(ports, 'libpng'), /^libpng-/, 'libpng port')
  const jpegDir = subdir(join(ports, 'libjpeg'), /^jpeg-/, 'libjpeg port')

  // IJG terms: only the LEGAL ISSUES section of the README is the licence.
  const jpegReadme = read(join(jpegDir, 'README'), 'libjpeg')
  const legal = /^LEGAL ISSUES\n=+\n([\s\S]*?)\n(?=REFERENCES\n=+)/m.exec(jpegReadme)
  if (!legal) throw new Error('libjpeg README: LEGAL ISSUES section not found')

  const libxml2Tag = /GIT_TAG\s+\S+\s+#\s*(v[\d.]+)/.exec(read(join(ROOT, 'validator-wasm/CMakeLists.txt'), 'CMakeLists'))?.[1]
  // The version macros live in json.hpp in the single-header build, and in detail/abi_macros.hpp
  // in the multi-header one that distro packages install.
  const hpp = read(NLOHMANN_HPP, 'nlohmann-json') + '\n' + (tryRead(join(dirname(NLOHMANN_HPP), 'detail/abi_macros.hpp')) || '')
  const nv = ['MAJOR', 'MINOR', 'PATCH'].map((k) => new RegExp(`#\\s*define\\s+NLOHMANN_JSON_VERSION_${k}\\s+(\\d+)`).exec(hpp)?.[1])
  const emVersion = tryRead(join(EMSCRIPTEN, 'emscripten-version.txt'))?.replace(/"/g, '')

  const entries = [
    { name: 'iccDEV (IccProfLib, IccLibXML, IccPawgReport) — International Color Consortium',
      used: 'every WebAssembly module', license: 'ICC BSD-3-Clause-style licence',
      text: read(join(ICCDEV, 'LICENSE.md'), 'iccDEV') },
    { name: `LibTIFF${tryRead(join(ICCDEV, 'third_party/libtiff/VERSION')) ? ' ' + tryRead(join(ICCDEV, 'third_party/libtiff/VERSION')) : ''}`,
      used: 'iccimage (image codecs)', license: 'libtiff licence',
      text: read(join(ICCDEV, 'third_party/libtiff/LICENSE.md'), 'libtiff') },
    { name: `libpng ${pngDir.split('libpng-').pop()}`, used: 'iccimage (image codecs)', license: 'PNG Reference Library License v2',
      text: read(join(pngDir, 'LICENSE'), 'libpng') },
    { name: `libjpeg ${jpegDir.split('jpeg-').pop()} — Independent JPEG Group`, used: 'iccimage (image codecs)', license: 'IJG licence',
      text: 'This software is based in part on the work of the Independent JPEG Group.\n\n' + legal[1].trimEnd() },
    { name: `zlib ${zlibDir.split('zlib-').pop()}`, used: 'iccimage (image codecs)', license: 'zlib licence',
      text: read(join(zlibDir, 'LICENSE'), 'zlib') },
    { name: `libxml2${libxml2Tag ? ' ' + libxml2Tag : ''}`, used: 'iccxml (XML converter)', license: 'MIT',
      text: read(join(LIBXML2_SRC, 'Copyright'), 'libxml2') },
    { name: `JSON for Modern C++ (nlohmann/json)${nv.every(Boolean) ? ' ' + nv.join('.') : ''}`,
      used: 'iccjson, iccpawg, iccprofiledump and other modules', license: 'MIT',
      text: read(join(ICCDEV, 'third_party/nlohmann-json/LICENSE.MIT'), 'nlohmann-json') },
  ]
  const tinyexr = join(ROOT, 'validator-wasm/third_party/tinyexr/LICENSE')
  if (existsSync(tinyexr)) {
    entries.push({ name: 'tinyexr v3.2.0', used: 'iccimage (OpenEXR decoding)', license: 'BSD-3-Clause', text: read(tinyexr, 'tinyexr') })
  }
  entries.push(
    { name: `Emscripten${emVersion ? ' ' + emVersion : ''} (JavaScript loaders and runtime support code)`,
      used: 'every WebAssembly module and its .mjs loader', license: 'MIT / University of Illinois-NCSA',
      text: read(join(EMSCRIPTEN, 'LICENSE'), 'Emscripten') },
    { name: 'musl libc (as shipped with Emscripten)', used: 'every WebAssembly module', license: 'MIT',
      text: read(join(EMSCRIPTEN, 'system/lib/libc/musl/COPYRIGHT'), 'musl') },
    { name: 'LLVM libc++, libc++abi and compiler-rt (as shipped with Emscripten)', used: 'every WebAssembly module',
      license: 'Apache-2.0 WITH LLVM-exception (libc++abi carries the same licence)',
      text: read(join(EMSCRIPTEN, 'system/lib/libcxx/LICENSE.TXT'), 'libc++') },
  )
  return entries
}

// ── JavaScript bundled into the app ─────────────────────────────────────────
// Node resolution from the requiring package's directory upward, as the bundler resolves it.
function resolvePackage(name, fromDir) {
  for (let d = fromDir; ; d = dirname(d)) {
    const p = join(d, 'node_modules', name, 'package.json')
    if (existsSync(p)) return dirname(p)
    if (d === FRONTEND || dirname(d) === d) return null
  }
}

function npmEntries() {
  const rootPkg = JSON.parse(read(join(FRONTEND, 'package.json'), 'frontend/package.json'))
  const seen = new Map()   // dir -> entry
  const queue = Object.keys(rootPkg.dependencies || {}).map((n) => [n, FRONTEND])
  while (queue.length) {
    const [name, from] = queue.shift()
    const dir = resolvePackage(name, from)
    if (!dir) throw new Error(`dependency ${name} (required from ${from}) is not installed — run npm ci in frontend/`)
    if (seen.has(dir)) continue
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f))
    if (!file) throw new Error(`${pkg.name}@${pkg.version} ships no licence file — add its notice by hand`)
    seen.set(dir, {
      name: `${pkg.name}@${pkg.version}`, used: 'the web app bundle',
      license: typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.licenses || pkg.license),
      text: readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n').trimEnd(),
    })
    for (const dep of Object.keys({ ...(pkg.dependencies || {}), ...(pkg.optionalDependencies || {}) })) queue.push([dep, dir])
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// ── assemble ─────────────────────────────────────────────────────────────────
function block({ name, used, license, text }) {
  return [RULE, name, `Used in: ${used}`, `Licence: ${license}`, RULE, '', text, ''].join('\n')
}

function build() {
  const license = read(join(ROOT, 'LICENSE'), 'profiletool LICENSE')
  return [
    'profiletool — licence and third-party notices',
    '',
    'profiletool is released under the MIT License, reproduced first below. The deployed app',
    'also distributes the third-party components listed after it, each under its own licence.',
    'The WebAssembly modules are compiled from C and C++ sources; the web app bundle includes',
    'the JavaScript packages. Nothing listed here is under a copyleft licence.',
    '',
    'Generated by scripts/generate-notices.mjs — do not edit by hand.',
    '',
    '='.repeat(78),
    '1. profiletool',
    '='.repeat(78),
    '',
    license,
    '',
    '='.repeat(78),
    '2. Compiled into the WebAssembly modules',
    '='.repeat(78),
    '',
    ...nativeEntries().map(block),
    '='.repeat(78),
    '3. JavaScript packages bundled into the web app',
    '='.repeat(78),
    '',
    ...npmEntries().map(block),
  ].join('\n')
}

const text = build() + '\n'
if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  if (current !== text) {
    console.error('THIRD-PARTY-NOTICES.txt is out of date — run node scripts/generate-notices.mjs')
    process.exit(1)
  }
  console.log('THIRD-PARTY-NOTICES.txt is up to date')
} else {
  writeFileSync(OUT, text)
  console.log(`wrote ${OUT.slice(ROOT.length + 1)} (${text.length} bytes)`)
}
