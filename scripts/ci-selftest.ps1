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

param(
  [Parameter(Mandatory = $true)][string]$ExePath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ExePath)) {
  throw "Executable not found: $ExePath"
}

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MeetingCopilotSelfTest {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll")]
    public static extern bool GetWindowDisplayAffinity(IntPtr hWnd, out uint pdwAffinity);
}
"@

$WDA_EXCLUDEFROMCAPTURE = 0x11
$proc = Start-Process -FilePath $ExePath -PassThru

try {
  $hwnd = [IntPtr]::Zero
  $deadline = (Get-Date).AddSeconds(45)

  while ($hwnd -eq [IntPtr]::Zero -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    $hwnd = [MeetingCopilotSelfTest]::FindWindow($null, "Meeting Copilot")
    if ($proc.HasExited) {
      throw "App process exited early (code $($proc.ExitCode)) before the overlay window appeared."
    }
  }

  if ($hwnd -eq [IntPtr]::Zero) {
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
