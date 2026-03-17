#!/usr/bin/env node
// Launcher: copies src into electron's resources/app, then launches electron
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectDir = __dirname;
const electronDist = path.join(projectDir, 'node_modules', 'electron', 'dist');
const electronBin = path.join(electronDist, 'electron.exe');
const appDir = path.join(electronDist, 'resources', 'app');

console.log('미궁 연금술사 알파 시작 중...');

// Sync src files to resources/app
function syncFiles() {
  if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true });
  fs.mkdirSync(appDir, { recursive: true });
  // Copy package.json
  fs.copyFileSync(path.join(projectDir, 'package.json'), path.join(appDir, 'package.json'));
  // Copy src recursively
  copyDirSync(path.join(projectDir, 'src'), path.join(appDir, 'src'));
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

syncFiles();
console.log('파일 동기화 완료. Electron 시작...');

// Don't pass Node args to electron.exe
const child = spawn(electronBin, [], {
  stdio: 'inherit',
  cwd: projectDir,
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
});

child.on('error', (err) => {
  console.error('Electron 실행 실패:', err.message);
  process.exit(1);
});
child.on('close', (code) => process.exit(code || 0));
