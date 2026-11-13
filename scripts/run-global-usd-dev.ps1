param()
$Preflight=$false
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$info=[Diagnostics.ProcessStartInfo]::new()
$info.FileName='node';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WorkingDirectory=$root
$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
$info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false);$info.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
$info.EnvironmentVariables['GLOBAL_USD_DOCKER']=Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
foreach($name in @('NODE_DEBUG','NODE_OPTIONS','NODE_V8_COVERAGE')){[void]$info.EnvironmentVariables.Remove($name)}
$info.Arguments='"'+(Join-Path $PSScriptRoot 'run-global-usd-dev-login.mjs')+'"'+$(if($Preflight){' --preflight'}else{''})
$account=@{};$payload=$null;$process=$null;$form=$null;$password=$null
try{
 if(-not $Preflight){
  Add-Type -AssemblyName System.Windows.Forms
  $form=[Windows.Forms.Form]::new();$form.Text='GLOBAL_USD - Verificacion DEV';$form.Width=470;$form.Height=260;$form.StartPosition='CenterScreen';$form.TopMost=$true
  $notice=[Windows.Forms.Label]::new();$notice.Text='Cuenta DEV autorizada. Entrada local oculta, sin guardar credenciales.';$notice.Left=15;$notice.Top=15;$notice.Width=425;$notice.Height=40;$form.Controls.Add($notice)
  $userLabel=[Windows.Forms.Label]::new();$userLabel.Text='Usuario';$userLabel.Left=15;$userLabel.Top=65;$form.Controls.Add($userLabel)
  $username=[Windows.Forms.TextBox]::new();$username.Left=130;$username.Top=62;$username.Width=285;$form.Controls.Add($username)
  $passwordLabel=[Windows.Forms.Label]::new();$passwordLabel.Text='Contrasena';$passwordLabel.Left=15;$passwordLabel.Top=105;$form.Controls.Add($passwordLabel)
  $password=[Windows.Forms.TextBox]::new();$password.Left=130;$password.Top=102;$password.Width=285;$password.UseSystemPasswordChar=$true;$form.Controls.Add($password)
  $ok=[Windows.Forms.Button]::new();$ok.Text='Validar DEV';$ok.Left=225;$ok.Top=155;$ok.Width=100;$ok.DialogResult=[Windows.Forms.DialogResult]::OK;$form.Controls.Add($ok);$form.AcceptButton=$ok
  $cancel=[Windows.Forms.Button]::new();$cancel.Text='Cancelar';$cancel.Left=335;$cancel.Top=155;$cancel.DialogResult=[Windows.Forms.DialogResult]::Cancel;$form.Controls.Add($cancel);$form.CancelButton=$cancel
  if($form.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){Write-Output 'GLOBAL_USD_CREDENTIAL_INPUT_CANCELLED';exit 2}
  $account.username=$username.Text;$account.password=$password.Text;$password.Clear();$username.Clear()
  $payload=@{authorized=$account}|ConvertTo-Json -Compress
  $payload=[regex]::Replace($payload,'[^\x00-\x7F]',{param($m) '\u'+([int][char]$m.Value).ToString('x4')})
 }
 $process=[Diagnostics.Process]::new();$process.StartInfo=$info;[void]$process.Start()
 $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
 if($payload){$process.StandardInput.Write($payload)};$process.StandardInput.Close();$payload=$null;$account.Clear()
 $process.WaitForExit();$result=$stdout.GetAwaiter().GetResult()|ConvertFrom-Json;[void]$stderr.GetAwaiter().GetResult()
 if($result.success){Write-Output 'GLOBAL_USD_PRESENTATION_5400_PASS'}else{Write-Output 'GLOBAL_USD_PRESENTATION_5400_FAILED - reporte sanitizado en logs'}
}catch{Write-Output 'GLOBAL_USD_PROTECTED_HELPER_FAILED'}
finally{$payload=$null;$account.Clear();if($password){$password.Clear()};if($form){$form.Dispose()};if($process){$process.Dispose()}}
