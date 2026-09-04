# CI-only regression check: launches the packaged app and verifies, via the
# real Win32 API, that the overlay window is actually excluded from screen
# capture (WDA_EXCLUDEFROMCAPTURE). This is the exact OS mechanism the
# "invisible during screen share" feature depends on - if a future change
# accidentally drops setContentProtection(true) or breaks window creation,
# this fails the build instead of silently shipping a broken .exe.
#
# This does NOT (and cannot, from CI) verify that Microsoft Teams/Zoom/Meet
# actually honor the flag for every capture path they use (e.g. their
# share-picker preview thumbnails) - that still requires a real machine, a
# real screen share, and a second participant checking what they see.
#
# NOTE: this step currently runs with continue-on-error in the workflow
# while we harden it against CI-environment quirks (e.g. no GPU) that can
# differ from a real user's desktop - a failure here is a signal to
# investigate, not automatically proof the real feature is broken.

param(
  [Parameter(Mandatory = $true)][string]$ExePath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ExePath)) {
  throw "Executable not found: $ExePath"
}

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public class MeetingCopilotSelfTest {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll")]
    public static extern bool GetWindowDisplayAffinity(IntPtr hWnd, out uint pdwAffinity);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public static string[] GetTopLevelWindowTitles() {
        var titles = new List<string>();
        EnumWindows((hWnd, lParam) => {
            var sb = new StringBuilder(256);
            GetWindowText(hWnd, sb, sb.Capacity);
            var title = sb.ToString();
            if (!string.IsNullOrWhiteSpace(title)) {
                titles.Add(string.Format("\"{0}\" (visible={1})", title, IsWindowVisible(hWnd)));
            }
            return true;
        }, IntPtr.Zero);
        return titles.ToArray();
    }
}
"@

$WDA_EXCLUDEFROMCAPTURE = 0x11
$stdoutLog = Join-Path $env:RUNNER_TEMP 'meeting-copilot-stdout.log'
$stderrLog = Join-Path $env:RUNNER_TEMP 'meeting-copilot-stderr.log'
$proc = Start-Process -FilePath $ExePath -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

function Dump-Diagnostics {
  Write-Host "--- Top-level window titles at time of failure ---"
  foreach ($title in [MeetingCopilotSelfTest]::GetTopLevelWindowTitles()) {
    Write-Host "  $title"
  }
  Write-Host "--- App stdout ---"
  if (Test-Path $stdoutLog) { Get-Content $stdoutLog | Write-Host } else { Write-Host "  (no stdout captured)" }
  Write-Host "--- App stderr ---"
  if (Test-Path $stderrLog) { Get-Content $stderrLog | Write-Host } else { Write-Host "  (no stderr captured)" }
}

try {
  $hwnd = [IntPtr]::Zero
  $deadline = (Get-Date).AddSeconds(45)

  while ($hwnd -eq [IntPtr]::Zero -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    $hwnd = [MeetingCopilotSelfTest]::FindWindow($null, "Meeting Copilot")
    if ($proc.HasExited) {
      Dump-Diagnostics
      throw "App process exited early (code $($proc.ExitCode)) before the overlay window appeared."
    }
  }

  if ($hwnd -eq [IntPtr]::Zero) {
    Dump-Diagnostics
    throw "Could not find the 'Meeting Copilot' overlay window within 45s."
  }

  [uint32]$affinity = 0
  $ok = [MeetingCopilotSelfTest]::GetWindowDisplayAffinity($hwnd, [ref]$affinity)
  if (-not $ok) {
    throw "GetWindowDisplayAffinity() call itself failed (Win32 error $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error()))."
  }

  Write-Host "Overlay window display affinity: 0x$($affinity.ToString('X'))"

  if ($affinity -ne $WDA_EXCLUDEFROMCAPTURE) {
    throw "REGRESSION: overlay window is NOT excluded from screen capture (affinity=0x$($affinity.ToString('X')), expected 0x$($WDA_EXCLUDEFROMCAPTURE.ToString('X'))). The 'invisible during screen share' feature is broken."
  }

  Write-Host "PASS: overlay window is correctly excluded from screen capture (WDA_EXCLUDEFROMCAPTURE)."
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
