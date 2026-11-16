# Envia as alteracoes para o GitHub. O Vercel faz o deploy sozinho depois.
# Uso: .\publicar.ps1 "mensagem do que mudou"
param([string]$Mensagem = "Atualizacao do amigo secreto")

Set-Location -Path $PSScriptRoot
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "Nada novo para publicar."
    exit 0
}
git commit -m $Mensagem
git push
Write-Host "Pronto. O Vercel deve publicar em alguns minutos."
