/**
 * collect.js — Coleta de dados do Azure DevOps para o EM Dashboard
 * Time: Cotador Individual | MetLife BR Life
 *
 * Execução: node collect.js
 * Dependências: Node.js 18+ (fetch nativo)
 * Saída: data/dashboard-data.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Configuração ────────────────────────────────────────────────────────────

// Carrega variáveis do .env se existir (compatível com Windows e Linux)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const CONFIG = {
  orgUrl: 'https://dev.azure.com/MetLife-Global',
  project: 'BR Life',
  projectEncoded: 'BR%20Life',
  repositorio: '53f9c6c2-4eeb-4733-91a9-5b43a94ffb65',
  time: 'Cotador Individual',
  totalDevs: 10,
  apiVersion: '7.1',
  pat: process.env.AZURE_DEVOPS_PAT || '',
};

// Valida o PAT antes de iniciar
if (!CONFIG.pat) {
  console.error('❌ ERRO: Variável AZURE_DEVOPS_PAT não encontrada.');
  console.error('   Crie um arquivo .env com: AZURE_DEVOPS_PAT=seu_token_aqui');
  console.error('   Gere em: https://dev.azure.com/MetLife-Global/_usersSettings/tokens');
  process.exit(1);
}

// Header de autenticação Basic para o Azure DevOps
const AUTH_HEADER = 'Basic ' + Buffer.from(':' + CONFIG.pat).toString('base64');
const BASE_URL = `${CONFIG.orgUrl}/${CONFIG.projectEncoded}/_apis`;

// ─── Utilitários ─────────────────────────────────────────────────────────────

/**
 * Realiza chamada GET à API do Azure DevOps
 */
async function azureGet(endpoint) {
  const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api-version=${CONFIG.apiVersion}`;
  console.log(`  → GET ${endpoint.split('?')[0]}`);

  const response = await fetch(url, {
    headers: {
      Authorization: AUTH_HEADER,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const corpo = await response.text().catch(() => '');
    throw new Error(`Falha na chamada ${endpoint} — HTTP ${response.status}: ${corpo.slice(0, 200)}`);
  }

  return response.json();
}

/**
 * Realiza chamada POST à API do Azure DevOps (para WIQL)
 */
async function azurePost(endpoint, body) {
  const url = `${BASE_URL}${endpoint}?api-version=${CONFIG.apiVersion}`;
  console.log(`  → POST ${endpoint}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: AUTH_HEADER,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const corpo = await response.text().catch(() => '');
    throw new Error(`Falha na chamada POST ${endpoint} — HTTP ${response.status}: ${corpo.slice(0, 200)}`);
  }

  return response.json();
}

/**
 * Calcula o aging em horas e dias desde uma data ISO
 */
function calcularAging(dataISO) {
  const agora = new Date();
  const criacao = new Date(dataISO);
  const diffMs = agora - criacao;
  const horas = Math.floor(diffMs / (1000 * 60 * 60));
  const dias = Math.floor(horas / 24);
  return { horas, dias };
}

/**
 * Retorna a data ISO de N dias atrás
 */
function diasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/**
 * Extrai o nome de exibição de um objeto de identidade do Azure DevOps
 */
function nomeIdentidade(identidade) {
  if (!identidade) return 'Não atribuído';
  return identidade.displayName || identidade.uniqueName || 'Desconhecido';
}

// ─── Coleta de PRs ────────────────────────────────────────────────────────────

/**
 * Coleta PRs abertas com aging, status de bloqueio e carga de revisores
 */
async function coletarPRsAbertas() {
  console.log('\n📋 Coletando PRs abertas...');

  const dados = await azureGet(
    `/git/repositories/${CONFIG.repositorio}/pullrequests?status=active&$top=100`
  );

  const prs = (dados.value || []).map((pr) => {
    const aging = calcularAging(pr.creationDate);
    const bloqueada = aging.dias >= 2;

    // Mapeia os revisores e seus status de voto
    const revisores = (pr.reviewers || []).map((r) => ({
      nome: nomeIdentidade(r),
      voto: r.vote, // 10=aprovado, 5=aprovado com sugestões, 0=sem resposta, -10=rejeitado
      status: r.vote === 10 ? 'Aprovado' : r.vote === 5 ? 'Com sugestões' : r.vote === -10 ? 'Rejeitado' : 'Aguardando',
    }));

    return {
      id: pr.pullRequestId,
      titulo: pr.title,
      autor: nomeIdentidade(pr.createdBy),
      branchOrigem: pr.sourceRefName?.replace('refs/heads/', '') || '',
      branchDestino: pr.targetRefName?.replace('refs/heads/', '') || '',
      dataCriacao: pr.creationDate,
      agingHoras: aging.horas,
      agingDias: aging.dias,
      bloqueada,
      revisores,
      url: `${CONFIG.orgUrl}/${CONFIG.projectEncoded}/_git/${CONFIG.repositorio}/pullrequest/${pr.pullRequestId}`,
    };
  });

  // Mapa de carga: quantas PRs cada revisor está revisando
  const cargaRevisores = {};
  for (const pr of prs) {
    for (const rev of pr.revisores) {
      if (rev.nome !== 'Não atribuído') {
        cargaRevisores[rev.nome] = (cargaRevisores[rev.nome] || 0) + 1;
      }
    }
  }

  console.log(`  ✅ ${prs.length} PRs abertas encontradas (${prs.filter((p) => p.bloqueada).length} bloqueadas)`);

  return { prs, cargaRevisores };
}

// ─── Coleta de Pipelines ──────────────────────────────────────────────────────

/**
 * Coleta as últimas execuções de cada pipeline e calcula métricas de saúde
 */
async function coletarPipelines() {
  console.log('\n⚙️  Coletando pipelines...');

  // Primeiro, busca todas as definições de pipeline do projeto
  const defsDados = await azureGet(`/build/definitions?repositoryId=${CONFIG.repositorio}&repositoryType=TfsGit`);
  const definicoes = defsDados.value || [];

  if (definicoes.length === 0) {
    console.log('  ⚠️  Nenhuma pipeline encontrada para o repositório.');
  }

  const seteDiasAtras = diasAtras(7);
  const pipelines = [];

  for (const def of definicoes) {
    // Busca as últimas 20 execuções desta definição
    const buildsData = await azureGet(
      `/build/builds?definitions=${def.id}&$top=20&minTime=${seteDiasAtras}`
    );
    const builds = buildsData.value || [];

    // Calcula taxa de sucesso dos últimos 7 dias
    const buildsRecentes = builds.filter((b) => {
      const data = new Date(b.startTime || b.queueTime);
      return data >= new Date(seteDiasAtras);
    });

    const sucessos = buildsRecentes.filter((b) => b.result === 'succeeded').length;
    const taxaSucesso = buildsRecentes.length > 0
      ? Math.round((sucessos / buildsRecentes.length) * 100)
      : null;

    // Calcula tempo médio de build em minutos
    const tempos = builds
      .filter((b) => b.startTime && b.finishTime)
      .map((b) => (new Date(b.finishTime) - new Date(b.startTime)) / 60000);

    const tempoMedio = tempos.length > 0
      ? Math.round(tempos.reduce((a, c) => a + c, 0) / tempos.length)
      : null;

    // Última execução
    const ultima = builds[0];

    pipelines.push({
      id: def.id,
      nome: def.name,
      ultimaExecucao: ultima
        ? {
            id: ultima.id,
            status: ultima.status,      // inProgress, completed, etc.
            resultado: ultima.result,   // succeeded, failed, canceled, partiallySucceeded
            inicio: ultima.startTime || ultima.queueTime,
            fim: ultima.finishTime,
            branch: ultima.sourceBranch?.replace('refs/heads/', '') || '',
            url: ultima._links?.web?.href || '',
          }
        : null,
      taxaSucesso7dias: taxaSucesso,
      totalExecucoes7dias: buildsRecentes.length,
      tempoMedioMinutos: tempoMedio,
      falhando: ultima?.result === 'failed' || ultima?.result === 'canceled',
    });
  }

  const falhando = pipelines.filter((p) => p.falhando).length;
  console.log(`  ✅ ${pipelines.length} pipelines encontradas (${falhando} falhando)`);

  return pipelines;
}

// ─── Coleta de Work Items ─────────────────────────────────────────────────────

/**
 * Coleta work items ativos com análise de itens parados e sem dono
 */
async function coletarWorkItems() {
  console.log('\n📌 Coletando work items...');

  // WIQL — busca itens em estados ativos
  const wiql = {
    query: `SELECT [System.Id], [System.Title], [System.State],
                   [System.AssignedTo], [System.ChangedDate], [System.WorkItemType],
                   [System.IterationPath]
            FROM WorkItems
            WHERE [System.TeamProject] = '${CONFIG.project}'
              AND [System.State] IN ('Active', 'In Progress', 'In Review', 'Em Andamento', 'Doing')
            ORDER BY [System.ChangedDate] ASC`,
  };

  const resultado = await azurePost('/wit/wiql', wiql);
  const refs = resultado.workItems || [];

  if (refs.length === 0) {
    console.log('  ⚠️  Nenhum work item ativo encontrado.');
    return { workItems: [], distribuicaoPorDev: {}, parados: [], semDono: [] };
  }

  // Busca detalhes em lote (máx 200 por chamada)
  const ids = refs.map((r) => r.id).slice(0, 200).join(',');
  const detalhes = await azureGet(
    `/wit/workitems?ids=${ids}&fields=System.Id,System.Title,System.State,System.AssignedTo,System.ChangedDate,System.WorkItemType,System.IterationPath`
  );

  const tresdiasAtras = new Date(diasAtras(3));

  const workItems = (detalhes.value || []).map((wi) => {
    const campos = wi.fields;
    const agingMudanca = calcularAging(campos['System.ChangedDate']);
    const parado = new Date(campos['System.ChangedDate']) < tresdiasAtras;
    const semDono = !campos['System.AssignedTo'];
    const responsavel = nomeIdentidade(campos['System.AssignedTo']);

    return {
      id: wi.id,
      titulo: campos['System.Title'],
      tipo: campos['System.WorkItemType'],
      estado: campos['System.State'],
      responsavel,
      semDono,
      ultimaAlteracao: campos['System.ChangedDate'],
      diasSemAlteracao: agingMudanca.dias,
      parado,
      iteracao: campos['System.IterationPath'],
      url: `${CONFIG.orgUrl}/${CONFIG.projectEncoded}/_workitems/edit/${wi.id}`,
    };
  });

  // Distribuição por desenvolvedor
  const distribuicaoPorDev = {};
  for (const wi of workItems) {
    if (!wi.semDono) {
      distribuicaoPorDev[wi.responsavel] = (distribuicaoPorDev[wi.responsavel] || 0) + 1;
    }
  }

  const parados = workItems.filter((w) => w.parado);
  const semDono = workItems.filter((w) => w.semDono);

  console.log(`  ✅ ${workItems.length} work items ativos (${parados.length} parados, ${semDono.length} sem dono)`);

  return { workItems, distribuicaoPorDev, parados, semDono };
}

// ─── Coleta de Velocidade ─────────────────────────────────────────────────────

/**
 * Calcula velocidade do time: PRs merged por dev e lead time médio
 */
async function coletarVelocidade() {
  console.log('\n🚀 Coletando dados de velocidade (PRs merged 7 dias)...');

  const seteDiasAtras = new Date(diasAtras(7));

  // PRs completadas (merged) nas últimas semanas — busca as 100 mais recentes
  const dados = await azureGet(
    `/git/repositories/${CONFIG.repositorio}/pullrequests?status=completed&$top=100`
  );

  const prsCompletadas = (dados.value || []).filter((pr) => {
    const dataMerge = new Date(pr.closedDate || pr.completionQueueTime);
    return dataMerge >= seteDiasAtras;
  });

  // Agrupa por autor e calcula métricas
  const porDev = {};

  for (const pr of prsCompletadas) {
    const autor = nomeIdentidade(pr.createdBy);
    if (!porDev[autor]) {
      porDev[autor] = { nome: autor, prsMerged: 0, leadTimes: [] };
    }

    porDev[autor].prsMerged += 1;

    // Lead time: criação → merge (em horas)
    if (pr.creationDate && (pr.closedDate || pr.completionQueueTime)) {
      const criacao = new Date(pr.creationDate);
      const fechamento = new Date(pr.closedDate || pr.completionQueueTime);
      const leadTimeHoras = (fechamento - criacao) / (1000 * 60 * 60);
      porDev[autor].leadTimes.push(leadTimeHoras);
    }
  }

  // Calcula lead time médio por dev
  const velocidade = Object.values(porDev).map((dev) => ({
    nome: dev.nome,
    prsMerged: dev.prsMerged,
    leadTimeMedioHoras: dev.leadTimes.length > 0
      ? Math.round(dev.leadTimes.reduce((a, c) => a + c, 0) / dev.leadTimes.length)
      : null,
  }));

  // Ordena por número de PRs merged (decrescente)
  velocidade.sort((a, b) => b.prsMerged - a.prsMerged);

  console.log(`  ✅ ${prsCompletadas.length} PRs merged nos últimos 7 dias por ${velocidade.length} devs`);

  return velocidade;
}

// ─── Função Principal ─────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  EM Dashboard — Cotador Individual · MetLife BR Life ║');
  console.log('║  Coletando dados do Azure DevOps...                  ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n🕐 Início: ${new Date().toLocaleString('pt-BR')}\n`);

  // Verifica conectividade básica
  try {
    await azureGet('/git/repositories?$top=1');
    console.log('  ✅ Conexão com Azure DevOps estabelecida\n');
  } catch (err) {
    console.error(`\n❌ ERRO DE CONEXÃO: ${err.message}`);
    console.error('   Verifique se o PAT é válido e tem os escopos corretos.');
    console.error('   Escopos necessários: Code (Read), Build (Read), Work Items (Read)');
    process.exit(1);
  }

  // Coleta todos os dados em paralelo (exceto work items que depende de WIQL)
  let prsData, pipelinesData, workItemsData, velocidadeData;

  try {
    [prsData, pipelinesData] = await Promise.all([
      coletarPRsAbertas(),
      coletarPipelines(),
    ]);

    workItemsData = await coletarWorkItems();
    velocidadeData = await coletarVelocidade();
  } catch (err) {
    console.error(`\n❌ ERRO durante coleta: ${err.message}`);
    console.error('   Stack:', err.stack);
    process.exit(1);
  }

  // Monta o objeto final
  const dashboardData = {
    meta: {
      geradoEm: new Date().toISOString(),
      time: CONFIG.time,
      totalDevs: CONFIG.totalDevs,
      organizacao: 'MetLife-Global',
      projeto: CONFIG.project,
      repositorio: CONFIG.repositorio,
    },
    resumo: {
      prsAbertas: prsData.prs.length,
      prsBloqueadas: prsData.prs.filter((p) => p.bloqueada).length,
      pipelinesFalhando: pipelinesData.filter((p) => p.falhando).length,
      workItemsParados: workItemsData.parados.length,
      workItemsSemDono: workItemsData.semDono.length,
      avgReviewTimeHoras: prsData.prs.length > 0
        ? Math.round(prsData.prs.reduce((a, c) => a + c.agingHoras, 0) / prsData.prs.length)
        : 0,
    },
    prs: prsData.prs,
    cargaRevisores: prsData.cargaRevisores,
    pipelines: pipelinesData,
    workItems: workItemsData.workItems,
    distribuicaoWorkItems: workItemsData.distribuicaoPorDev,
    velocidade: velocidadeData,
  };

  // Salva o JSON na pasta data/
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const outputPath = path.join(dataDir, 'dashboard-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(dashboardData, null, 2), 'utf-8');

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  ✅ Coleta concluída com sucesso!                    ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n📊 Resumo:`);
  console.log(`   PRs abertas:         ${dashboardData.resumo.prsAbertas} (${dashboardData.resumo.prsBloqueadas} bloqueadas)`);
  console.log(`   Avg review time:     ${dashboardData.resumo.avgReviewTimeHoras}h`);
  console.log(`   Pipelines falhando:  ${dashboardData.resumo.pipelinesFalhando}`);
  console.log(`   Work items parados:  ${dashboardData.resumo.workItemsParados}`);
  console.log(`   Work items sem dono: ${dashboardData.resumo.workItemsSemDono}`);
  console.log(`\n📁 Dados salvos em: ${outputPath}`);
  console.log(`🕐 Fim: ${new Date().toLocaleString('pt-BR')}\n`);
}

main().catch((err) => {
  console.error('\n❌ Erro fatal:', err.message);
  process.exit(1);
});
