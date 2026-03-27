# get-copilot-token.ps1
# Obtém token temporário do GitHub Copilot Business (válido 30 minutos)
# Uso: .\scripts\get-copilot-token.ps1 -GitHubPat "ghp_seutoken..."
#
# Pré-requisito: conta filipe-s-lacerda_met com GitHub Copilot Business ativo (met-github)
# Como gerar o PAT: https://github.com/settings/tokens → Classic → scope: copilot

param(
    [Parameter(Mandatory = $true, HelpMessage = "PAT do GitHub com scope 'copilot'")]
    [string]$GitHubPat,

    [Parameter(Mandatory = $false, HelpMessage = "Salva o token como variável de ambiente local (não recomendado em prod)")]
    [switch]$SalvarEnv
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  GitHub Copilot Business — Gerador de Token Temporario    " -ForegroundColor Cyan
Write-Host "  Conta: filipe-s-lacerda_met | Org: met-github             " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Valida formato básico do PAT
if (-not $GitHubPat.StartsWith("ghp_") -and -not $GitHubPat.StartsWith("github_pat_")) {
    Write-Warning "O PAT fornecido não começa com 'ghp_' ou 'github_pat_'. Verifique se é um PAT clássico válido."
    Write-Host "  Gere em: https://github.com/settings/tokens → 'Generate new token (classic)'" -ForegroundColor Yellow
    Write-Host "  Scope necessário: copilot" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Chamando: GET https://api.github.com/copilot_internal/v2/token" -ForegroundColor Gray

try {
    $headers = @{
        "Authorization" = "token $GitHubPat"
        "Accept"        = "application/json"
        "User-Agent"    = "MetLife-BR-Life-EM-Dashboard/1.0"
    }

    $resposta = Invoke-RestMethod `
        -Uri "https://api.github.com/copilot_internal/v2/token" `
        -Method GET `
        -Headers $headers `
        -ErrorAction Stop

    $token = $resposta.token

    if ([string]::IsNullOrEmpty($token)) {
        Write-Error "Token vazio na resposta. Verifique se a conta tem Copilot Business ativo na organização met-github."
        exit 1
    }

    # Calcula a expiração (30 minutos)
    $expiracao = (Get-Date).AddMinutes(30).ToString("HH:mm:ss")

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "  Token obtido com sucesso!                                 " -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Token (copie abaixo):" -ForegroundColor White
    Write-Host ""
    Write-Host $token -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Valido ate: $expiracao (30 minutos a partir de agora)" -ForegroundColor Gray
    Write-Host ""

    # Instruções para configurar no Azure DevOps
    Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host "  Como salvar no Azure DevOps Library:" -ForegroundColor Cyan
    Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  1. Acesse: https://dev.azure.com/MetLife-Global/BR%20Life/_library" -ForegroundColor White
    Write-Host "  2. Variable Groups → 'copilot-review'" -ForegroundColor White
    Write-Host "  3. Variavel: GITHUB_PAT (nao o token temporario — o PAT original)" -ForegroundColor White
    Write-Host "  4. Marque como SECRET (cadeado)" -ForegroundColor White
    Write-Host ""
    Write-Host "  IMPORTANTE: Salve o GITHUB PAT original (ghp_...) no Library," -ForegroundColor Yellow
    Write-Host "  nao este token temporario. O pipeline busca o token automaticamente." -ForegroundColor Yellow
    Write-Host ""

    # Opcionalmente salva como variável de ambiente da sessão atual
    if ($SalvarEnv) {
        $env:GITHUB_COPILOT_TOKEN = $token
        Write-Host "Token salvo como variavel de sessao: `$env:GITHUB_COPILOT_TOKEN" -ForegroundColor Green
        Write-Host "(Valido apenas nesta sessao PowerShell)" -ForegroundColor Gray
    }

    # Testa o token chamando o Copilot API com um prompt simples
    Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host "  Testando token com chamada real ao Copilot API..." -ForegroundColor Cyan
    Write-Host "------------------------------------------------------------" -ForegroundColor Cyan

    $testeHeaders = @{
        "Authorization"          = "Bearer $token"
        "Content-Type"           = "application/json"
        "Copilot-Integration-Id" = "vscode-chat"
        "Editor-Version"         = "vscode/1.85.0"
        "Editor-Plugin-Version"  = "copilot-chat/0.12.0"
    }

    $testeBody = @{
        model    = "gpt-4o"
        messages = @(
            @{
                role    = "user"
                content = "Responda apenas: OK"
            }
        )
        max_tokens  = 5
        temperature = 0
    } | ConvertTo-Json -Depth 5

    try {
        $testeResposta = Invoke-RestMethod `
            -Uri "https://api.githubcopilot.com/chat/completions" `
            -Method POST `
            -Headers $testeHeaders `
            -Body $testeBody `
            -ErrorAction Stop

        $respostaTexto = $testeResposta.choices[0].message.content
        Write-Host ""
        Write-Host "  Copilot API respondeu: $respostaTexto" -ForegroundColor Green
        Write-Host "  Token validado! O pipeline esta pronto para uso." -ForegroundColor Green
    }
    catch {
        Write-Host ""
        Write-Warning "Teste do Copilot API falhou: $($_.Exception.Message)"
        Write-Host "  O token pode ainda ser valido — verifique manualmente." -ForegroundColor Yellow
    }

    Write-Host ""

    return $token
}
catch {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host "  ERRO ao obter token do Copilot                           " -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host ""

    $statusCode = $_.Exception.Response?.StatusCode?.value__

    switch ($statusCode) {
        401 {
            Write-Host "  HTTP 401 — PAT invalido ou sem permissao." -ForegroundColor Red
            Write-Host "  Verifique:" -ForegroundColor Yellow
            Write-Host "    1. O PAT pertence a conta filipe-s-lacerda_met" -ForegroundColor Yellow
            Write-Host "    2. O PAT tem o scope 'copilot'" -ForegroundColor Yellow
            Write-Host "    3. O PAT nao expirou" -ForegroundColor Yellow
            Write-Host "    4. A conta tem Copilot Business ativo em met-github" -ForegroundColor Yellow
        }
        403 {
            Write-Host "  HTTP 403 — Acesso negado." -ForegroundColor Red
            Write-Host "  A conta filipe-s-lacerda_met nao tem Copilot Business ativo," -ForegroundColor Yellow
            Write-Host "  ou o administrador da met-github nao habilitou esta conta." -ForegroundColor Yellow
        }
        default {
            Write-Host "  Erro: $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    Write-Host ""
    Write-Host "  Como gerar novo PAT: https://github.com/settings/tokens" -ForegroundColor Cyan
    Write-Host "  Scope necessario: copilot" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}
