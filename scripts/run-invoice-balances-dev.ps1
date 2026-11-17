param([switch]$Preflight,[switch]$SourcePreflight,[switch]$Remaining)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
if($SourcePreflight){
 & node (Join-Path $PSScriptRoot 'run-invoice-balances-dev-login.mjs') --source-preflight
 exit $LASTEXITCODE
}
$docker=Get-Command docker -ErrorAction SilentlyContinue
if($docker){$dockerPath=$docker.Source}else{$dockerPath=Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'}
if(-not (Test-Path -LiteralPath $dockerPath)){throw 'Docker Desktop no encontrado.'}
$info=[Diagnostics.ProcessStartInfo]::new()
$info.FileName='node';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WorkingDirectory=$root
$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
$info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
$info.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
$info.EnvironmentVariables['INVOICE_BALANCES_DOCKER']=$dockerPath
foreach($name in @('NODE_DEBUG','NODE_OPTIONS','NODE_V8_COVERAGE')){[void]$info.EnvironmentVariables.Remove($name)}
$scriptPath=Join-Path $PSScriptRoot 'run-invoice-balances-dev-login.mjs'
function Invoke-Control($mode,$payload){
 $info.Arguments='"'+$scriptPath+'" '+$mode
 $process=[Diagnostics.Process]::new();$process.StartInfo=$info
 try{
  [void]$process.Start();$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
  if($payload){$process.StandardInput.Write($payload)};$process.StandardInput.Close()
  $process.WaitForExit();$result=$stdout.GetAwaiter().GetResult()|ConvertFrom-Json;[void]$stderr.GetAwaiter().GetResult()
  return $result
 }finally{$process.Dispose()}
}
$result=Invoke-Control '--preflight' $null
if(-not $result.success){Write-Output 'INVOICE_BALANCES_DEV_PREFLIGHT_FAILED: revisar logs/invoice-balances-dev-preflight.json';exit 1}
if($Preflight){Write-Output 'INVOICE_BALANCES_DEV_PREFLIGHT_PASS';exit 0}
$account=@{};$payload=$null
try{
 foreach($field in @('username','password')){
  $secret=Read-Host "Usuario DEV autorizado para saldos - $field (entrada oculta)" -AsSecureString
  try{$account[$field]=[PSCredential]::new('dev',$secret).GetNetworkCredential().Password}finally{$secret.Dispose()}
 }
 $payload=@{authorized=$account}|ConvertTo-Json -Compress
 $payload=[regex]::Replace($payload,'[^\x00-\x7F]',{param($m) '\u'+([int][char]$m.Value).ToString('x4')})
 $runMode=if($Remaining){'--run --remaining'}else{'--run'}
 $result=Invoke-Control $runMode $payload
 if($result.success){Write-Output 'INVOICE_BALANCES_DEV_ORACLE_PASS'}else{Write-Output 'INVOICE_BALANCES_DEV_REAL_FAILED: revisar logs/invoice-balances-dev-real.json';exit 1}
}finally{$payload=$null;$account.Clear()}
