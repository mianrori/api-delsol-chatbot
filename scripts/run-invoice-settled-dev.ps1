$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$info=[Diagnostics.ProcessStartInfo]::new()
$info.FileName='node';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WorkingDirectory=$root
$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
$info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
$info.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
$info.EnvironmentVariables['INVOICE_SETTLED_DOCKER']=Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
foreach($name in @('NODE_DEBUG','NODE_OPTIONS','NODE_V8_COVERAGE')){[void]$info.EnvironmentVariables.Remove($name)}
$info.Arguments='"'+(Join-Path $PSScriptRoot 'run-invoice-settled-dev-login.mjs')+'"'
$account=@{};$payload=$null;$process=$null
try{
 Write-Host 'Validacion de facturas con deuda cancelada - ERP DEV. Sin despliegue.'
 foreach($field in @('username','password')){
  $secret=Read-Host "Usuario afectado DEV - $field (entrada oculta)" -AsSecureString
  try{$account[$field]=[PSCredential]::new('dev',$secret).GetNetworkCredential().Password}finally{$secret.Dispose()}
 }
 $payload=@{authorized=$account}|ConvertTo-Json -Compress
 $process=[Diagnostics.Process]::new();$process.StartInfo=$info;[void]$process.Start()
 $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
 $process.StandardInput.Write($payload);$process.StandardInput.Close();$payload=$null;$account.Clear()
 Write-Host 'Validando por HTTP y Oracle; espera el resultado...'
 $process.WaitForExit();$result=$stdout.GetAwaiter().GetResult()|ConvertFrom-Json;[void]$stderr.GetAwaiter().GetResult()
 if($result.success){Write-Host 'INVOICE_SETTLED_DEV_PASS'}else{Write-Host 'INVOICE_SETTLED_DEV_FAILED - revisar reporte sanitizado en logs.'}
}finally{$payload=$null;$account.Clear();if($process){$process.Dispose()}}
Read-Host 'Pulsa Enter para cerrar'
