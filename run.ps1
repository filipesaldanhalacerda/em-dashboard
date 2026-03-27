# run.ps1
# Automação Windows para o EM Dashboard — Cotador Individual | MetLife BR Life
#
# Uso: .\run.ps1
#
# Para agendar execucao automatica a cada hora no Windows Task Scheduler:
#   schtasks /create /tn "EM Dashboard MetLife" /tr "powershell -NonInteractive -File C:\em-dashboard\run.ps1" /sc hourly /f
#
# Para remover o agendamento:
#   schtasks /delete /tn "EM Dashboard MetLife" /f

param(
    [switch]$SemAbrir    # Se passar -SemAbrir, nao abre o browser automaticamente
)

$ErrorActionPreference = "Continue"

# Diretorio do script (funciona mesmo se chamado de outro diretorio)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Funcao para escrever no terminal com cor
function Escrever {
    param([string]$Texto, [string]$Cor = "White")
    Write-Host $Texto -ForegroundColor $Cor
}

function EscreverLinha {
    Write-Host ("─" * 60) -ForegroundColor DarkGray
}

# ─── Cabecalho ────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  📊 EM Dashboard — Cotador Individual · MetLife BR Life  ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Escrever "   $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')" -Cor Gray
Write-Host ""

# ─── Passo 1: Verifica Node.js ────────────────────────────────────────────────

EscreverLinha
Escrever "1/3  Verificando Node.js..." -Cor White

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue

if ($null -eq $nodeCmd) {
    Write-Host ""
    Escrever "  ❌ Node.js nao encontrado!" -Cor Red
    Write-Host ""
    Escrever "  Para instalar o Node.js:" -Cor Yellow
    Escrever "    1. Acesse: https://nodejs.org/en/download" -Cor Yellow
    Escrever "    2. Baixe a versao LTS (18+ requerido)" -Cor Yellow
    Escrever "    3. Execute o instalador e reinicie este terminal" -Cor Yellow
    Write-Host ""
    Escrever "  Ou via winget (Windows 10+):" -Cor Yellow
    Escrever "    winget install OpenJS.NodeJS.LTS" -Cor Cyan
    Write-Host ""
    exit 1
}

$nodeVersion = (node --version 2>&1).ToString().Trim()
$nodeMajor   = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')

if ($nodeMajor -lt 18) {
    Escrever "  ⚠️  Node.js $nodeVersion encontrado, mas versao 18+ e necessaria." -Cor Yellow
    Escrever "     Atualize em: https://nodejs.org/en/download" -Cor Yellow
    Write-Host ""
    exit 1
}

Escrever "  ✅ Node.js $nodeVersion" -Cor Green

# Verifica se o .env existe
if (-not (Test-Path ".env")) {
    Write-Host ""
    Escrever "  ⚠️  Arquivo .env nao encontrado!" -Cor Yellow
    Escrever "     Copie o .env.example e preencha com seus tokens:" -Cor Yellow
    Escrever "     copy .env.example .env" -Cor Cyan
    Escrever "     notepad .env" -Cor Cyan
    Write-Host ""
    exit 1
}

# Verifica se o AZURE_DEVOPS_PAT esta no .env
$envContent = Get-Content ".env" -Raw
if ($envContent -notmatch "AZURE_DEVOPS_PAT=.+") {
    Escrever "  ⚠️  AZURE_DEVOPS_PAT nao configurado no .env" -Cor Yellow
    exit 1
}

Escrever "  ✅ Configuracao .env encontrada" -Cor Green

# ─── Passo 2: Coleta dados do Azure DevOps ───────────────────────────────────

Write-Host ""
EscreverLinha
Escrever "2/3  Coletando dados do Azure DevOps..." -Cor White
Write-Host ""

$inicioColeta = Get-Date
$outputColeta = node collect.js 2>&1
$exitColeta   = $LASTEXITCODE

# Exibe a saida do script de coleta
$outputColeta | ForEach-Object { Escrever "  $_" -Cor Gray }

if ($exitColeta -ne 0) {
    Write-Host ""
    Escrever "  ❌ Falha na coleta de dados (exit code: $exitColeta)" -Cor Red
    Write-Host ""
    Escrever "  Possiveis causas:" -Cor Yellow
    Escrever "    • AZURE_DEVOPS_PAT expirado ou invalido" -Cor Yellow
    Escrever "    • Sem acesso ao projeto BR Life no Azure DevOps" -Cor Yellow
    Escrever "    • Sem conexao com a internet ou VPN desconectada" -Cor Yellow
    Write-Host ""
    Escrever "  Gere novo PAT em:" -Cor Cyan
    Escrever "    https://dev.azure.com/MetLife-Global/_usersSettings/tokens" -Cor Cyan
    Write-Host ""
    exit 1
}

$duracaoColeta = [math]::Round(((Get-Date) - $inicioColeta).TotalSeconds, 1)
Escrever "  ✅ Coleta concluida em ${duracaoColeta}s" -Cor Green

# ─── Passo 3: Gera o dashboard HTML ──────────────────────────────────────────

Write-Host ""
EscreverLinha
Escrever "3/3  Gerando dashboard HTML..." -Cor White
Write-Host ""

$outputDash = node generate-dashboard.js 2>&1
$exitDash   = $LASTEXITCODE

$outputDash | ForEach-Object { Escrever "  $_" -Cor Gray }

if ($exitDash -ne 0) {
    Write-Host ""
    Escrever "  ❌ Falha na geracao do dashboard (exit code: $exitDash)" -Cor Red
    exit 1
}

Escrever "  ✅ Dashboard gerado" -Cor Green

# ─── Resumo final ─────────────────────────────────────────────────────────────

Write-Host ""
EscreverLinha

# Le o JSON para montar o resumo colorido
$dashboardPath = "data\dashboard-data.json"
if (Test-Path $dashboardPath) {
    try {
        $dados   = Get-Content $dashboardPath | ConvertFrom-Json
        $resumo  = $dados.resumo

        Write-Host ""
        Escrever "  📊 Resumo do time Cotador Individual:" -Cor White
        Write-Host ""

        # PRs abertas
        $corPRs = if ($resumo.prsAbertas -gt 5) { "Yellow" } else { "Green" }
        Escrever ("  ✅ PRs abertas:         " + $resumo.prsAbertas + " (" + $resumo.prsBloqueadas + " bloqueadas)") -Cor $corPRs

        # Pipelines falhando
        $corPipes = if ($resumo.pipelinesFalhando -gt 0) { "Red" } else { "Green" }
        $iconePipes = if ($resumo.pipelinesFalhando -gt 0) { "⚠️" } else { "✅" }
        Escrever ("  $iconePipes Pipelines falhando:  " + $resumo.pipelinesFalhando) -Cor $corPipes

        # Work items parados
        $corParados = if ($resumo.workItemsParados -gt 0) { "Red" } else { "Green" }
        $iconeParados = if ($resumo.workItemsParados -gt 0) { "🔴" } else { "✅" }
        Escrever ("  $iconeParados Itens parados (3d+): " + $resumo.workItemsParados) -Cor $corParados

        # Work items sem dono
        $corSemDono = if ($resumo.workItemsSemDono -gt 0) { "Yellow" } else { "Green" }
        Escrever ("  👤 Itens sem dono:      " + $resumo.workItemsSemDono) -Cor $corSemDono

        # Avg review time
        $horas = $resumo.avgReviewTimeHoras
        $tempoTexto = if ($horas -ge 24) { "$([math]::Floor($horas/24))d $($horas % 24)h" } else { "${horas}h" }
        $corTempo = if ($horas -gt 48) { "Yellow" } else { "Green" }
        Escrever ("  ⏱  Avg review time:     $tempoTexto") -Cor $corTempo

        Write-Host ""
    }
    catch {
        Escrever "  (Nao foi possivel ler o resumo do JSON)" -Cor Gray
    }
}

# Abre o browser
$indexPath = Join-Path $ScriptDir "index.html"

if (-not $SemAbrir) {
    EscreverLinha
    Escrever "  Abrindo dashboard no browser..." -Cor Cyan
    Start-Process $indexPath
}

Write-Host ""
Escrever "  📁 Dashboard: $indexPath" -Cor Gray
Escrever "  📁 Dados:     $(Join-Path $ScriptDir 'data\dashboard-data.json')" -Cor Gray
Write-Host ""
EscreverLinha
Write-Host ""
