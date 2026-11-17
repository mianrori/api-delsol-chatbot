param([switch]$Preflight)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$info=[Diagnostics.ProcessStartInfo]::new()
$info.FileName='node';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WorkingDirectory=$root
$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
$info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false);$info.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
$info.EnvironmentVariables['INVOICE_PENDING_DOCKER']=Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
foreach($name in @('NODE_DEBUG','NODE_OPTIONS','NODE_V8_COVERAGE')){[void]$info.EnvironmentVariables.Remove($name)}
$info.Arguments='"'+(Join-Path $PSScriptRoot 'run-invoice-pending-live-login.mjs')+'"'+$(if($Preflight){' --preflight'}else{''})
$account=@{};$payload=$null;$process=$null
try{
 Write-Host 'PR52 desplegada - control de solo lectura en 5400, sin proveedor.'
 if(-not $Preflight){
  foreach($field in @('username','password')){
   $secret=Read-Host "Usuario DEV autorizado - $field (entrada oculta)" -AsSecureString
   try{$account[$field]=[PSCredential]::new('dev',$secret).GetNetworkCredential().Password}finally{$secret.Dispose()}
  }
  $payload=@{authorized=$account}|ConvertTo-Json -Compress
  $payload=[regex]::Replace($payload,'[^\x00-\x7F]',{param($m) '\u'+([int][char]$m.Value).ToString('x4')})
 }
 $process=[Diagnostics.Process]::new();$process.StartInfo=$info;[void]$process.Start()
 $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
 if($payload){$process.StandardInput.Write($payload)};$process.StandardInput.Close();$payload=$null;$account.Clear()
 Write-Host 'Comprobando fuente desplegada, HTTP y Oracle...'
 $process.WaitForExit();$result=$stdout.GetAwaiter().GetResult()|ConvertFrom-Json;[void]$stderr.GetAwaiter().GetResult()
 if($result.success){Write-Host 'INVOICE_PENDING_5400_PASS'}else{Write-Host 'INVOICE_PENDING_5400_FAILED - revisar reporte sanitizado en logs.'}
}finally{$payload=$null;$account.Clear();if($process){$process.Dispose()}}
if(-not $Preflight){Read-Host 'Pulsa Enter para cerrar'}
