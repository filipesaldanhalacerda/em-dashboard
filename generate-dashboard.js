/**
 * generate-dashboard.js — Gera o index.html do EM Dashboard
 * Lê: data/dashboard-data.json
 * Gera: index.html (standalone, zero dependências externas)
 *
 * Execução: node generate-dashboard.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Leitura dos dados ────────────────────────────────────────────────────────

const dataPath = path.join(__dirname, 'data', 'dashboard-data.json');

if (!fs.existsSync(dataPath)) {
  console.error('❌ ERRO: Arquivo data/dashboard-data.json não encontrado.');
  console.error('   Execute primeiro: node collect.js');
  process.exit(1);
}

const dados = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
const { meta, resumo, prs, cargaRevisores, pipelines, workItems, distribuicaoWorkItems, velocidade } = dados;

// ─── Funções auxiliares de formatação ────────────────────────────────────────

/**
 * Retorna a classe CSS de cor baseada no aging da PR
 */
function classeAging(dias) {
  if (dias < 1) return 'verde';
  if (dias <= 3) return 'amarelo';
  return 'vermelho';
}

/**
 * Formata horas em texto legível
 */
function formatarTempo(horas) {
  if (horas == null) return '—';
  if (horas < 24) return `${horas}h`;
  const dias = Math.floor(horas / 24);
  const h = horas % 24;
  return h > 0 ? `${dias}d ${h}h` : `${dias}d`;
}

/**
 * Formata data ISO para pt-BR
 */
function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Ícone de resultado de pipeline
 */
function iconePipeline(resultado, status) {
  if (status === 'inProgress') return '🔄';
  if (resultado === 'succeeded') return '✅';
  if (resultado === 'failed') return '❌';
  if (resultado === 'canceled') return '⚪';
  if (resultado === 'partiallySucceeded') return '🟡';
  return '❓';
}

// ─── Geração das seções HTML ──────────────────────────────────────────────────

function gerarCardMetricas() {
  const avgText = formatarTempo(resumo.avgReviewTimeHoras);
  return `
    <div class="metricas-grid">
      <div class="card-metrica">
        <div class="metrica-valor ${resumo.prsAbertas > 5 ? 'valor-alerta' : ''}">${resumo.prsAbertas}</div>
        <div class="metrica-label">PRs Abertas</div>
        <div class="metrica-sub">${resumo.prsBloqueadas} bloqueadas</div>
      </div>
      <div class="card-metrica">
        <div class="metrica-valor ${resumo.avgReviewTimeHoras > 48 ? 'valor-alerta' : ''}">${avgText}</div>
        <div class="metrica-label">Avg Review Time</div>
        <div class="metrica-sub">tempo médio em aberto</div>
      </div>
      <div class="card-metrica">
        <div class="metrica-valor ${resumo.pipelinesFalhando > 0 ? 'valor-critico' : ''}">${resumo.pipelinesFalhando}</div>
        <div class="metrica-label">Pipelines Falhando</div>
        <div class="metrica-sub">${pipelines.length} total</div>
      </div>
      <div class="card-metrica">
        <div class="metrica-valor ${resumo.workItemsParados > 0 ? 'valor-alerta' : ''}">${resumo.workItemsParados}</div>
        <div class="metrica-label">Itens Parados</div>
        <div class="metrica-sub">${resumo.workItemsSemDono} sem dono</div>
      </div>
    </div>`;
}

function gerarTabPRs() {
  if (prs.length === 0) {
    return '<div class="empty-state">✅ Nenhuma PR aberta no momento.</div>';
  }

  const linhas = prs.map((pr) => {
    const cls = classeAging(pr.agingDias);
    const bloqueada = pr.bloqueada ? '<span class="badge badge-bloqueada">BLOQUEADA</span>' : '';
    const revisoresText = pr.revisores.length > 0
      ? pr.revisores.map((r) => `<span class="revisor">${r.nome.split(' ')[0]} ${r.status === 'Aprovado' ? '✅' : r.status === 'Rejeitado' ? '❌' : '⏳'}</span>`).join(' ')
      : '<span class="sem-revisor">Sem revisor</span>';

    return `
      <tr>
        <td><a href="${pr.url}" target="_blank" class="pr-link">#${pr.id}</a></td>
        <td class="pr-titulo">${pr.titulo}</td>
        <td>${pr.autor.split(' ')[0]}</td>
        <td><span class="branch">${pr.branchOrigem}</span> → <span class="branch">${pr.branchDestino}</span></td>
        <td><span class="aging aging-${cls}">${formatarTempo(pr.agingHoras)}</span></td>
        <td>${revisoresText}</td>
        <td>${bloqueada}</td>
      </tr>`;
  }).join('');

  // Carga de revisores
  const cargaEntries = Object.entries(cargaRevisores).sort((a, b) => b[1] - a[1]);
  const cargaHtml = cargaEntries.length > 0
    ? `<div class="secao-carga">
        <h3>Carga de Review por Dev</h3>
        <div class="carga-grid">
          ${cargaEntries.map(([nome, qtd]) => `
            <div class="carga-item">
              <span class="carga-nome">${nome.split(' ')[0]}</span>
              <span class="carga-badge ${qtd >= 3 ? 'carga-alta' : qtd >= 2 ? 'carga-media' : 'carga-baixa'}">${qtd} PR${qtd > 1 ? 's' : ''}</span>
            </div>`).join('')}
        </div>
      </div>`
    : '';

  return `
    <table class="tabela">
      <thead>
        <tr>
          <th>PR</th>
          <th>Título</th>
          <th>Autor</th>
          <th>Branch</th>
          <th>Aging</th>
          <th>Revisores</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
    ${cargaHtml}`;
}

function gerarTabPipelines() {
  if (pipelines.length === 0) {
    return '<div class="empty-state">Nenhuma pipeline encontrada para este repositório.</div>';
  }

  const itens = pipelines.map((p) => {
    const ult = p.ultimaExecucao;
    const icone = ult ? iconePipeline(ult.resultado, ult.status) : '❓';
    const taxa = p.taxaSucesso7dias != null ? p.taxaSucesso7dias : null;
    const barraCorExt = taxa == null ? '' : taxa >= 80 ? 'barra-verde' : taxa >= 50 ? 'barra-amarela' : 'barra-vermelha';
    const barraHtml = taxa != null
      ? `<div class="barra-sucesso-container">
           <div class="barra-sucesso ${barraCorExt}" style="width:${taxa}%"></div>
         </div>
         <span class="taxa-texto">${taxa}% (${p.totalExecucoes7dias} execuções)</span>`
      : '<span class="taxa-texto sem-dados">Sem dados (7d)</span>';

    const tempoHtml = p.tempoMedioMinutos != null
      ? `${p.tempoMedioMinutos} min`
      : '—';

    const ultInfo = ult
      ? `${formatarData(ult.inicio)} · branch: ${ult.branch}`
      : 'Sem execuções';

    return `
      <div class="pipeline-item ${p.falhando ? 'pipeline-falhou' : ''}">
        <div class="pipeline-header">
          <span class="pipeline-icone">${icone}</span>
          <span class="pipeline-nome">${p.nome}</span>
          <span class="pipeline-tempo">⏱ ${tempoHtml}</span>
        </div>
        <div class="pipeline-detalhe">${ultInfo}</div>
        <div class="pipeline-taxa">${barraHtml}</div>
      </div>`;
  }).join('');

  return `<div class="pipelines-lista">${itens}</div>`;
}

function gerarTabWorkItems() {
  const emAndamento = workItems.filter((w) => !w.parado && !w.semDono);
  const parados = workItems.filter((w) => w.parado);
  const semDono = workItems.filter((w) => w.semDono);

  function renderLista(lista, icone) {
    if (lista.length === 0) return '<div class="empty-state">Nenhum item.</div>';
    return lista.map((wi) => `
      <div class="wi-item">
        <a href="${wi.url}" target="_blank" class="wi-link">#${wi.id}</a>
        <span class="wi-tipo wi-tipo-${wi.tipo?.toLowerCase().replace(/\s/g, '-')}">${wi.tipo}</span>
        <span class="wi-titulo">${wi.titulo}</span>
        <span class="wi-responsavel">${wi.responsavel}</span>
        ${wi.parado ? `<span class="wi-parado">${wi.diasSemAlteracao}d sem mover</span>` : ''}
      </div>`).join('');
  }

  // Distribuição por dev
  const distEntries = Object.entries(distribuicaoWorkItems).sort((a, b) => b[1] - a[1]);
  const distHtml = distEntries.length > 0
    ? `<div class="secao-carga">
        <h3>Distribuição por Dev</h3>
        <div class="carga-grid">
          ${distEntries.map(([nome, qtd]) => `
            <div class="carga-item">
              <span class="carga-nome">${nome.split(' ')[0]}</span>
              <span class="carga-badge ${qtd > 5 ? 'carga-alta' : qtd >= 3 ? 'carga-media' : 'carga-baixa'}">${qtd}</span>
            </div>`).join('')}
        </div>
      </div>`
    : '';

  return `
    <div class="wi-colunas">
      <div class="wi-coluna">
        <h3>✅ Em Progresso <span class="badge-count">${emAndamento.length}</span></h3>
        <div class="wi-lista">${renderLista(emAndamento, '✅')}</div>
      </div>
      <div class="wi-coluna wi-coluna-parados">
        <h3>🔴 Parados 3d+ <span class="badge-count">${parados.length}</span></h3>
        <div class="wi-lista">${renderLista(parados, '🔴')}</div>
      </div>
      <div class="wi-coluna wi-coluna-semdono">
        <h3>👤 Sem Dono <span class="badge-count">${semDono.length}</span></h3>
        <div class="wi-lista">${renderLista(semDono, '👤')}</div>
      </div>
    </div>
    ${distHtml}`;
}

function gerarTabVelocidade() {
  if (velocidade.length === 0) {
    return '<div class="empty-state">Nenhuma PR merged nos últimos 7 dias.</div>';
  }

  const maxPRs = Math.max(...velocidade.map((v) => v.prsMerged));

  const barras = velocidade.map((dev) => {
    const largura = maxPRs > 0 ? Math.round((dev.prsMerged / maxPRs) * 100) : 0;
    const leadText = formatarTempo(dev.leadTimeMedioHoras);

    return `
      <div class="velocity-row">
        <div class="velocity-nome">${dev.nome.split(' ')[0]}</div>
        <div class="velocity-barra-container">
          <div class="velocity-barra" style="width:${largura}%">
            <span class="velocity-valor">${dev.prsMerged} PR${dev.prsMerged !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="velocity-leadtime" title="Lead time médio (criação → merge)">⏱ ${leadText}</div>
      </div>`;
  }).join('');

  const totalMerged = velocidade.reduce((a, c) => a + c.prsMerged, 0);
  const leadTimes = velocidade.filter((v) => v.leadTimeMedioHoras != null).map((v) => v.leadTimeMedioHoras);
  const leadMedioGlobal = leadTimes.length > 0
    ? formatarTempo(Math.round(leadTimes.reduce((a, c) => a + c, 0) / leadTimes.length))
    : '—';

  return `
    <div class="velocity-resumo">
      <span>Total merged (7d): <strong>${totalMerged}</strong></span>
      <span>Lead time médio global: <strong>${leadMedioGlobal}</strong></span>
    </div>
    <div class="velocity-chart">${barras}</div>`;
}

// ─── Template HTML completo ───────────────────────────────────────────────────

function gerarHTML() {
  const geradoEm = new Date(meta.geradoEm).toLocaleString('pt-BR');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BR Life · Cotador MetLife · Engineering Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0d1117;
      --bg2: #161b22;
      --bg3: #21262d;
      --border: #30363d;
      --text: #c9d1d9;
      --text-muted: #8b949e;
      --accent: #58a6ff;
      --verde: #3fb950;
      --amarelo: #d29922;
      --vermelho: #f85149;
      --azul: #58a6ff;
      --roxo: #bc8cff;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      min-height: 100vh;
    }

    /* ─── Header ─── */
    .header {
      background: var(--bg2);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-logo {
      width: 36px; height: 36px;
      background: linear-gradient(135deg, #0078d4, #004578);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
    }
    .header-title { font-size: 16px; font-weight: 600; color: #fff; }
    .header-sub { font-size: 12px; color: var(--text-muted); }
    .header-meta { font-size: 11px; color: var(--text-muted); text-align: right; }
    .status-dot {
      display: inline-block; width: 8px; height: 8px;
      border-radius: 50%; background: var(--verde);
      margin-right: 4px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* ─── Métricas ─── */
    .main { padding: 24px; max-width: 1400px; margin: 0 auto; }
    .metricas-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    @media (max-width: 900px) { .metricas-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 500px) { .metricas-grid { grid-template-columns: 1fr; } }

    .card-metrica {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px;
      text-align: center;
      transition: border-color 0.2s;
    }
    .card-metrica:hover { border-color: var(--accent); }
    .metrica-valor { font-size: 36px; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
    .metrica-valor.valor-alerta { color: var(--amarelo); }
    .metrica-valor.valor-critico { color: var(--vermelho); }
    .metrica-label { font-size: 13px; font-weight: 600; color: var(--text); }
    .metrica-sub { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

    /* ─── Abas ─── */
    .tabs { border-bottom: 1px solid var(--border); margin-bottom: 24px; display: flex; gap: 0; }
    .tab {
      padding: 10px 20px;
      cursor: pointer;
      color: var(--text-muted);
      border-bottom: 2px solid transparent;
      font-size: 14px;
      font-weight: 500;
      transition: color 0.15s, border-color 0.15s;
      background: none;
      border-top: none; border-left: none; border-right: none;
    }
    .tab:hover { color: var(--text); }
    .tab.ativa { color: var(--accent); border-bottom-color: var(--accent); }
    .conteudo-aba { display: none; }
    .conteudo-aba.ativo { display: block; }

    /* ─── Tabela ─── */
    .tabela { width: 100%; border-collapse: collapse; }
    .tabela th {
      text-align: left; padding: 8px 12px;
      background: var(--bg3); color: var(--text-muted);
      font-size: 12px; font-weight: 600; text-transform: uppercase;
      border-bottom: 1px solid var(--border);
    }
    .tabela td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      color: var(--text);
      vertical-align: middle;
    }
    .tabela tr:hover td { background: var(--bg3); }

    .pr-link { color: var(--accent); text-decoration: none; font-weight: 600; }
    .pr-link:hover { text-decoration: underline; }
    .pr-titulo { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .branch {
      font-family: monospace; font-size: 11px;
      background: var(--bg3); padding: 2px 6px; border-radius: 4px;
    }

    .aging {
      font-weight: 600; padding: 2px 8px; border-radius: 12px; font-size: 12px;
    }
    .aging-verde { background: rgba(63,185,80,.15); color: var(--verde); }
    .aging-amarelo { background: rgba(210,153,34,.15); color: var(--amarelo); }
    .aging-vermelho { background: rgba(248,81,73,.15); color: var(--vermelho); }

    .badge-bloqueada {
      background: rgba(248,81,73,.2); color: var(--vermelho);
      font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;
    }
    .revisor { font-size: 12px; margin-right: 4px; }
    .sem-revisor { color: var(--text-muted); font-size: 12px; }

    /* ─── Carga de revisores ─── */
    .secao-carga { margin-top: 24px; }
    .secao-carga h3 { font-size: 14px; color: var(--text-muted); margin-bottom: 12px; }
    .carga-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .carga-item {
      background: var(--bg3); border: 1px solid var(--border);
      border-radius: 8px; padding: 8px 12px;
      display: flex; align-items: center; gap: 8px;
    }
    .carga-nome { font-size: 13px; }
    .carga-badge {
      font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px;
    }
    .carga-alta { background: rgba(248,81,73,.2); color: var(--vermelho); }
    .carga-media { background: rgba(210,153,34,.2); color: var(--amarelo); }
    .carga-baixa { background: rgba(63,185,80,.2); color: var(--verde); }

    /* ─── Pipelines ─── */
    .pipelines-lista { display: flex; flex-direction: column; gap: 12px; }
    .pipeline-item {
      background: var(--bg2); border: 1px solid var(--border);
      border-radius: 8px; padding: 16px;
    }
    .pipeline-falhou { border-color: rgba(248,81,73,.5); }
    .pipeline-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .pipeline-icone { font-size: 18px; }
    .pipeline-nome { font-weight: 600; flex: 1; }
    .pipeline-tempo { font-size: 12px; color: var(--text-muted); }
    .pipeline-detalhe { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
    .pipeline-taxa { display: flex; align-items: center; gap: 8px; }
    .barra-sucesso-container {
      flex: 1; height: 6px; background: var(--bg3);
      border-radius: 3px; overflow: hidden;
    }
    .barra-sucesso { height: 100%; border-radius: 3px; transition: width 0.3s; }
    .barra-verde { background: var(--verde); }
    .barra-amarela { background: var(--amarelo); }
    .barra-vermelha { background: var(--vermelho); }
    .taxa-texto { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
    .sem-dados { font-style: italic; }

    /* ─── Work Items ─── */
    .wi-colunas { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    @media (max-width: 900px) { .wi-colunas { grid-template-columns: 1fr; } }

    .wi-coluna h3 {
      font-size: 13px; font-weight: 600; margin-bottom: 12px;
      padding-bottom: 8px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 8px;
    }
    .wi-coluna-parados h3 { color: var(--vermelho); }
    .wi-coluna-semdono h3 { color: var(--amarelo); }
    .badge-count {
      background: var(--bg3); font-size: 11px;
      padding: 1px 6px; border-radius: 10px; color: var(--text-muted);
    }
    .wi-lista { display: flex; flex-direction: column; gap: 6px; max-height: 500px; overflow-y: auto; }
    .wi-item {
      background: var(--bg2); border: 1px solid var(--border);
      border-radius: 6px; padding: 8px 10px;
      display: flex; flex-direction: column; gap: 3px;
    }
    .wi-link { color: var(--accent); font-size: 11px; text-decoration: none; }
    .wi-titulo { font-size: 13px; }
    .wi-responsavel { font-size: 11px; color: var(--text-muted); }
    .wi-parado { font-size: 11px; color: var(--vermelho); font-weight: 600; }
    .wi-tipo {
      display: inline-block; font-size: 10px; padding: 1px 5px;
      border-radius: 3px; font-weight: 600; width: fit-content;
    }
    .wi-tipo-user-story, .wi-tipo-história-de-usuário { background: rgba(88,166,255,.2); color: var(--azul); }
    .wi-tipo-bug { background: rgba(248,81,73,.2); color: var(--vermelho); }
    .wi-tipo-task, .wi-tipo-tarefa { background: rgba(188,140,255,.2); color: var(--roxo); }

    /* ─── Velocidade ─── */
    .velocity-resumo {
      display: flex; gap: 24px; margin-bottom: 20px;
      font-size: 13px; color: var(--text-muted);
    }
    .velocity-resumo strong { color: var(--text); }
    .velocity-chart { display: flex; flex-direction: column; gap: 10px; }
    .velocity-row { display: flex; align-items: center; gap: 12px; }
    .velocity-nome { width: 100px; font-size: 13px; font-weight: 500; text-align: right; flex-shrink: 0; }
    .velocity-barra-container { flex: 1; height: 28px; background: var(--bg3); border-radius: 6px; overflow: hidden; }
    .velocity-barra {
      height: 100%; min-width: 30px;
      background: linear-gradient(90deg, #1f6feb, #58a6ff);
      border-radius: 6px;
      display: flex; align-items: center; padding: 0 8px;
      transition: width 0.4s ease;
    }
    .velocity-valor { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; }
    .velocity-leadtime { width: 80px; font-size: 12px; color: var(--text-muted); flex-shrink: 0; }

    /* ─── Misc ─── */
    .empty-state {
      text-align: center; padding: 40px;
      color: var(--text-muted); font-size: 14px;
    }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg2); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  </style>
</head>
<body>

  <header class="header">
    <div class="header-left">
      <div class="header-logo">📊</div>
      <div>
        <div class="header-title">BR Life · Cotador MetLife · Engineering Dashboard</div>
        <div class="header-sub">Time Cotador Individual · ${meta.totalDevs} devs · MetLife-Global / ${meta.projeto}</div>
      </div>
    </div>
    <div class="header-meta">
      <div><span class="status-dot"></span>Atualizado em ${geradoEm}</div>
      <div>Repo: ${meta.repositorio}</div>
    </div>
  </header>

  <main class="main">

    <!-- Métricas resumo -->
    ${gerarCardMetricas()}

    <!-- Abas -->
    <div class="tabs">
      <button class="tab ativa" onclick="mudarAba(event, 'prs')">
        PRs Abertas <span style="background:var(--bg3);padding:1px 7px;border-radius:10px;font-size:11px;margin-left:4px">${prs.length}</span>
      </button>
      <button class="tab" onclick="mudarAba(event, 'pipelines')">
        Pipelines <span style="background:var(--bg3);padding:1px 7px;border-radius:10px;font-size:11px;margin-left:4px">${pipelines.length}</span>
      </button>
      <button class="tab" onclick="mudarAba(event, 'workitems')">
        Work Items <span style="background:var(--bg3);padding:1px 7px;border-radius:10px;font-size:11px;margin-left:4px">${workItems.length}</span>
      </button>
      <button class="tab" onclick="mudarAba(event, 'velocidade')">
        Velocidade
      </button>
    </div>

    <div id="prs" class="conteudo-aba ativo">
      ${gerarTabPRs()}
    </div>

    <div id="pipelines" class="conteudo-aba">
      ${gerarTabPipelines()}
    </div>

    <div id="workitems" class="conteudo-aba">
      ${gerarTabWorkItems()}
    </div>

    <div id="velocidade" class="conteudo-aba">
      ${gerarTabVelocidade()}
    </div>

  </main>

  <script>
    function mudarAba(evento, id) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('ativa'));
      document.querySelectorAll('.conteudo-aba').forEach(c => c.classList.remove('ativo'));
      evento.currentTarget.classList.add('ativa');
      document.getElementById(id).classList.add('ativo');
    }
  </script>

</body>
</html>`;
}

// ─── Saída ────────────────────────────────────────────────────────────────────

const html = gerarHTML();
const outputPath = path.join(__dirname, 'index.html');
fs.writeFileSync(outputPath, html, 'utf-8');

console.log(`✅ Dashboard gerado: ${outputPath}`);
console.log(`   Abra o arquivo index.html no seu browser.`);
