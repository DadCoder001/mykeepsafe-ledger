param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('dev', 'build')]
  [string]$Mode,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExtraArgs
)

$ErrorActionPreference = 'Stop'

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path $vswhere)) {
  Write-Error 'vswhere.exe not found. Install Visual Studio Build Tools 2022.'
}

$installationPath = & $vswhere -latest -products * -property installationPath
if (-not $installationPath) {
  $fallbackPath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\\2022\\BuildTools'
  if (Test-Path $fallbackPath) {
    $installationPath = $fallbackPath
  } else {
    Write-Error 'No Visual Studio Build Tools instance was found.'
  }
}

$vsDevCmd = Join-Path $installationPath 'Common7\Tools\VsDevCmd.bat'
if (-not (Test-Path $vsDevCmd)) {
  Write-Error "VsDevCmd.bat not found at $vsDevCmd"
}

$originalPath = $env:Path

# Ensure VS Installer dir is on PATH so VsDevCmd.bat can call vswhere.exe internally
$vsInstallerDir = Split-Path $vswhere -Parent
$env:Path = "$vsInstallerDir;$env:Path"

$envDump = & cmd.exe /c "`"$vsDevCmd`" -arch=x64 -host_arch=x64 >nul && set"
foreach ($line in $envDump) {
  if ($line -match '^(.*?)=(.*)$') {
    Set-Item -Path ("Env:{0}" -f $matches[1]) -Value $matches[2]
  }
}

# VsDevCmd.bat already prepends MSVC paths to the full original PATH.
# Putting $originalPath here again would shadow MSVC link.exe with Git's link.exe.
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

# Safety net: explicitly prepend the MSVC x64 tools so link.exe resolves correctly
# even if VsDevCmd.bat failed to inject PATH for any reason.
$msvcToolsRoot = Join-Path $installationPath 'VC\Tools\MSVC'
if (Test-Path $msvcToolsRoot) {
  $msvcVer = Get-ChildItem $msvcToolsRoot | Sort-Object Name | Select-Object -Last 1
  if ($msvcVer) {
    $msvcBin = Join-Path $msvcVer.FullName 'bin\Hostx64\x64'
    if (Test-Path $msvcBin) {
      $env:Path = "$msvcBin;$env:Path"
    }
  }
}

# Set LIBCLANG_PATH so bindgen (used by llama-cpp-sys-2) can find libclang.dll.
# Check VS-bundled LLVM first, then a standalone LLVM install.
if (-not $env:LIBCLANG_PATH) {
  $candidateDirs = @(
    (Join-Path $installationPath 'VC\Tools\Llvm\x64\bin'),
    (Join-Path $installationPath 'VC\Tools\Llvm\bin'),
    'C:\Program Files\LLVM\bin',
    'C:\Program Files (x86)\LLVM\bin'
  )
  foreach ($dir in $candidateDirs) {
    if (Test-Path (Join-Path $dir 'libclang.dll')) {
      $env:LIBCLANG_PATH = $dir
      Write-Host "LIBCLANG_PATH set to: $dir"
      break
    }
  }
  if (-not $env:LIBCLANG_PATH) {
    Write-Warning @"
libclang.dll not found. The build may fail on llama-cpp-sys-2.
Fix: in Visual Studio Installer, add the individual component:
  "C++ Clang Compiler for Windows" (Microsoft.VisualStudio.ComponentGroup.NativeDesktop.Llvm.Clang)
Or install LLVM from https://releases.llvm.org/ and set LIBCLANG_PATH manually.
"@
  }
}

$tauriArgs = @($Mode)
if ($ExtraArgs) {
  $tauriArgs += $ExtraArgs
}

$tauriCli = Join-Path $PSScriptRoot '..\node_modules\.bin\tauri.cmd'
if (-not (Test-Path $tauriCli)) {
  Write-Error "Tauri CLI not found at $tauriCli. Run npm install first."
}

& $tauriCli @tauriArgs
exit $LASTEXITCODE
