import {standaloneDocument} from './document-export.js';

export function reportContent(data,{safe,date}) {
  const p=data.person;
  const fields=[['Servidor',p.name],['Matrícula',p.registration],['Cargo',p.role],['Lotação',p.department],['Admissão',date(p.admission)],['Regime',p.employment],['Situação',p.status]];
  return `<div class="info-strip">Relatório fictício, sem validade oficial.</div><h2>${safe(data.report.name)}</h2><dl class="report-fields">${fields.map(([key,value])=>`<div><dt>${safe(key)}</dt><dd>${safe(value)}</dd></div>`).join('')}</dl><h3>Movimentações do vínculo</h3>${data.events.length?`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Evento</th><th>Descrição</th><th>Documento vinculado</th></tr></thead><tbody>${data.events.map(e=>`<tr><td>${safe(date(e.date))}</td><td>${safe(e.title)}</td><td>${safe(e.description)}</td><td>${safe(e.document?.title||'Sem documento vinculado')}<br><small>${e.document?.availability==='pending'?'Ainda não liberado':e.document?'Disponível':'Não informado'}</small></td></tr>`).join('')}</tbody></table></div>`:'<p>Nenhuma movimentação disponível neste relatório.</p>'}<p class="small bottom-note">Código local: <strong>${safe(data.report.verificationCode)}</strong><br>Gerado em ${safe(new Date(data.generatedAt).toLocaleString('pt-BR'))}. Dados inteiramente fictícios.</p>`;
}

export function consignmentsContent(result,{safe,money}) {
  const d=result.data;
  if(!d)return '<div class="empty"><h2>Nenhuma consignação encontrada</h2><p>Não há dados fictícios de margem para este período. Consulte outra competência.</p></div>';
  const entries=(title,items,empty,absolute=false)=>`<section class="section-card"><h2>${title}</h2>${Object.keys(items||{}).length?`<div class="margin-entries">${Object.entries(items).map(([label,value])=>`<div><span>${safe(label)}</span><strong>${money(absolute?Math.abs(value):value)}</strong></div>`).join('')}</div>`:`<p class="muted">${empty}</p>`}</section>`;
  return `<p class="small muted">Dados de ${String(result.month).padStart(2,'0')}/${result.year}</p><div class="margin-summary"><section><span>Limite de Consignação</span><strong>${safe(d.margemConsignacao)}%</strong></section><section><span>Margem Bruta</span><strong>${money(d.margemBruta)}</strong></section><section><span>Valor Disponível</span><strong>${money(d.margemDisponivel)}</strong></section></div><div class="margin-columns">${entries('Consignados Existentes',d.consignadosExistentes,'Nenhum desconto consignado informado nesta massa fictícia.',true)}${entries('Bases de Cálculo',d.baseCalculos,'Base detalhada não fornecida neste exemplo.')}</div><p class="small muted">A margem disponível é um valor fornecido pela massa de demonstração. Não representa aprovação de crédito nem cálculo oficial.</p>`;
}

export function createContractUI(ctx) {
  const {api,safe,heading,link,icon,modal,toast}=ctx;
  let selectedPeriod='';
  const header=(title,description,active)=>heading(title,description,link('home',`${icon('back')} Voltar`,'button ghost'))+ctx.contractSummary()+ctx.contractTabs(active);

  async function reportsPage() {
    const reports=await api('reports');
    return header('Relatórios','Consulte os relatórios disponíveis para o vínculo fictício.','reports')+`<div class="info-strip">A demonstração gera HTML e usa a impressão do navegador para salvar PDF.</div>${reports.length?`<div class="report-list">${reports.map(r=>`<article class="report-card"><div>${icon('document')}<div><h2>${safe(r.name)}</h2><p>${safe(r.description)}</p></div></div><button class="button secondary" data-contract="open-report" data-id="${safe(r.id)}" ${r.availability!=='available'?'disabled':''}>${r.availability==='available'?'Abrir relatório':'Ainda não liberado'}</button></article>`).join('')}</div>`:'<div class="empty"><h2>Nenhum relatório encontrado</h2><p>Nenhum relatório fictício foi disponibilizado para este vínculo.</p></div>'}`;
  }

  async function consignmentsPage() {
    const query=selectedPeriod?`?year=${selectedPeriod.split('-')[0]}&month=${selectedPeriod.split('-')[1]}`:'';
    const result=await api('consignments'+query);
    return header('Consignação','Consulte limites, valores disponíveis e bases da demonstração.','consignments')+`<div class="info-strip">${safe(result.source)}</div><form id="consignment-form" class="filters"><div class="field"><label for="consignment-period">Competência fictícia</label><select id="consignment-period" name="period">${result.periods.map(p=>`<option value="${p.year}-${p.month}" ${p.year===result.year&&p.month===result.month?'selected':''}>${String(p.month).padStart(2,'0')}/${p.year}</option>`).join('')}</select></div><button class="button" type="submit">Consultar</button></form><div id="consignment-results">${consignmentsContent(result,ctx)}</div>`;
  }

  async function click(target) {
    const action=target.dataset.contract,id=target.dataset.id;
    const label=target.innerHTML;
    target.disabled=true;target.textContent=action==='open-report'?'Gerando relatório…':'Preparando…';
    try {
      const data=await api('reports/'+encodeURIComponent(id));
      const content=reportContent(data,ctx);
      if(action==='open-report')modal(data.report.name,content+`<div class="actions report-actions"><button class="button" data-contract="print-report" data-id="${safe(id)}">${icon('print')} Imprimir / Salvar PDF</button><button class="button secondary" data-contract="download-report" data-id="${safe(id)}">${icon('download')} Baixar HTML</button></div>`);
      if(action==='print-report')ctx.printDocument(ctx.printableDocument(data.report.name,content));
      if(action==='download-report'){ctx.download(`relatorio-ficticio-${id}.html`,await standaloneDocument(ctx.printableDocument(data.report.name,content)),'text/html;charset=utf-8');toast('Relatório fictício baixado.');}
    } catch(e) {toast(e.message);} finally {target.disabled=false;target.innerHTML=label;}
  }

  async function submit(event) {
    event.preventDefault();selectedPeriod=new FormData(event.target).get('period');
    const button=event.target.querySelector('button');button.disabled=true;
    const result=document.querySelector('#consignment-results');
    result.innerHTML='<p role="status">Consultando margem…</p>';
    try{
      const [year,month]=selectedPeriod.split('-');
      const data=await api(`consignments?year=${year}&month=${month}`);
      result.innerHTML=consignmentsContent(data,ctx);
    }catch(e){result.innerHTML=`<div class="info-strip" role="alert">${safe(e.message)} Tente consultar novamente.</div>`;}
    finally{button.disabled=false;}
  }
  return {reportsPage,consignmentsPage,click,submit};
}
