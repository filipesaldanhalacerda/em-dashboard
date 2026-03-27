# 📊 Engineering Manager Dashboard
**MetLife BR Life · Time Cotador Individual**

Dashboard local para acompanhamento de saúde de engenharia: PRs, pipelines, work items e velocidade do time — integrado ao Azure DevOps e GitHub Copilot Business.

---

## Pré-requisitos

| Requisito | Versão | Link |
|-----------|--------|------|
| Node.js | 18+ | [nodejs.org](https://nodejs.org/en/download) |
| Acesso Azure DevOps | — | [dev.azure.com/MetLife-Global](https://dev.azure.com/MetLife-Global) |
| Conta GitHub | filipe-s-lacerda_met | [github.com/settings/tokens](https://github.com/settings/tokens) |
| Copilot Business | met-github | Gerenciado pela MetLife |

---

## 1. Configuração inicial

### 1a. Clone ou copie os arquivos

```
em-dashboard/
├── collect.js                          ← coleta Azure DevOps
├── generate-dashboard.js               ← gera HTML
├── index.html                          ← dashboard (sobrescrito pelo generate)
├── azure-pipelines-copilot-review.yml  ← pipeline de revisão automática
├── .github/copilot-instructions.md     ← instruções do Copilot para o repo
├── scripts/get-copilot-token.ps1       ← helper para obter token Copilot
├── run.ps1                             ← automação Windows
├── package.json
├── .env.example
└── data/
    └── dashboard-data.json             ← gerado pelo collect.js
```

### 1b. Crie o arquivo `.env`

```powershell
copy .env.example .env
notepad .env
```

Preencha com seus tokens (veja as seções 2 e 3 abaixo).

---

## 2. Como gerar o PAT do Azure DevOps

1. Acesse: **[https://dev.azure.com/MetLife-Global/_usersSettings/tokens](https://dev.azure.com/MetLife-Global/_usersSettings/tokens)**
2. Clique em **New Token**
3. Preencha:
   - Nome: `em-dashboard`
   - Organization: `MetLife-Global`
   - Expiration: `90 days`
4. Em **Scopes → Custom defined**, marque:
   - Code → **Read & Write**
   - Build → **Read**
   - Work Items → **Read**
   - Analytics → **Read**
5. Clique em **Create** e copie o token — **aparece uma única vez**
6. Cole no `.env`:
   ```
   AZURE_DEVOPS_PAT=coloque_aqui
   ```

---

## 3. Como gerar o GitHub PAT (para o Copilot API)

> Esta conta é **separada** do Azure DevOps — veja a seção 9 para entender por quê.

1. Acesse: **[https://github.com/settings/tokens](https://github.com/settings/tokens)** com a conta `filipe-s-lacerda_met`
2. Clique em **Generate new token (classic)**
3. Preencha:
   - Note: `copilot-pipeline-metlife`
   - Expiration: `90 days`
4. Em **Scopes**, marque apenas: **`copilot`**
5. Clique em **Generate token** e copie
6. Cole no `.env`:
   ```
   GITHUB_PAT=coloque_aqui
   ```

---

## 4. Como rodar manualmente

```powershell
# Opção 1 — via npm
npm run collect      # Coleta dados do Azure DevOps → salva em data/dashboard-data.json
npm run dashboard    # Gera index.html a partir do JSON
npm start            # Faz os dois em sequência

# Opção 2 — via Node diretamente
node collect.js && node generate-dashboard.js

# Opção 3 — via PowerShell (abre o browser automaticamente)
.\run.ps1
```

Depois, abra o `index.html` no browser (duplo clique ou `start index.html`).

---

## 5. Como agendar no Windows Task Scheduler

Para atualizar o dashboard automaticamente a cada hora:

```powershell
# Cria a tarefa agendada (ajuste o caminho se necessário)
schtasks /create /tn "EM Dashboard MetLife" /tr "powershell -NonInteractive -File C:\em-dashboard\run.ps1 -SemAbrir" /sc hourly /f

# Verifica se foi criada
schtasks /query /tn "EM Dashboard MetLife"

# Para remover
schtasks /delete /tn "EM Dashboard MetLife" /f
```

> Use `-SemAbrir` no run.ps1 para não abrir o browser a cada execução agendada.

---

## 6. Como configurar o pipeline de revisão automática de PR

### 6a. Crie o Variable Group no Azure DevOps

1. Acesse: **Azure DevOps → MetLife-Global → BR Life → Pipelines → Library**
2. Clique em **+ Variable group**
3. Nome: `copilot-review`
4. Adicione as variáveis:
   | Nome | Valor | Secret? |
   |------|-------|---------|
   | `AZURE_DEVOPS_PAT` | Seu PAT do Azure DevOps | ✅ Sim |
   | `GITHUB_PAT` | Seu GitHub PAT (`ghp_...`) | ✅ Sim |
5. Clique em **Save**

### 6b. Crie o pipeline no Azure DevOps

1. Azure DevOps → **BR Life → Pipelines → New Pipeline**
2. Selecione: **Azure Repos Git**
3. Selecione o repositório: `11431_br-cotador-metlife-services`
4. Selecione: **Existing Azure Pipelines YAML file**
5. Aponte para: `azure-pipelines-copilot-review.yml` (na raiz do repo ou neste projeto)
6. Clique em **Run** para testar

> O pipeline dispara automaticamente em toda PR aberta ou atualizada que contenha arquivos `.cs`.

---

## 7. Como usar o `copilot-instructions.md` no VS Code

1. Copie o arquivo `.github/copilot-instructions.md` para o repositório `11431_br-cotador-metlife-services`
2. Faça o commit na branch main/master
3. O GitHub Copilot no VS Code lerá automaticamente este arquivo ao trabalhar no repo

**Para verificar:**
- Abra o VS Code no repositório
- Abra o Copilot Chat (`Ctrl+Alt+I`)
- Pergunte: *"Quais são as regras de código deste projeto?"*
- O Copilot deve responder com base nas instruções do arquivo

---

## 8. Validando o token do Copilot

Use o script helper para verificar se seu GitHub PAT está funcionando:

```powershell
.\scripts\get-copilot-token.ps1 -GitHubPat "ghp_seutoken..."
```

O script:
- Obtém um token temporário (30 min) do Copilot API
- Testa o token com uma chamada real
- Exibe instruções para configurar o Variable Group

---

## 9. Por que as contas GitHub e Azure DevOps são separadas?

Isso é **esperado e normal** na MetLife. As duas autenticações são completamente independentes:

```
Pipeline Azure DevOps
│
├── Autenticação Azure DevOps
│   └── AZURE_DEVOPS_PAT → dev.azure.com/MetLife-Global
│       Lê: PRs, pipelines, work items
│       Posta: comentários na PR
│
└── Autenticação GitHub Copilot
    └── GITHUB_PAT → filipe-s-lacerda_met @ met-github
        └── GET api.github.com/copilot_internal/v2/token
            └── Token temporário (30 min)
                └── POST api.githubcopilot.com/chat/completions
```

O Azure DevOps usa a identidade corporativa da MetLife.
O GitHub Copilot Business usa a conta GitHub `filipe-s-lacerda_met` gerenciada pela `met-github`.
Os dois sistemas não precisam ser a mesma conta.

---

## 10. Troubleshooting

### ❌ `HTTP 401` no Copilot API
```
Causa:   GitHub PAT inválido, expirado ou sem scope 'copilot'
Solução: Gere novo PAT em https://github.com/settings/tokens
         Marque apenas o scope: copilot
         Atualize o Variable Group 'copilot-review' no Azure DevOps Library
```

### ❌ `HTTP 401` no Azure DevOps API
```
Causa:   AZURE_DEVOPS_PAT expirado ou sem os scopes corretos
Solução: Gere novo PAT em https://dev.azure.com/MetLife-Global/_usersSettings/tokens
         Scopes: Code (Read+Write), Build (Read), Work Items (Read), Analytics (Read)
         Atualize o .env e o Variable Group 'copilot-review'
```

### ❌ `HTTP 403` no Copilot API
```
Causa:   A conta filipe-s-lacerda_met não tem Copilot Business ativo
Solução: Contate o administrador da organização met-github para habilitar o acesso
```

### ❌ `AZURE_DEVOPS_PAT não encontrado` ao rodar collect.js
```
Causa:   Arquivo .env não existe ou variável não configurada
Solução: copy .env.example .env
         Edite o .env com seus tokens
```

### ❌ Dashboard abre em branco ou com erro de JSON
```
Causa:   data/dashboard-data.json não existe ou está corrompido
Solução: node collect.js   (execute a coleta antes do generate)
```

### ❌ Pipeline não dispara na PR
```
Causa:   O arquivo .yml pode não estar no repositório correto
Solução: Confirme que o pipeline está apontando para o arquivo correto
         Verifique os filtros de branch e path no trigger do .yml
```

### ❌ Erro de CORS ao abrir index.html
```
Causa:   O index.html não usa APIs externas — não deve ter CORS
Solução: Se aparecer, verifique se não há chamadas JS no HTML gerado
         O dashboard é 100% estático após gerado
```

---

## Estrutura dos dados coletados

O arquivo `data/dashboard-data.json` segue este schema:

```json
{
  "meta": { "geradoEm", "time", "totalDevs", "organizacao", "projeto", "repositorio" },
  "resumo": { "prsAbertas", "prsBloqueadas", "pipelinesFalhando", "workItemsParados", "workItemsSemDono", "avgReviewTimeHoras" },
  "prs": [ { "id", "titulo", "autor", "branchOrigem", "branchDestino", "dataCriacao", "agingHoras", "agingDias", "bloqueada", "revisores", "url" } ],
  "cargaRevisores": { "NomeDev": 2 },
  "pipelines": [ { "id", "nome", "ultimaExecucao", "taxaSucesso7dias", "totalExecucoes7dias", "tempoMedioMinutos", "falhando" } ],
  "workItems": [ { "id", "titulo", "tipo", "estado", "responsavel", "semDono", "ultimaAlteracao", "diasSemAlteracao", "parado", "iteracao", "url" } ],
  "distribuicaoWorkItems": { "NomeDev": 3 },
  "velocidade": [ { "nome", "prsMerged", "leadTimeMedioHoras" } ]
}
```
