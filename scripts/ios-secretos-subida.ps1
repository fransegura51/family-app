# Guarda en GitHub los dos secretos con los que el flujo «iOS TestFlight» sube la app a TestFlight con el Apple ID del titular (Paco):
#   APPLE_ID            Correo del Apple ID de Paco (el de la cuenta de Apple Developer).
#   APPLE_APP_PASSWORD  Contraseña específica de aplicación (se crea en account.apple.com; NO es la contraseña del Apple ID).
# SE EJECUTA EN TU PROPIO ORDENADOR, no en el chat. La contraseña se escribe sin que se vea en pantalla y nunca se guarda en ningún archivo.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts/ios-secretos-subida.ps1
$repo = 'fransegura51/family-app'
gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'Primero inicia sesión en GitHub: gh auth login'; exit 1 }

function Guardar([string]$nombre, [string]$valor) {
  if ([string]::IsNullOrWhiteSpace($valor)) { Write-Host "  (omitido: $nombre)"; return }
  $valor.Trim() | gh secret set $nombre --repo $repo
  if ($LASTEXITCODE -eq 0) { Write-Host "  guardado: $nombre" } else { Write-Host "  ERROR guardando $nombre" }
}

Write-Host ''
Write-Host '1) Correo del Apple ID de Paco'
Guardar 'APPLE_ID' (Read-Host 'APPLE_ID (Intro para omitir)')
Write-Host ''
Write-Host '2) Contraseña de aplicación (formato xxxx-xxxx-xxxx-xxxx). No se verá mientras escribes o pegas.'
$segura = Read-Host 'APPLE_APP_PASSWORD (Intro para omitir)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
try { $plana = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
Guardar 'APPLE_APP_PASSWORD' $plana
$plana = $null
Write-Host ''
Write-Host 'Secretos que existen ahora en GitHub (solo nombres):'
gh secret list --repo $repo
