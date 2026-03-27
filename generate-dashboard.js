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

// ─── Funções auxiliares ───────────────────────────────────────────────────────

function formatarTempo(horas) {
  if (horas == null) return '—';
  if (horas < 24) return `${horas}h`;
  const dias = Math.floor(horas / 24);
  const h = horas % 24;
  return h > 0 ? `${dias}d ${h}h` : `${dias}d`;
}

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function primeiroNome(nomeCompleto) {
  if (!nomeCompleto || nomeCompleto === 'Não atribuído') return nomeCompleto || '—';
  return nomeCompleto.split(' ')[0];
}

function classeAging(dias) {
  if (dias < 1) return 'verde';
  if (dias <= 3) return 'amarelo';
  return 'vermelho';
}

function iconePipeline(resultado, status) {
  if (status === 'inProgress') return '🔄';
  if (resultado === 'succeeded') return '✅';
  if (resultado === 'failed') return '❌';
  if (resultado === 'canceled') return '⚫';
  if (resultado === 'partiallySucceeded') return '🟡';
  return '❓';
}

// ─── Seção de alertas ─────────────────────────────────────────────────────────

function gerarAlertas() {
  const alertas = [];

  // PRs paradas há mais de 3 dias
  const prsTravadasLonga = prs.filter(p => p.agingDias >= 3);
  if (prsTravadasLonga.length > 0) {
    const nomes = prsTravadasLonga.map(p => `<a href="${p.url}" target="_blank" class="alerta-link">#${p.id} ${p.titulo.slice(0, 40)}${p.titulo.length > 40 ? '…' : ''}</a> (${p.agingDias}d)`);
    alertas.push({ nivel: 'critico', texto: `${prsTravadasLonga.length} PR${prsTravadasLonga.length > 1 ? 's travadas' : ' travada'} há 3+ dias`, detalhe: nomes.join('<br>') });
  }

  // Pipelines falhando
  const falhando = pipelines.filter(p => p.falhando);
  if (falhando.length > 0) {
    const nomes = falhando.map(p => `<span>${p.nome}</span> — última execução ${formatarData(p.ultimaExecucao?.inicio)}`);
    alertas.push({ nivel: 'critico', texto: `${falhando.length} pipeline${falhando.length > 1 ? 's falhando' : ' falhando'}`, detalhe: nomes.join('<br>') });
  }

  // Work items parados há 5+ dias
  const muitoParados = workItems.filter(w => w.diasSemAlteracao >= 5);
  if (muitoParados.length > 0) {
    const nomes = muitoParados
      .sort((a, b) => b.diasSemAlteracao - a.diasSemAlteracao)
      .map(w => `<a href="${w.url}" target="_blank" class="alerta-link">#${w.id}</a> ${w.titulo.slice(0, 45)}${w.titulo.length > 45 ? '…' : ''} <span style="color:var(--text-muted)">(${primeiroNome(w.responsavel)} · ${w.diasSemAlteracao}d)</span>`);
    alertas.push({ nivel: 'atencao', texto: `${muitoParados.length} item${muitoParados.length > 1 ? 'ns parados' : ' parado'} há 5+ dias`, detalhe: nomes.join('<br>') });
  }

  // Work items sem dono
  if (resumo.workItemsSemDono > 0) {
    alertas.push({ nivel: 'atencao', texto: `${resumo.workItemsSemDono} item${resumo.workItemsSemDono > 1 ? 'ns' : ''} sem responsável`, detalhe: 'Trabalho ativo sem dono pode ficar esquecido no sprint.' });
  }

  // PRs sem revisor
  const prsSemRevisor = prs.filter(p => p.revisores.length === 0);
  if (prsSemRevisor.length > 0) {
    alertas.push({ nivel: 'atencao', texto: `${prsSemRevisor.length} PR${prsSemRevisor.length > 1 ? 's sem revisor' : ' sem revisor'} atribuído`, detalhe: prsSemRevisor.map(p => `<a href="${p.url}" target="_blank" class="alerta-link">#${p.id}</a> ${p.titulo.slice(0, 50)}`).join('<br>') });
  }

  // Pipelines com taxa de sucesso abaixo de 50%
  const pipelineInstavel = pipelines.filter(p => p.taxaSucesso7dias != null && p.taxaSucesso7dias < 50 && p.totalExecucoes7dias >= 3);
  if (pipelineInstavel.length > 0) {
    alertas.push({ nivel: 'atencao', texto: `${pipelineInstavel.length} pipeline${pipelineInstavel.length > 1 ? 's instáveis' : ' instável'} (taxa de sucesso < 50% nos últimos 7 dias)`, detalhe: pipelineInstavel.map(p => `${p.nome} — ${p.taxaSucesso7dias}% (${p.totalExecucoes7dias} execuções)`).join('<br>') });
  }

  if (alertas.length === 0) {
    return `<div class="alertas-ok">✅ Nenhum bloqueio crítico identificado — time operando normalmente.</div>`;
  }

  const criticos = alertas.filter(a => a.nivel === 'critico');
  const atencao = alertas.filter(a => a.nivel === 'atencao');

  const renderAlerta = (a, idx) => `
    <div class="alerta alerta-${a.nivel}" onclick="toggleAlerta(${idx})">
      <div class="alerta-header">
        <span class="alerta-icone">${a.nivel === 'critico' ? '🔴' : '🟡'}</span>
        <span class="alerta-texto">${a.texto}</span>
        <span class="alerta-chevron" id="chevron-${idx}">▾</span>
      </div>
      <div class="alerta-detalhe" id="detalhe-${idx}" style="display:none">${a.detalhe}</div>
    </div>`;

  return `
    <div class="alertas-wrapper">
      ${alertas.map((a, i) => renderAlerta(a, i)).join('')}
    </div>`;
}

// ─── Cards de métricas ────────────────────────────────────────────────────────

function gerarCardMetricas() {
  const avgText = formatarTempo(resumo.avgReviewTimeHoras);
  const totalMerged = velocidade.reduce((a, c) => a + c.prsMerged, 0);
  const leadTimes = velocidade.filter(v => v.leadTimeMedioHoras != null).map(v => v.leadTimeMedioHoras);
  const leadMedio = leadTimes.length > 0 ? Math.round(leadTimes.reduce((a, c) => a + c, 0) / leadTimes.length) : null;

  const prsTravadasLonga = prs.filter(p => p.agingDias >= 3).length;

  return `
    <div class="metricas-grid">
      <div class="card-metrica ${prsTravadasLonga > 0 ? 'card-alerta' : ''}">
        <div class="metrica-icon">🔀</div>
        <div class="metrica-valor ${prsTravadasLonga > 0 ? 'valor-alerta' : ''}">${resumo.prsAbertas}</div>
        <div class="metrica-label">PRs Abertas</div>
        <div class="metrica-sub ${prsTravadasLonga > 0 ? 'sub-alerta' : ''}">${prsTravadasLonga > 0 ? `${prsTravadasLonga} travadas há 3+ dias` : `${resumo.prsBloqueadas} bloqueadas`}</div>
      </div>
      <div class="card-metrica ${resumo.avgReviewTimeHoras > 96 ? 'card-critico' : resumo.avgReviewTimeHoras > 48 ? 'card-alerta' : ''}">
        <div class="metrica-icon">⏱</div>
        <div class="metrica-valor ${resumo.avgReviewTimeHoras > 96 ? 'valor-critico' : resumo.avgReviewTimeHoras > 48 ? 'valor-alerta' : ''}">${avgText}</div>
        <div class="metrica-label">Tempo Médio em Review</div>
        <div class="metrica-sub">${resumo.avgReviewTimeHoras > 48 ? 'acima do ideal (48h)' : 'dentro do esperado'}</div>
      </div>
      <div class="card-metrica ${resumo.pipelinesFalhando > 0 ? 'card-critico' : ''}">
        <div class="metrica-icon">⚙️</div>
        <div class="metrica-valor ${resumo.pipelinesFalhando > 0 ? 'valor-critico' : ''}">${resumo.pipelinesFalhando}</div>
        <div class="metrica-label">Pipelines Falhando</div>
        <div class="metrica-sub">${pipelines.length} pipelines monitoradas</div>
      </div>
      <div class="card-metrica ${resumo.workItemsParados > 0 ? 'card-alerta' : ''}">
        <div class="metrica-icon">📌</div>
        <div class="metrica-valor ${resumo.workItemsParados > 0 ? 'valor-alerta' : ''}">${resumo.workItemsParados}</div>
        <div class="metrica-label">Itens Parados (3d+)</div>
        <div class="metrica-sub">${resumo.workItemsSemDono > 0 ? `+ ${resumo.workItemsSemDono} sem responsável` : `${workItems.length} itens ativos total`}</div>
      </div>
      <div class="card-metrica ${totalMerged === 0 ? 'card-alerta' : ''}">
        <div class="metrica-icon">🚀</div>
        <div class="metrica-valor ${totalMerged === 0 ? 'valor-alerta' : ''}">${totalMerged}</div>
        <div class="metrica-label">PRs Merged (7 dias)</div>
        <div class="metrica-sub">lead time médio: ${formatarTempo(leadMedio)}</div>
      </div>
    </div>`;
}

// ─── Aba PRs ──────────────────────────────────────────────────────────────────

function gerarTabPRs() {
  if (prs.length === 0) {
    return '<div class="empty-state">✅ Nenhuma PR aberta no momento.</div>';
  }

  // Ordena: mais antigas primeiro
  const prsSorted = [...prs].sort((a, b) => b.agingHoras - a.agingHoras);

  const linhas = prsSorted.map((pr) => {
    const cls = classeAging(pr.agingDias);
    const agingLabel = pr.agingDias >= 1 ? `${pr.agingDias}d` : `${pr.agingHoras}h`;

    const revisoresHtml = pr.revisores.length > 0
      ? pr.revisores.map((r) => {
          const icone = r.voto === 10 ? '✅' : r.voto === 5 ? '💬' : r.voto === -10 ? '❌' : '⏳';
          const title = r.status;
          return `<span class="revisor" title="${r.nome} — ${title}">${primeiroNome(r.nome)} ${icone}</span>`;
        }).join('')
      : '<span class="sem-revisor">Sem revisor</span>';

    const statusHtml = pr.bloqueada
      ? `<span class="badge badge-travada">TRAVADA</span>`
      : `<span class="badge badge-ok">ABERTA</span>`;

    return `
      <tr>
        <td><a href="${pr.url}" target="_blank" class="pr-link">#${pr.id}</a></td>
        <td class="pr-titulo" title="${pr.titulo}">${pr.titulo}</td>
        <td class="td-nowrap">${pr.autor}</td>
        <td class="td-nowrap"><span class="branch">${pr.branchOrigem}</span></td>
        <td><span class="aging aging-${cls}">${agingLabel}</span></td>
        <td class="td-revisores">${revisoresHtml}</td>
        <td>${statusHtml}</td>
      </tr>`;
  }).join('');

  // Carga de revisores
  const cargaEntries = Object.entries(cargaRevisores).sort((a, b) => b[1] - a[1]);
  const cargaHtml = cargaEntries.length > 0
    ? `<div class="secao-secundaria">
        <div class="secao-titulo">Carga de review por pessoa</div>
        <div class="carga-grid">
          ${cargaEntries.map(([nome, qtd]) => `
            <div class="carga-item">
              <span class="carga-nome">${nome}</span>
              <div class="carga-barra-wrap">
                <div class="carga-barra ${qtd >= 3 ? 'carga-alta' : qtd >= 2 ? 'carga-media' : 'carga-baixa'}" style="width:${Math.min(qtd * 25, 100)}%"></div>
              </div>
              <span class="carga-qtd ${qtd >= 3 ? 'carga-alta-text' : qtd >= 2 ? 'carga-media-text' : ''}">${qtd} PR${qtd > 1 ? 's' : ''}</span>
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
          <th>Tempo aberto</th>
          <th>Revisores</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
    ${cargaHtml}`;
}

// ─── Aba Pipelines ────────────────────────────────────────────────────────────

function gerarTabPipelines() {
  if (pipelines.length === 0) {
    return '<div class="empty-state">Nenhuma pipeline encontrada para este repositório.</div>';
  }

  // Ordena: falhando primeiro, depois por taxa de sucesso
  const sorted = [...pipelines].sort((a, b) => {
    if (a.falhando && !b.falhando) return -1;
    if (!a.falhando && b.falhando) return 1;
    return (a.taxaSucesso7dias ?? 100) - (b.taxaSucesso7dias ?? 100);
  });

  const itens = sorted.map((p) => {
    const ult = p.ultimaExecucao;
    const icone = ult ? iconePipeline(ult.resultado, ult.status) : '❓';
    const taxa = p.taxaSucesso7dias;
    const barraClass = taxa == null ? '' : taxa >= 80 ? 'barra-verde' : taxa >= 50 ? 'barra-amarela' : 'barra-vermelha';

    const taxaHtml = taxa != null
      ? `<div class="pipeline-taxa-row">
           <div class="barra-sucesso-container">
             <div class="barra-sucesso ${barraClass}" style="width:${taxa}%"></div>
           </div>
           <span class="taxa-texto">${taxa}% sucesso · ${p.totalExecucoes7dias} execuções em 7d</span>
         </div>`
      : `<div class="pipeline-taxa-row"><span class="taxa-texto sem-dados">Sem execuções nos últimos 7 dias</span></div>`;

    const tempoHtml = p.tempoMedioMinutos != null ? `⏱ ${p.tempoMedioMinutos}min` : '';
    const ultInfo = ult
      ? `${formatarData(ult.inicio)} · <span class="branch">${ult.branch}</span>`
      : '<span style="color:var(--text-muted)">Sem execuções recentes</span>';

    const resultadoLabel = ult
      ? (ult.status === 'inProgress' ? 'Em execução' : ult.resultado === 'succeeded' ? 'Passou' : ult.resultado === 'failed' ? 'Falhou' : ult.resultado === 'canceled' ? 'Cancelado' : ult.resultado || ult.status)
      : '—';

    return `
      <div class="pipeline-item ${p.falhando ? 'pipeline-falhou' : ''}">
        <div class="pipeline-topo">
          <span class="pipeline-icone">${icone}</span>
          <div class="pipeline-info">
            <div class="pipeline-nome">${p.nome}</div>
            <div class="pipeline-meta">Última: ${ultInfo} · <strong>${resultadoLabel}</strong>${tempoHtml ? ' · ' + tempoHtml : ''}</div>
          </div>
        </div>
        ${taxaHtml}
      </div>`;
  }).join('');

  return `<div class="pipelines-lista">${itens}</div>`;
}

// ─── Aba Work Items ───────────────────────────────────────────────────────────

function gerarTabWorkItems() {
  const emAndamento = workItems.filter(w => !w.parado && !w.semDono);
  const parados = [...workItems.filter(w => w.parado)].sort((a, b) => b.diasSemAlteracao - a.diasSemAlteracao);
  const semDono = workItems.filter(w => w.semDono);

  function renderLista(lista) {
    if (lista.length === 0) return '<div class="empty-state-small">Nenhum item.</div>';
    return lista.map(wi => {
      const tipoClass = `wi-tipo-${(wi.tipo || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z-]/g, '')}`;
      return `
        <div class="wi-item">
          <div class="wi-linha1">
            <span class="wi-tipo ${tipoClass}">${wi.tipo || '?'}</span>
            <a href="${wi.url}" target="_blank" class="wi-link">#${wi.id}</a>
            ${wi.parado ? `<span class="wi-parado-badge">${wi.diasSemAlteracao}d sem mover</span>` : ''}
            ${wi.semDono ? `<span class="wi-semdono-badge">sem dono</span>` : ''}
          </div>
          <div class="wi-titulo" title="${wi.titulo}">${wi.titulo}</div>
          <div class="wi-meta">
            <span class="wi-responsavel">${wi.responsavel}</span>
            ${wi.iteracao ? `<span class="wi-iteracao">${wi.iteracao.split('\\').pop()}</span>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  const distEntries = Object.entries(distribuicaoWorkItems).sort((a, b) => b[1] - a[1]);
  const maxDist = distEntries.length > 0 ? distEntries[0][1] : 1;
  const distHtml = distEntries.length > 0
    ? `<div class="secao-secundaria">
        <div class="secao-titulo">Distribuição de itens por pessoa</div>
        <div class="dist-lista">
          ${distEntries.map(([nome, qtd]) => `
            <div class="dist-row">
              <span class="dist-nome">${nome}</span>
              <div class="dist-barra-wrap">
                <div class="dist-barra ${qtd > 5 ? 'carga-alta' : qtd >= 3 ? 'carga-media' : 'carga-baixa'}" style="width:${Math.round((qtd / maxDist) * 100)}%"></div>
              </div>
              <span class="dist-qtd">${qtd}</span>
            </div>`).join('')}
        </div>
      </div>`
    : '';

  return `
    <div class="wi-colunas">
      <div class="wi-coluna">
        <div class="wi-coluna-header">
          <span class="wi-coluna-titulo">Em Progresso</span>
          <span class="badge-count">${emAndamento.length}</span>
        </div>
        <div class="wi-lista">${renderLista(emAndamento)}</div>
      </div>
      <div class="wi-coluna wi-coluna-parados">
        <div class="wi-coluna-header">
          <span class="wi-coluna-titulo">Parados (3d+)</span>
          <span class="badge-count badge-count-alerta">${parados.length}</span>
        </div>
        <div class="wi-lista">${renderLista(parados)}</div>
      </div>
      <div class="wi-coluna wi-coluna-semdono">
        <div class="wi-coluna-header">
          <span class="wi-coluna-titulo">Sem Responsável</span>
          <span class="badge-count badge-count-warn">${semDono.length}</span>
        </div>
        <div class="wi-lista">${renderLista(semDono)}</div>
      </div>
    </div>
    ${distHtml}`;
}

// ─── Aba Velocidade ───────────────────────────────────────────────────────────

function gerarTabVelocidade() {
  if (velocidade.length === 0) {
    return '<div class="empty-state">Nenhuma PR merged nos últimos 7 dias.</div>';
  }

  const totalMerged = velocidade.reduce((a, c) => a + c.prsMerged, 0);
  const leadTimes = velocidade.filter(v => v.leadTimeMedioHoras != null).map(v => v.leadTimeMedioHoras);
  const leadMedio = leadTimes.length > 0
    ? Math.round(leadTimes.reduce((a, c) => a + c, 0) / leadTimes.length)
    : null;

  const maxPRs = Math.max(...velocidade.map(v => v.prsMerged));

  const devRows = velocidade.map((dev) => {
    const largura = maxPRs > 0 ? Math.round((dev.prsMerged / maxPRs) * 100) : 0;
    const leadText = formatarTempo(dev.leadTimeMedioHoras);
    const leadClass = dev.leadTimeMedioHoras == null ? '' : dev.leadTimeMedioHoras > 96 ? 'lead-lento' : dev.leadTimeMedioHoras > 48 ? 'lead-medio' : 'lead-rapido';

    return `
      <div class="velocity-row">
        <div class="velocity-nome">${dev.nome}</div>
        <div class="velocity-barra-container">
          <div class="velocity-barra" style="width:${largura}%">
            <span class="velocity-valor">${dev.prsMerged} PR${dev.prsMerged !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="velocity-leadtime ${leadClass}" title="Tempo médio entre abertura e merge">⏱ ${leadText}</div>
      </div>`;
  }).join('');

  const leadRef = `<span title="Referência: < 24h = excelente, 24-48h = bom, > 48h = atenção">ℹ</span>`;

  return `
    <div class="velocity-resumo">
      <div class="velocity-stat">
        <span class="velocity-stat-valor">${totalMerged}</span>
        <span class="velocity-stat-label">PRs merged nos últimos 7 dias</span>
      </div>
      <div class="velocity-stat">
        <span class="velocity-stat-valor ${leadMedio && leadMedio > 48 ? 'valor-alerta' : ''}">${formatarTempo(leadMedio)}</span>
        <span class="velocity-stat-label">Lead time médio do time ${leadRef}</span>
      </div>
      <div class="velocity-stat">
        <span class="velocity-stat-valor">${velocidade.length}</span>
        <span class="velocity-stat-label">devs com entrega na semana</span>
      </div>
    </div>
    <div class="velocity-legenda">
      <span class="lead-rapido">● &lt;24h rápido</span>
      <span class="lead-medio">● 24–48h ok</span>
      <span class="lead-lento">● &gt;48h lento</span>
    </div>
    <div class="velocity-chart">${devRows}</div>`;
}

// ─── Template HTML ────────────────────────────────────────────────────────────

function gerarHTML() {
  const geradoEm = new Date(meta.geradoEm).toLocaleString('pt-BR');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EM Dashboard · Cotador MetLife</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      /* ── Palette: Analytics Dashboard ── */
      --bg:            #F8FAFC;
      --surface:       #FFFFFF;
      --surface-2:     #F1F5F9;
      --border:        #E2E8F0;
      --border-subtle: #F1F5F9;

      --text-primary:   #0F172A;
      --text-secondary: #475569;
      --text-muted:     #94A3B8;

      --primary:        #1E40AF;
      --primary-hover:  #1E3A8A;
      --primary-tint:   #EFF6FF;
      --primary-mid:    #3B82F6;

      --success:        #16A34A;
      --success-tint:   #F0FDF4;
      --success-border: #BBF7D0;

      --warning:        #D97706;
      --warning-tint:   #FFFBEB;
      --warning-border: #FDE68A;

      --danger:         #DC2626;
      --danger-tint:    #FEF2F2;
      --danger-border:  #FECACA;

      --purple:         #7C3AED;
      --purple-tint:    #F5F3FF;

      /* ── Shadows ── */
      --shadow-xs: 0 1px 2px rgba(15,23,42,.06);
      --shadow-sm: 0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04);
      --shadow-md: 0 4px 6px rgba(15,23,42,.06), 0 2px 4px rgba(15,23,42,.04);
      --shadow-lg: 0 10px 15px rgba(15,23,42,.06), 0 4px 6px rgba(15,23,42,.04);

      /* ── Radius ── */
      --r-sm: 6px;
      --r-md: 8px;
      --r-lg: 12px;
      --r-xl: 16px;
    }

    body {
      background: var(--bg);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }

    /* ─── Header ──────────────────────────────────── */
    .header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 0 28px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: var(--shadow-xs);
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-logo {
      width: 32px; height: 32px;
      background: linear-gradient(135deg, var(--primary), var(--primary-mid));
      border-radius: var(--r-md);
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; flex-shrink: 0;
      box-shadow: 0 2px 4px rgba(30,64,175,.3);
    }
    .header-divider { width: 1px; height: 20px; background: var(--border); }
    .header-title { font-size: 14px; font-weight: 600; color: var(--text-primary); letter-spacing: -.01em; }
    .header-sub { font-size: 12px; color: var(--text-muted); margin-top: 1px; }
    .header-right { display: flex; align-items: center; gap: 16px; }
    .header-badge {
      display: flex; align-items: center; gap: 6px;
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: 20px; padding: 4px 10px;
      font-size: 11px; color: var(--text-secondary);
    }
    .status-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--success); flex-shrink: 0;
      animation: pulse 2.5s ease-in-out infinite;
    }
    @keyframes pulse { 0%,100% { opacity:1; box-shadow: 0 0 0 0 rgba(22,163,74,.4); } 50% { opacity:.7; box-shadow: 0 0 0 4px rgba(22,163,74,0); } }

    /* ─── Main ────────────────────────────────────── */
    .main { padding: 24px 28px; max-width: 1440px; margin: 0 auto; }

    /* ─── Alertas ─────────────────────────────────── */
    .alertas-wrapper { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }
    .alertas-ok {
      display: flex; align-items: center; gap: 10px;
      background: var(--success-tint);
      border: 1px solid var(--success-border);
      border-radius: var(--r-md);
      padding: 10px 14px;
      font-size: 13px; color: var(--success);
      margin-bottom: 20px;
    }

    .alerta {
      background: var(--surface);
      border-radius: var(--r-md);
      border: 1px solid var(--border);
      overflow: hidden;
      cursor: pointer;
      transition: box-shadow 0.15s, border-color 0.15s;
      box-shadow: var(--shadow-xs);
    }
    .alerta:hover { box-shadow: var(--shadow-sm); }
    .alerta-critico { border-left: 3px solid var(--danger); }
    .alerta-atencao { border-left: 3px solid var(--warning); }

    .alerta-header {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px;
    }
    .alerta-pill {
      font-size: 10px; font-weight: 700; letter-spacing: .4px;
      padding: 2px 7px; border-radius: 20px; flex-shrink: 0;
      text-transform: uppercase;
    }
    .alerta-critico .alerta-pill { background: var(--danger-tint); color: var(--danger); }
    .alerta-atencao .alerta-pill { background: var(--warning-tint); color: var(--warning); }
    .alerta-texto { flex: 1; font-size: 13px; font-weight: 500; color: var(--text-primary); }
    .alerta-chevron {
      color: var(--text-muted); font-size: 11px;
      transition: transform 0.2s ease; flex-shrink: 0;
      width: 18px; height: 18px; display: flex; align-items: center; justify-content: center;
      background: var(--surface-2); border-radius: 50%;
    }
    .alerta-chevron.aberto { transform: rotate(180deg); }
    .alerta-detalhe {
      padding: 12px 14px;
      border-top: 1px solid var(--border-subtle);
      background: var(--bg);
      font-size: 12px; color: var(--text-secondary);
      line-height: 1.9;
    }
    .alerta-link { color: var(--primary); text-decoration: none; font-weight: 500; }
    .alerta-link:hover { text-decoration: underline; }

    /* ─── Métricas ────────────────────────────────── */
    .metricas-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 14px;
      margin-bottom: 24px;
    }
    @media (max-width: 1200px) { .metricas-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 700px)  { .metricas-grid { grid-template-columns: repeat(2, 1fr); } }

    .card-metrica {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: 20px;
      position: relative;
      overflow: hidden;
      transition: box-shadow 0.15s, transform 0.15s;
      box-shadow: var(--shadow-sm);
    }
    .card-metrica::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0;
      height: 3px; background: linear-gradient(90deg, var(--primary), var(--primary-mid));
      opacity: 0; transition: opacity 0.2s;
    }
    .card-metrica:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
    .card-metrica:hover::before { opacity: 1; }
    .card-metrica.card-alerta::before { opacity: 1; background: linear-gradient(90deg, var(--warning), #F59E0B); }
    .card-metrica.card-critico::before { opacity: 1; background: linear-gradient(90deg, var(--danger), #F87171); }

    .metrica-icon {
      width: 36px; height: 36px;
      background: var(--primary-tint);
      border-radius: var(--r-md);
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; margin-bottom: 14px;
    }
    .card-alerta .metrica-icon { background: var(--warning-tint); }
    .card-critico .metrica-icon { background: var(--danger-tint); }

    .metrica-valor {
      font-size: 30px; font-weight: 700; line-height: 1;
      color: var(--text-primary); letter-spacing: -.02em;
      margin-bottom: 4px;
    }
    .metrica-valor.valor-alerta { color: var(--warning); }
    .metrica-valor.valor-critico { color: var(--danger); }
    .metrica-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 2px; }
    .metrica-sub { font-size: 11px; color: var(--text-muted); }
    .metrica-sub.sub-alerta { color: var(--warning); font-weight: 500; }

    /* ─── Abas ────────────────────────────────────── */
    .tabs-wrapper {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg) var(--r-lg) 0 0;
      padding: 0 20px;
      display: flex;
      gap: 0;
      overflow-x: auto;
      box-shadow: var(--shadow-xs);
    }
    .tab {
      padding: 14px 16px;
      cursor: pointer;
      color: var(--text-muted);
      border-bottom: 2px solid transparent;
      font-size: 13px; font-weight: 500;
      white-space: nowrap;
      transition: color 0.15s, border-color 0.15s;
      background: none;
      border-top: none; border-left: none; border-right: none;
      flex-shrink: 0; display: flex; align-items: center; gap: 6px;
    }
    .tab:hover { color: var(--text-primary); }
    .tab:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; border-radius: 4px; }
    .tab.ativa { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }

    .tab-badge {
      background: var(--surface-2); color: var(--text-muted);
      padding: 1px 7px; border-radius: 20px;
      font-size: 11px; font-weight: 600;
    }
    .tab-badge-alerta { background: var(--danger-tint); color: var(--danger); }

    .tab-content-wrapper {
      background: var(--surface);
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 var(--r-lg) var(--r-lg);
      padding: 20px;
      box-shadow: var(--shadow-sm);
      margin-bottom: 24px;
    }
    .conteudo-aba { display: none; }
    .conteudo-aba.ativo { display: block; }

    /* ─── Tabela ──────────────────────────────────── */
    .tabela { width: 100%; border-collapse: collapse; }
    .tabela th {
      text-align: left; padding: 9px 14px;
      background: var(--bg);
      color: var(--text-muted);
      font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .6px;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    .tabela td {
      padding: 11px 14px;
      border-bottom: 1px solid var(--border-subtle);
      vertical-align: middle;
      font-size: 13px;
    }
    .tabela tr:last-child td { border-bottom: none; }
    .tabela tbody tr { transition: background 0.1s; }
    .tabela tbody tr:hover td { background: var(--bg); cursor: default; }

    .pr-link {
      color: var(--primary); text-decoration: none;
      font-weight: 600; font-size: 12px;
      background: var(--primary-tint);
      padding: 2px 7px; border-radius: var(--r-sm);
      transition: background 0.15s;
    }
    .pr-link:hover { background: #DBEAFE; }
    .pr-titulo {
      max-width: 260px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
      color: var(--text-primary); font-weight: 500;
    }
    .td-nowrap { white-space: nowrap; color: var(--text-secondary); }

    .branch {
      font-family: 'Consolas', 'SF Mono', 'Fira Code', monospace;
      font-size: 11px; background: var(--surface-2);
      border: 1px solid var(--border); padding: 2px 6px;
      border-radius: var(--r-sm); color: var(--text-secondary);
    }

    .aging { font-weight: 600; padding: 3px 9px; border-radius: 20px; font-size: 11px; white-space: nowrap; }
    .aging-verde  { background: var(--success-tint); color: var(--success); border: 1px solid var(--success-border); }
    .aging-amarelo { background: var(--warning-tint); color: var(--warning); border: 1px solid var(--warning-border); }
    .aging-vermelho { background: var(--danger-tint); color: var(--danger); border: 1px solid var(--danger-border); }

    .badge { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 20px; letter-spacing: .3px; white-space: nowrap; }
    .badge-travada { background: var(--danger-tint); color: var(--danger); border: 1px solid var(--danger-border); }
    .badge-ok { background: var(--success-tint); color: var(--success); border: 1px solid var(--success-border); }

    .revisor { font-size: 12px; margin-right: 6px; white-space: nowrap; color: var(--text-secondary); }
    .sem-revisor { color: var(--warning); font-size: 12px; font-weight: 500; }

    /* ─── Seção secundária ────────────────────────── */
    .secao-secundaria {
      margin-top: 20px; padding-top: 20px;
      border-top: 1px solid var(--border);
    }
    .secao-titulo {
      font-size: 11px; font-weight: 700;
      color: var(--text-muted); text-transform: uppercase;
      letter-spacing: .6px; margin-bottom: 14px;
    }
    .carga-grid { display: flex; flex-direction: column; gap: 9px; max-width: 480px; }
    .carga-item { display: flex; align-items: center; gap: 10px; }
    .carga-nome {
      font-size: 13px; width: 155px; flex-shrink: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: var(--text-secondary);
    }
    .carga-barra-wrap {
      flex: 1; height: 6px; background: var(--surface-2);
      border-radius: 3px; overflow: hidden;
    }
    .carga-barra { height: 100%; border-radius: 3px; min-width: 4px; transition: width 0.4s ease; }
    .carga-alta  { background: var(--danger); }
    .carga-media { background: var(--warning); }
    .carga-baixa { background: var(--success); }
    .carga-qtd { font-size: 12px; font-weight: 600; width: 48px; text-align: right; flex-shrink: 0; }
    .carga-alta-text  { color: var(--danger); }
    .carga-media-text { color: var(--warning); }

    /* ─── Pipelines ───────────────────────────────── */
    .pipelines-lista { display: flex; flex-direction: column; gap: 8px; }
    .pipeline-item {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      padding: 14px 16px;
      transition: box-shadow 0.15s, border-color 0.15s;
    }
    .pipeline-item:hover { box-shadow: var(--shadow-sm); border-color: #CBD5E1; }
    .pipeline-falhou {
      border-left: 3px solid var(--danger);
      background: var(--danger-tint);
    }
    .pipeline-topo { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
    .pipeline-icone { font-size: 18px; flex-shrink: 0; margin-top: 2px; }
    .pipeline-info { flex: 1; min-width: 0; }
    .pipeline-nome { font-weight: 600; font-size: 14px; margin-bottom: 3px; color: var(--text-primary); }
    .pipeline-meta { font-size: 12px; color: var(--text-muted); }
    .pipeline-taxa-row { display: flex; align-items: center; gap: 10px; }
    .barra-sucesso-container {
      flex: 1; height: 4px; background: var(--surface-2);
      border-radius: 2px; overflow: hidden; max-width: 280px;
    }
    .barra-sucesso { height: 100%; border-radius: 2px; transition: width 0.5s ease; }
    .barra-verde   { background: var(--success); }
    .barra-amarela { background: var(--warning); }
    .barra-vermelha { background: var(--danger); }
    .taxa-texto { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
    .sem-dados { font-style: italic; color: var(--text-muted); }

    /* ─── Work Items ──────────────────────────────── */
    .wi-colunas { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    @media (max-width: 900px) { .wi-colunas { grid-template-columns: 1fr; } }

    .wi-coluna-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 12px; padding-bottom: 10px;
      border-bottom: 2px solid var(--border);
    }
    .wi-coluna-parados .wi-coluna-header { border-bottom-color: var(--danger-border); }
    .wi-coluna-semdono .wi-coluna-header { border-bottom-color: var(--warning-border); }

    .wi-coluna-titulo { font-size: 13px; font-weight: 700; color: var(--text-secondary); }
    .wi-coluna-parados .wi-coluna-titulo { color: var(--danger); }
    .wi-coluna-semdono .wi-coluna-titulo { color: var(--warning); }

    .badge-count {
      background: var(--surface-2); border: 1px solid var(--border);
      font-size: 11px; font-weight: 700;
      padding: 1px 7px; border-radius: 20px; color: var(--text-muted);
    }
    .badge-count-alerta { background: var(--danger-tint); color: var(--danger); border-color: var(--danger-border); }
    .badge-count-warn   { background: var(--warning-tint); color: var(--warning); border-color: var(--warning-border); }

    .wi-lista { display: flex; flex-direction: column; gap: 6px; max-height: 520px; overflow-y: auto; }
    .wi-item {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      padding: 10px 12px;
      transition: box-shadow 0.1s, border-color 0.1s;
    }
    .wi-coluna-parados .wi-item { border-left: 2px solid var(--danger-border); }
    .wi-coluna-semdono .wi-item { border-left: 2px solid var(--warning-border); }
    .wi-item:hover { box-shadow: var(--shadow-xs); border-color: #CBD5E1; }

    .wi-linha1 { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-bottom: 5px; }
    .wi-link {
      color: var(--primary); font-size: 11px; text-decoration: none; font-weight: 600;
      background: var(--primary-tint); padding: 1px 5px; border-radius: 4px;
    }
    .wi-link:hover { text-decoration: underline; }
    .wi-titulo { font-size: 13px; line-height: 1.4; color: var(--text-primary); margin-bottom: 5px; font-weight: 500; }
    .wi-meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .wi-responsavel { font-size: 11px; color: var(--text-muted); }
    .wi-iteracao {
      font-size: 10px; color: var(--text-muted);
      background: var(--surface-2); border: 1px solid var(--border);
      padding: 1px 5px; border-radius: 4px;
    }
    .wi-tipo {
      font-size: 10px; padding: 2px 6px;
      border-radius: 4px; font-weight: 700; white-space: nowrap; letter-spacing: .2px;
    }
    .wi-tipo-user-story,
    .wi-tipo-história-de-usuário,
    .wi-tipo-historia-de-usuario { background: var(--primary-tint); color: var(--primary); }
    .wi-tipo-bug { background: var(--danger-tint); color: var(--danger); }
    .wi-tipo-task, .wi-tipo-tarefa, .wi-tipo-feature { background: var(--purple-tint); color: var(--purple); }
    .wi-tipo-epic { background: var(--warning-tint); color: var(--warning); }

    .wi-parado-badge {
      font-size: 10px; font-weight: 700; padding: 2px 6px;
      border-radius: 4px; background: var(--danger-tint);
      color: var(--danger); border: 1px solid var(--danger-border);
    }
    .wi-semdono-badge {
      font-size: 10px; font-weight: 700; padding: 2px 6px;
      border-radius: 4px; background: var(--warning-tint);
      color: var(--warning); border: 1px solid var(--warning-border);
    }
    .empty-state-small { color: var(--text-muted); font-size: 12px; padding: 20px 0; text-align: center; }

    /* ─── Distribuição ────────────────────────────── */
    .dist-lista { display: flex; flex-direction: column; gap: 9px; max-width: 480px; }
    .dist-row { display: flex; align-items: center; gap: 10px; }
    .dist-nome {
      font-size: 13px; width: 155px; flex-shrink: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: var(--text-secondary);
    }
    .dist-barra-wrap {
      flex: 1; height: 6px; background: var(--surface-2);
      border-radius: 3px; overflow: hidden;
    }
    .dist-barra { height: 100%; border-radius: 3px; min-width: 4px; transition: width 0.4s ease; }
    .dist-qtd { font-size: 12px; font-weight: 600; width: 22px; text-align: right; color: var(--text-muted); }

    /* ─── Velocidade ──────────────────────────────── */
    .velocity-resumo {
      display: flex; gap: 0; margin-bottom: 24px;
      background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--r-lg); overflow: hidden;
    }
    .velocity-stat {
      display: flex; flex-direction: column;
      padding: 16px 24px; flex: 1;
      border-right: 1px solid var(--border);
    }
    .velocity-stat:last-child { border-right: none; }
    .velocity-stat-valor {
      font-size: 26px; font-weight: 700; color: var(--primary);
      line-height: 1.1; letter-spacing: -.02em;
    }
    .velocity-stat-valor.valor-alerta { color: var(--warning); }
    .velocity-stat-label { font-size: 12px; color: var(--text-muted); margin-top: 3px; }

    .velocity-legenda {
      display: flex; gap: 16px; margin-bottom: 16px;
      font-size: 11px; font-weight: 600;
    }
    .lead-rapido { color: var(--success); }
    .lead-medio  { color: var(--warning); }
    .lead-lento  { color: var(--danger); }

    .velocity-chart { display: flex; flex-direction: column; gap: 8px; }
    .velocity-row { display: flex; align-items: center; gap: 12px; }
    .velocity-nome {
      width: 150px; font-size: 13px; color: var(--text-secondary);
      text-align: right; flex-shrink: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .velocity-barra-container {
      flex: 1; height: 28px;
      background: var(--surface-2);
      border-radius: var(--r-sm); overflow: hidden;
    }
    .velocity-barra {
      height: 100%; min-width: 32px;
      background: linear-gradient(90deg, var(--primary), var(--primary-mid));
      border-radius: var(--r-sm);
      display: flex; align-items: center; padding: 0 10px;
      transition: width 0.5s ease;
    }
    .velocity-valor { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; }
    .velocity-leadtime { width: 68px; font-size: 12px; flex-shrink: 0; text-align: right; font-weight: 600; }

    /* ─── Misc ────────────────────────────────────── */
    .empty-state {
      text-align: center; padding: 52px 24px;
      color: var(--text-muted); font-size: 14px;
      background: var(--bg); border-radius: var(--r-lg);
      border: 1px dashed var(--border);
    }

    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #CBD5E1; }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
    }
  </style>
</head>
<body>

  <header class="header">
    <div class="header-left">
      <div class="header-logo">📊</div>
      <div class="header-divider"></div>
      <div>
        <div class="header-title">EM Dashboard · ${meta.time}</div>
        <div class="header-sub">${meta.organizacao} / ${meta.projeto} · ${meta.totalDevs} devs</div>
      </div>
    </div>
    <div class="header-right">
      <div class="header-badge">
        <span class="status-dot"></span>
        Atualizado ${geradoEm}
      </div>
    </div>
  </header>

  <main class="main">

    ${gerarAlertas()}
    ${gerarCardMetricas()}

    <div class="tabs-wrapper">
      <button class="tab ativa" onclick="mudarAba(event,'prs')">
        PRs Abertas
        <span class="tab-badge ${resumo.prsBloqueadas > 0 ? 'tab-badge-alerta' : ''}">${prs.length}</span>
      </button>
      <button class="tab" onclick="mudarAba(event,'pipelines')">
        Pipelines
        <span class="tab-badge ${resumo.pipelinesFalhando > 0 ? 'tab-badge-alerta' : ''}">${pipelines.length}</span>
      </button>
      <button class="tab" onclick="mudarAba(event,'workitems')">
        Work Items
        <span class="tab-badge ${resumo.workItemsParados > 0 ? 'tab-badge-alerta' : ''}">${workItems.length}</span>
      </button>
      <button class="tab" onclick="mudarAba(event,'velocidade')">
        Velocidade
      </button>
    </div>

    <div class="tab-content-wrapper">
      <div id="prs" class="conteudo-aba ativo">${gerarTabPRs()}</div>
      <div id="pipelines" class="conteudo-aba">${gerarTabPipelines()}</div>
      <div id="workitems" class="conteudo-aba">${gerarTabWorkItems()}</div>
      <div id="velocidade" class="conteudo-aba">${gerarTabVelocidade()}</div>
    </div>

  </main>

  <script>
    function mudarAba(e, id) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('ativa'));
      document.querySelectorAll('.conteudo-aba').forEach(c => c.classList.remove('ativo'));
      e.currentTarget.classList.add('ativa');
      document.getElementById(id).classList.add('ativo');
    }

    function toggleAlerta(idx) {
      const detalhe = document.getElementById('detalhe-' + idx);
      const chevron = document.getElementById('chevron-' + idx);
      const aberto = detalhe.style.display !== 'none';
      detalhe.style.display = aberto ? 'none' : 'block';
      chevron.classList.toggle('aberto', !aberto);
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
