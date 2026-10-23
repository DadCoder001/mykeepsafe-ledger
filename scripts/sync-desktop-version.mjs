import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkgPath = path.join(root, 'package.json');
const tauriPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const cargoPath = path.join(root, 'src-tauri', 'Cargo.toml');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const targetVersion = pkg.version;

if (!targetVersion) {
  throw new Error('package.json version is missing.');
}

const tauri = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
const previousTauriVersion = tauri.version;
tauri.version = targetVersion;
fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n', 'utf8');

const cargoToml = fs.readFileSync(cargoPath, 'utf8');
const updatedCargoToml = cargoToml.replace(
  /^version\s*=\s*"[^"]+"/m,
  `version = "${targetVersion}"`
);

if (updatedCargoToml === cargoToml) {
  throw new Error('Could not update version in src-tauri/Cargo.toml.');
}

fs.writeFileSync(cargoPath, updatedCargoToml, 'utf8');

console.log(`Synced desktop version to ${targetVersion}`);
console.log(`- tauri.conf.json: ${previousTauriVersion} -> ${targetVersion}`);
console.log('- Cargo.toml: version updated');
