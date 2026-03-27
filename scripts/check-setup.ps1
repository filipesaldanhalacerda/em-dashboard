# check-setup.ps1
# Valida se o ambiente esta pronto para rodar o EM Dashboard
# Uso: .\scripts\check-setup.ps1
#
# Executa antes do primeiro run.ps1 para garantir que tudo esta configurado

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ScriptDir

$ok = $true

function Check {
    param([string]$Label, [bool]$Passou, [string]$Dica = "")
    if ($Passou) {
        Write-Host "  ✅ $Label" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $Label" -ForegroundColor Red
        if ($Dica) { Write-Host "     → $Dica" -ForegroundColor Yellow }
        $script:ok = $false
    }
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Check de Setup — EM Dashboard MetLife BR Life     " -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ── Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
$nodeOk = $null -ne $node
Check "Node.js instalado" $nodeOk "Instale em: https://nodejs.org  (versao 18+)"

if ($nodeOk) {
    $ver = (node --version).Trim()
    $major = [int]($ver -replace 'v(\d+)\..*','$1')
    Check "Node.js versao $ver (>=18)" ($major -ge 18) "Atualize o Node.js para 18+"
}

# ── Arquivos do projeto
Check "collect.js presente"           (Test-Path "collect.js")           "Arquivo ausente — verifique o projeto"
Check "generate-dashboard.js presente" (Test-Path "generate-dashboard.js") "Arquivo ausente"
Check "package.json presente"         (Test-Path "package.json")         "Arquivo ausente"

# ── .env
$envExiste = Test-Path ".env"
Check ".env criado" $envExiste "Execute: copy .env.example .env  e preencha os tokens"

if ($envExiste) {
    $envContent = Get-Content ".env" -Raw

    $azurePat = $envContent -match "AZURE_DEVOPS_PAT=(.+)" | Out-Null; $azurePat = $Matches[1]
    $githubPat = $envContent -match "GITHUB_PAT=(.+)"      | Out-Null; $githubPat = $Matches[1]

    $azureConfigurado = $envContent -match "AZURE_DEVOPS_PAT=(?!seu_azure)[^\s]+"
    $githubConfigurado = $envContent -match "GITHUB_PAT=(?!seu_github)[^\s]+"

    Check "AZURE_DEVOPS_PAT configurado no .env" $azureConfigurado "Preencha o PAT do Azure DevOps no .env"
    Check "GITHUB_PAT configurado no .env"       $githubConfigurado "Preencha o PAT do GitHub no .env"
}

# ── Conectividade Azure DevOps (apenas se PAT estiver configurado)
if ($envExiste -and $azureConfigurado) {
    Write-Host ""
    Write-Host "  Testando conectividade com Azure DevOps..." -ForegroundColor Gray

    # Carrega o PAT do .env
    $envLines = Get-Content ".env"
    $patLine  = $envLines | Where-Object { $_ -match "^AZURE_DEVOPS_PAT=(.+)" }
    $pat      = ($patLine -split "=", 2)[1].Trim()

    $b64  = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(":$pat"))
    $url  = "https://dev.azure.com/MetLife-Global/BR%20Life/_apis/git/repositories?api-version=7.1"

    try {
        $resp = Invoke-RestMethod -Uri $url -Headers @{ Authorization = "Basic $b64" } -ErrorAction Stop
        $repoCount = $resp.count
        Check "Conexao Azure DevOps OK ($repoCount repos visiveis)" $true
    } catch {
        $code = $_.Exception.Response?.StatusCode?.value__
        if ($code -eq 401) {
            Check "Conexao Azure DevOps" $false "PAT invalido ou expirado. Gere novo em: https://dev.azure.com/MetLife-Global/_usersSettings/tokens"
        } elseif ($code -eq 403) {
            Check "Conexao Azure DevOps" $false "PAT sem permissao para o projeto BR Life. Verifique os scopes."
        } else {
            Check "Conexao Azure DevOps" $false "Erro $code — verifique VPN/rede corporativa"
        }
    }
}

# ── Conectividade GitHub Copilot (apenas se PAT estiver configurado)
if ($envExiste -and $githubConfigurado) {
    Write-Host ""
    Write-Host "  Testando token do GitHub Copilot..." -ForegroundColor Gray

    $envLines  = Get-Content ".env"
    $patLine   = $envLines | Where-Object { $_ -match "^GITHUB_PAT=(.+)" }
    $githubPat = ($patLine -split "=", 2)[1].Trim()

    try {
        $resp = Invoke-RestMethod `
            -Uri "https://api.github.com/copilot_internal/v2/token" `
            -Headers @{ Authorization = "token $githubPat"; Accept = "application/json" } `
            -ErrorAction Stop

        $tokenOk = -not [string]::IsNullOrEmpty($resp.token)
        Check "GitHub Copilot Business ativo e acessivel" $tokenOk "Token vazio na resposta"
    } catch {
        $code = $_.Exception.Response?.StatusCode?.value__
        if ($code -eq 401) {
            Check "GitHub Copilot API" $false "GITHUB_PAT invalido. Gere novo com scope 'copilot' em: https://github.com/settings/tokens"
        } elseif ($code -eq 403) {
            Check "GitHub Copilot API" $false "Conta filipe-s-lacerda_met sem Copilot Business ativo na met-github"
        } else {
            Check "GitHub Copilot API" $false "Erro $code"
        }
    }
}

# ── Resultado final
Write-Host ""
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
if ($ok) {
    Write-Host "  ✅ Tudo pronto! Execute: .\run.ps1" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Corrija os itens acima antes de rodar o dashboard." -ForegroundColor Yellow
}
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
