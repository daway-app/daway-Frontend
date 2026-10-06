# ==========================================================
#  dev.ps1 — تشغيل بيئة تطوير Daway كاملة بنقرة واحدة
# ==========================================================
#  يشغّل:
#    1. Laravel API   على http://127.0.0.1:8000  (daway-backend)
#    2. React (Vite)  على http://localhost:5173  (daway-web)
#  ثم يتحقق من صحّة الاثنين ويطبع بيانات الدخول.
#
#  الاستعمال (PowerShell):
#    cd C:\Users\MSI\daway-web
#    .\tools\dev.ps1
#
#  ملاحظات:
#   · البورت 5173 إلزامي — الـCORS في daway-backend يسمح localhost:5173
#     (ومع ذلك أُضيفت بقية البورتات المحلية إلى CORS_ALLOWED_ORIGINS في .env).
#   · السكربت يفتح نافذتين منفصلتين ولا يغلقهما: أغلقهما يدويًا لإيقاف البيئة.
#   · لا يعتمد على أي مكتبة خارجية — PowerShell + cmd فقط.
# ==========================================================

$webDir = Split-Path -Parent $PSScriptRoot          # ...\daway-web
$backendDir = Join-Path (Split-Path -Parent $webDir) 'daway-backend'

$apiPort = 8000
$webPort = 5173

function Say($text, $color) { Write-Host $text -ForegroundColor $color }

Say '' 'Cyan'; Say '=== Daway dev environment ===' 'Cyan'

# --- 0. تحقق من وجود المجلدين ---------------------------------------------
if (-not (Test-Path $webDir))     { Say "  daway-web غير موجود: $webDir" Red; exit 1 }
if (-not (Test-Path $backendDir)) { Say "  daway-backend غير موجود: $backendDir" Red; exit 1 }
Say "  web     : $webDir" Green
Say "  backend : $backendDir" Green

# --- 1. هل البورتات مشغولة؟ ------------------------------------------------
function Test-Port($port) {
  try {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop
    return ($conn | Measure-Object).Count -gt 0
  } catch {
    return $false
  }
}

$apiBusy = Test-Port $apiPort
$webBusy = Test-Port $webPort

if ($apiBusy) {
  Say "  [!] البورت $apiPort مشغول — Laravel يعمل أصلًا، لن أشغّله مجددًا." Yellow
} else {
  Say "  > تشغيل Laravel على $apiPort ..." Cyan
  # cmd /c start يفتح نافذة مستقلة تبقى مفتوحة.
  Start-Process -FilePath 'cmd.exe' -ArgumentList @(
    '/c', 'start', "Daway API ($apiPort)", 'cmd', '/k',
    "cd /d `"$backendDir`" && php artisan serve --host=127.0.0.1 --port=$apiPort"
  ) -WindowStyle Normal
}

if ($webBusy) {
  Say "  [!] البورت $webPort مشغول — Vite يعمل أصلًا، لن أشغّله مجددًا." Yellow
} else {
  Say "  > تشغيل React على $webPort ..." Cyan
  Start-Process -FilePath 'cmd.exe' -ArgumentList @(
    '/c', 'start', "Daway Web ($webPort)", 'cmd', '/k',
    "cd /d `"$webDir`" && npx vite --host 127.0.0.1 --port=$webPort --strictPort"
  ) -WindowStyle Normal
}

# --- 2. انتظار الصحة --------------------------------------------------------
Say ''
Say "  انتظار جاهزية السيرفرات (حتى 90 ثانية) ..." Cyan

function Wait-Http($url, $seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
    } catch { }
    Start-Sleep -Seconds 2
  }
  return $false
}

$apiUrl = "http://127.0.0.1:$apiPort/api/pharmacies"
$webUrl = "http://localhost:$webPort/"

if (Wait-Http $apiUrl 90) { Say "  [OK] API جاهز : $apiUrl" Green }
else { Say "  [!!] API لم يستجب — راجع نافذة Laravel." Red }

if (Wait-Http $webUrl 90) { Say "  [OK] Web جاهز : $webUrl" Green }
else { Say "  [!!] Web لم يستجب — راجع نافذة Vite." Red }

# --- 3. بيانات الدخول ------------------------------------------------------
Say ''
Say '=== بيانات الدخول (قاعدة البيانات الفعلية) ===' Cyan
Say '  Pharmacy ID : PH-1234    (صيدلية الأمل)' White
Say '  Password    : password'   White
Say '  ------------------------'  DarkGray
Say '  PH-5678 / password       (صيدلية الشفاء)' DarkGray
Say '  PH-MPQH / password       (صيدلية اليرموك)' DarkGray

Say ''
Say '=== افتح المتصفح على ===' Cyan
Say "  http://localhost:$webPort/login" Yellow
Say '  (استعمل localhost حرفيًا)' DarkGray

Say ''
Say 'لإيقاف البيئة: أغلق نافذتي Laravel و Vite.' Green
