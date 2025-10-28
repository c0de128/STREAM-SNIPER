#!/usr/bin/env node

/**
 * Stream Sniper Build Script
 *
 * Packages the extension for Firefox (Manifest V2) and Chrome/Edge (Manifest V3)
 *
 * Usage:
 *   node build.js              # Build both Firefox and Chrome versions
 *   node build.js firefox      # Build only Firefox version
 *   node build.js chrome       # Build only Chrome version
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Build configuration
const BUILD_DIR = 'builds';
const VERSION = JSON.parse(fs.readFileSync('manifest.json', 'utf8')).version;

// Files to include in all builds
const COMMON_FILES = [
  'background.js',
  'browser-polyfill.js',
  'download-manager.js',
  'icon.png',
  'manifest-parser.js',
  'options.html',
  'options.js',
  'player.html',
  'player.js',
  'player.css',
  'popup.html',
  'popup.js',
  'popup.css',
  'quality-selector.html',
  'quality-selector.js',
  'setup-wizard.html',
  'setup-wizard.js',
  'storage-manager.js',
  'dash.all.min.js',
  'hls.min.js'
];

// Files specific to each browser
const FIREFOX_FILES = [
  ...COMMON_FILES,
  'manifest.json'
];

const CHROME_FILES = [
  ...COMMON_FILES,
  'manifest-v3.json'
];

// Native messaging files (optional, for documentation)
const NATIVE_MESSAGING_FILES = [
  'ytdlp-bridge.py',
  'com.streamsniper.ytdlp.firefox.json',
  'com.streamsniper.ytdlp.chrome.json',
  'NATIVE_MESSAGING_SETUP.md'
];

/**
 * Create builds directory if it doesn't exist
 */
function ensureBuildDir() {
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR);
    console.log(`✓ Created ${BUILD_DIR} directory`);
  }
}

/**
 * Create a zip archive
 */
function createZip(outputPath, files, renameManifest = false) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`  ✓ Created: ${path.basename(outputPath)} (${sizeMB} MB)`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add files to archive
    files.forEach(file => {
      if (fs.existsSync(file)) {
        // Rename manifest-v3.json to manifest.json for Chrome build
        const entryName = (renameManifest && file === 'manifest-v3.json')
          ? 'manifest.json'
          : file;

        archive.file(file, { name: entryName });
      } else {
        console.warn(`  ⚠ Warning: ${file} not found, skipping`);
      }
    });

    archive.finalize();
  });
}

/**
 * Build Firefox version (Manifest V2)
 */
async function buildFirefox() {
  console.log('\n📦 Building Firefox version...');

  const outputPath = path.join(BUILD_DIR, `stream-sniper-firefox-v${VERSION}.zip`);
  await createZip(outputPath, FIREFOX_FILES, false);

  return outputPath;
}

/**
 * Build Chrome version (Manifest V3)
 */
async function buildChrome() {
  console.log('\n📦 Building Chrome/Edge version...');

  const outputPath = path.join(BUILD_DIR, `stream-sniper-chrome-v${VERSION}.zip`);
  await createZip(outputPath, CHROME_FILES, true);

  return outputPath;
}

/**
 * Create source code archive (for Firefox AMO submission)
 */
async function buildSource() {
  console.log('\n📦 Building source code archive...');

  const outputPath = path.join(BUILD_DIR, `stream-sniper-source-v${VERSION}.zip`);

  // Include all project files except builds, node_modules, etc.
  const sourceFiles = [
    ...COMMON_FILES,
    'manifest.json',
    'manifest-v3.json',
    ...NATIVE_MESSAGING_FILES,
    'build.js',
    'package.json',
    'CLAUDE.md',
    'README.md'
  ];

  await createZip(outputPath, sourceFiles, false);

  return outputPath;
}

/**
 * Create native messaging package
 */
async function buildNativeMessaging() {
  console.log('\n📦 Building native messaging package...');

  const outputPath = path.join(BUILD_DIR, `stream-sniper-native-host-v${VERSION}.zip`);
  await createZip(outputPath, NATIVE_MESSAGING_FILES, false);

  return outputPath;
}

/**
 * Validate that all required files exist
 */
function validateFiles() {
  console.log('🔍 Validating files...');

  let missingFiles = [];

  COMMON_FILES.forEach(file => {
    if (!fs.existsSync(file)) {
      missingFiles.push(file);
    }
  });

  if (!fs.existsSync('manifest.json')) {
    missingFiles.push('manifest.json');
  }

  if (!fs.existsSync('manifest-v3.json')) {
    missingFiles.push('manifest-v3.json');
  }

  if (missingFiles.length > 0) {
    console.error('❌ Missing required files:');
    missingFiles.forEach(file => console.error(`  - ${file}`));
    return false;
  }

  console.log('✓ All required files present');
  return true;
}

/**
 * Display build summary
 */
function displaySummary(builds) {
  console.log('\n' + '='.repeat(60));
  console.log('✨ Build Complete!');
  console.log('='.repeat(60));
  console.log(`\nVersion: ${VERSION}`);
  console.log('\nBuilt packages:');
  builds.forEach(build => {
    console.log(`  ✓ ${path.basename(build)}`);
  });
  console.log('\n' + '='.repeat(60));
  console.log('\nNext steps:');
  console.log('  • Test the extensions locally before publishing');
  console.log('  • Firefox: Load from about:debugging');
  console.log('  • Chrome: Load from chrome://extensions');
  console.log('\nPublishing:');
  console.log('  • Firefox: https://addons.mozilla.org/developers/');
  console.log('  • Chrome: https://chrome.google.com/webstore/devconsole');
  console.log('  • Edge: https://partner.microsoft.com/dashboard');
  console.log('='.repeat(60) + '\n');
}

/**
 * Main build function
 */
async function main() {
  const args = process.argv.slice(2);
  const target = args[0] || 'all';

  console.log('🚀 Stream Sniper Build Script');
  console.log('='.repeat(60));

  // Validate files first
  if (!validateFiles()) {
    process.exit(1);
  }

  // Ensure build directory exists
  ensureBuildDir();

  const builds = [];

  try {
    if (target === 'all' || target === 'firefox') {
      const firefoxBuild = await buildFirefox();
      builds.push(firefoxBuild);
    }

    if (target === 'all' || target === 'chrome') {
      const chromeBuild = await buildChrome();
      builds.push(chromeBuild);
    }

    if (target === 'all' || target === 'source') {
      const sourceBuild = await buildSource();
      builds.push(sourceBuild);
    }

    if (target === 'all' || target === 'native') {
      const nativeBuild = await buildNativeMessaging();
      builds.push(nativeBuild);
    }

    if (target !== 'all' && target !== 'firefox' && target !== 'chrome' && target !== 'source' && target !== 'native') {
      console.error(`\n❌ Unknown target: ${target}`);
      console.error('Valid targets: all, firefox, chrome, source, native');
      process.exit(1);
    }

    displaySummary(builds);

  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Run the build
if (require.main === module) {
  main();
}

module.exports = { buildFirefox, buildChrome, buildSource, buildNativeMessaging };
