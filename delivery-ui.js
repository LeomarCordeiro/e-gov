import {documentStyles,standaloneDocument as standalone} from './document-export.js';
import {comparePayments,explainRubric,filterDocuments} from './delivery.js';
import {createZip} from './zip.js';

export function createDeliveryUI(ctx) {
  const {safe,money,icon,link,heading,modal,api,download,toast}=ctx;
  const statuses={included:'Incluída',removed:'Removida',changed:'Alterada',unchanged:'Sem alteração'};
  let compareSelection=null, onlyChanges=true;
  let filters={year:'',month:'',kind:'',query:''};
  const selected=new Set();
  const $=selector=>document.querySelector(selector);
  const monthNames=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const label=p=>`${monthNames[p.month-1]}/${p.year} — ${p.type}`;
  const signed=cents=>`${cents>0?'+ ':cents<0?'− ':''}${money(Math.abs(cents)/100)}`;
  const color=cents=>cents>0?'positive':cents<0?'negative':'neutral';
  let documents=[];
  const catalog=()=>documents;
  const visible=()=>filterDocuments(catalog(),filters);

  function comparePage() {
    const payments=ctx.getPayments();
    if (!compareSelection) {
      const normal=payments.filter(p=>p.kind==='normal');
      compareSelection={before:normal[1]?.id,after:normal[0]?.id};
    }
    const options=selectedId=>payments.map(p=>`<option value="${p.id}" ${p.id===selectedId?'selected':''}>${label(p)}</option>`).join('');
    return heading('Comparar holerites','Veja o que mudou de um pagamento para outro.',link('holerites',`${icon('back')} Holerites`,'button ghost'))+
      `<div class="info-strip">${icon('info')}<span>Compare folhas do mesmo vínculo. A diferença mostrada é o impacto no líquido. Todos os valores são fictícios.</span></div>
      <form id="compare-form" class="filters"><div class="field"><label for="compare-before">Pagamento de referência</label><select id="compare-before" name="before">${options(compareSelection.before)}</select></div><div class="field"><label for="compare-after">Pagamento a comparar</label><select id="compare-after" name="after">${options(compareSelection.after)}</select></div><button class="button" type="submit">${icon('search')} Comparar</button><button type="button" id="swap-payments" class="button secondary">Inverter</button></form>
      <div id="comparison-result" aria-live="polite">${comparisonResult()}</div>`;
  }

  function comparisonResult() {
    const payments=ctx.getPayments(),before=payments.find(p=>p.id===compareSelection.before),after=payments.find(p=>p.id===compareSelection.after);
    let result;try{result=comparePayments(before,after);}catch(e){return `<div class="empty"><h2>Não foi possível comparar</h2><p>${safe(e.message)}</p></div>`;}
    const changed=result.rows.filter(r=>r.status!=='unchanged'),shown=onlyChanges?changed:result.rows;
    const largest=[...changed].filter(r=>r.impactCents!==0).sort((a,b)=>Math.abs(b.impactCents)-Math.abs(a.impactCents)).slice(0,3);
    const summary=result.delta.netCents===0?'O valor líquido permaneceu igual.':`O valor líquido ${result.delta.netCents>0?'aumentou':'diminuiu'} ${money(Math.abs(result.delta.netCents)/100)}.`;
    return `${result.differentKinds?`<div class="info-strip comparison-warning">${icon('info')}<span>As folhas são de tipos diferentes (${safe(before.type)} e ${safe(after.type)}). A comparação mostra diferenças matemáticas, sem indicar erro de pagamento.</span></div>`:''}
      <section class="comparison-summary"><div><span class="eyebrow">RESUMO DA COMPARAÇÃO</span><h2>${summary}</h2><p>${label(before)} → ${label(after)}</p></div><span class="comparison-delta ${color(result.delta.netCents)}">${signed(result.delta.netCents)}</span></section>
      <div class="totals comparison-totals"><div class="total"><span class="muted">Líquido de referência</span><strong>${money(before.net)}</strong></div><div class="total"><span class="muted">Líquido a comparar</span><strong>${money(after.net)}</strong></div><div class="total"><span class="muted">Rubricas com alteração</span><strong>${changed.length}</strong></div></div>
      ${largest.length?`<section class="change-reasons"><h2>O que mais contribuiu para a diferença</h2>${largest.map(r=>`<p><span>${safe(r.description)} <small>(${r.kind==='deduction'?'desconto':'provento'})</small></span><strong class="${color(r.impactCents)}">${signed(r.impactCents)} no líquido</strong></p>`).join('')}</section>`:''}
      <div class="results-heading"><h2>Rubrica por rubrica</h2><label class="checkbox-label"><input id="only-changes" type="checkbox" ${onlyChanges?'checked':''}> Apenas alterações</label></div>
      ${shown.length?`<div class="table-wrap"><table class="comparison-table"><thead><tr><th>Rubrica / tipo</th><th>Situação</th><th class="number">Referência<br><small>${before.month}/${before.year}</small></th><th class="number">Comparação<br><small>${after.month}/${after.year}</small></th><th class="number">Impacto no líquido</th></tr></thead><tbody>${shown.map(r=>`<tr><td><button class="rubric-link" data-evolution="rubric" data-payment-id="${r.status==='removed'?before.id:after.id}" data-code="${r.code}" data-kind="${r.kind}">${safe(r.code)} — ${safe(r.description)} ${icon('info')}</button><div class="small muted">${r.kind==='deduction'?'Desconto':'Provento'} • Ref.: ${safe(r.beforeReference)} → ${safe(r.afterReference)}</div></td><td><span class="change-badge ${r.status}">${statuses[r.status]}</span></td><td class="number">${r.status==='included'?'—':money(r.beforeCents/100)}</td><td class="number">${r.status==='removed'?'—':money(r.afterCents/100)}</td><td class="number ${color(r.impactCents)}">${signed(r.impactCents)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty"><h2>Nenhuma rubrica mudou</h2><p>Desmarque “Apenas alterações” para consultar todos os eventos.</p></div>'}
      <p class="small muted bottom-note">${result.reconciled?'A soma dos impactos confere com a diferença do líquido.':'Os eventos não reconciliam com os totais. Confira a origem dos dados.'} Aumento de desconto reduz o líquido; redução de desconto aumenta o líquido.</p>`;
  }

  function rubric(paymentId,code,kind) {
    const p=ctx.getPayments().find(p=>p.id===paymentId);
    const entry=(kind==='deduction'?p?.deductions:p?.earnings)?.find(e=>e.code===code);
    if(!entry)return toast('Rubrica não encontrada.');
    const info=explainRubric(p,entry,ctx.getPayments());
    modal('Entenda esta rubrica',`<div class="rubric-heading"><span class="badge">${kind==='deduction'?'Desconto':'Provento'}</span><h3>${safe(entry.code)} — ${safe(entry.description)}</h3><p class="muted">${safe(label(p))}</p></div><section class="rubric-section"><h3>O que significa</h3><p>${safe(info.description)}</p></section><section class="rubric-section"><h3>Como o valor foi formado neste exemplo</h3><p class="calculation">${safe(info.calculation)}</p><p class="small muted">Referência exibida na folha: ${safe(entry.reference)}</p></section><section class="rubric-section"><h3>Efeito no pagamento</h3><p>Esta rubrica ${kind==='deduction'?'reduz':'aumenta'} o valor líquido em <strong>${money(entry.amount)}</strong>.</p></section><div class="info-strip">${icon('info')}<span>${safe(info.source)}</span></div><button class="button secondary" data-receipt="${p.id}">Ver recibo completo</button>`);
  }

  async function documentsPage() {
    documents=await api('documents');
    const records=catalog(),years=[...new Set(records.map(d=>d.year))];
    return heading('Central de documentos','Seus holerites e comprovantes, organizados em um só lugar.',link('home',`${icon('back')} Voltar`,'button ghost'))+ctx.rolePanel()+
      `<div class="document-overview"><span>${icon('folder')} <strong>${records.length}</strong> documentos fictícios</span><span>${icon('receipt')} ${records.filter(d=>d.kind==='payment').length} holerites</span><span>${icon('card')} ${records.filter(d=>d.kind==='income').length} comprovantes anuais</span><span>${icon('tree')} ${records.filter(d=>d.kind==='history').length} documentos funcionais</span></div>
      <form id="documents-form" class="filters documents-filters"><div class="field"><label for="document-query">Buscar documentos</label><input id="document-query" name="query" type="search" value="${safe(filters.query)}" placeholder="Nome, período ou código"></div><div class="field"><label for="document-year">Ano</label><select id="document-year" name="year"><option value="">Todos</option>${years.map(y=>`<option value="${y}" ${filters.year===String(y)?'selected':''}>${y}</option>`).join('')}</select></div><div class="field"><label for="document-month">Mês</label><select id="document-month" name="month"><option value="">Todos</option>${monthNames.map((m,i)=>`<option value="${i+1}" ${filters.month===String(i+1)?'selected':''}>${m}</option>`).join('')}</select></div><div class="field"><label for="document-kind">Tipo</label><select id="document-kind" name="kind"><option value="">Todos</option><option value="payment" ${filters.kind==='payment'?'selected':''}>Holerite</option><option value="income" ${filters.kind==='income'?'selected':''}>Comprovante anual</option><option value="history" ${filters.kind==='history'?'selected':''}>Documento funcional</option></select></div><button class="button" type="submit">${icon('search')} Buscar</button><button type="button" id="clear-documents" class="button ghost">Limpar filtros</button></form>
      <p class="small muted">O filtro de mês se aplica a holerites e eventos funcionais. Comprovantes anuais aparecem quando o mês está em “Todos”. Documentos não liberados não podem ser selecionados para download.</p><div id="documents-result">${documentRows()}</div>`;
  }

  function selectionToolbar() {
    const current=new Set(visible().map(d=>d.id)),hidden=[...selected].filter(id=>!current.has(id)).length;
    return `<div class="batch-toolbar"><div role="status"><strong>${selected.size}</strong> selecionado${selected.size===1?'':'s'}${hidden?` <span class="small">(${hidden} fora dos filtros atuais)</span>`:''}</div><div class="actions"><button id="clear-selection" class="button ghost" ${selected.size?'':'disabled'}>Limpar seleção</button><button id="download-selected" class="button" ${selected.size?'':'disabled'}>${icon('download')} Baixar selecionados (ZIP)</button></div></div>`;
  }

  function documentRows() {
    const list=visible(),eligible=list.filter(d=>d.availability!=='pending'),all=eligible.length>0&&eligible.every(d=>selected.has(d.id));
    return `<div id="selection-toolbar">${selectionToolbar()}</div><div class="results-heading"><h2>Documentos</h2><span class="small muted" role="status">${list.length} resultado${list.length===1?'':'s'}</span></div>${list.length?`<div class="table-wrap"><table class="documents-table"><thead><tr><th><input id="select-visible" type="checkbox" aria-label="Selecionar todos os documentos filtrados" ${all?'checked':''}></th><th>Documento</th><th>Período</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${list.map(d=>`<tr><td><input class="document-select" data-document-id="${d.id}" type="checkbox" aria-label="Selecionar ${safe(d.title)} ${d.period}" ${d.availability==='pending'?'disabled':''} ${selected.has(d.id)?'checked':''}></td><td><strong>${safe(d.title)}</strong><div class="small muted">${safe(d.code)}</div></td><td>${d.period}</td><td><span class="change-badge ${d.availability==='pending'||d.partial?'changed':'included'}">${d.availability==='pending'?'Ainda não liberado':d.partial?'Parcial':'Disponível'}</span></td><td><div class="actions"><button class="row-button" data-evolution="preview" data-document-id="${d.id}">${icon('search')} ${d.availability==='pending'?'Ver pendência':'Visualizar'}</button><button ${d.availability==='pending'?'disabled':''} class="row-button" data-evolution="download" data-document-id="${d.id}">${icon('download')} HTML</button></div></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty"><h2>Nenhum documento neste filtro</h2><p>Altere o período, o tipo ou o texto de busca.</p></div>'}<p class="small muted bottom-note">O ZIP contém os documentos em HTML e o estilo de impressão. Para PDF, use “Visualizar” e “Imprimir / Salvar PDF”. Não há documentos oficiais neste ambiente.</p>`;
  }

  async function documentHTML(d) {
    if(d.availability==='pending')throw new Error('Documento ainda não liberado.');
    if(d.kind==='history')return ctx.historyDocumentHTML(d);
    return d.kind==='payment'?ctx.receiptDocument(ctx.getPayments().find(p=>p.id===d.paymentId)):ctx.incomeDocument(await api('income?year='+d.year));
  }
  function filename(d){if(d.kind==='history')return `evento-${d.eventId}.html`;return d.kind==='payment'?`holerite-${d.paymentId}.html`:`comprovante-${d.year}.html`;}
  async function batchDownload(button) {
    const chosen=catalog().filter(d=>selected.has(d.id)&&d.availability!=='pending');if(!chosen.length)return;
    button.disabled=true;button.textContent='Preparando documentos…';
    try {
      const css=await documentStyles();
      const files=[];
      for(const d of chosen){const html=await documentHTML(d);files.push({name:filename(d),data:html.replace(/<link rel="stylesheet"[^>]*>/,'<link rel="stylesheet" href="estilos.css">')});}
      files.push({name:'estilos.css',data:css},{name:'LEIA-ME.txt',data:'DEMONSTRAÇÃO LOCAL — DADOS FICTÍCIOS\nExtraia o ZIP e abra os arquivos HTML. Para PDF, use a impressão do navegador.\nSem validade oficial. O pacote não depende do portal original nem do servidor local.\n'});
      download('documentos-ficticios.zip',createZip(files),'application/zip');toast(`${chosen.length} documentos reunidos no ZIP.`);
    } catch(e){toast(e.message);} finally {if($('#selection-toolbar'))$('#selection-toolbar').innerHTML=selectionToolbar();}
  }

  const clickIds=new Set(['swap-payments','clear-documents','clear-selection','download-selected']);
  function ownsClick(target){return !!target.dataset.evolution||clickIds.has(target.id);}
  async function click(target) {
    if(target.dataset.evolution==='rubric')return rubric(target.dataset.paymentId,target.dataset.code,target.dataset.kind);
    if(target.dataset.evolution){
      const d=catalog().find(d=>d.id===target.dataset.documentId);if(!d)return;
      try {
        if(target.dataset.evolution==='preview'&&d.availability==='pending')return await ctx.eventDetail(d.eventId);
        if(target.dataset.evolution==='preview'&&d.kind==='history')return await ctx.historyDocument(d.eventId);
        if(target.dataset.evolution==='preview')return d.kind==='payment'?ctx.receiptModal(d.paymentId):await ctx.showIncome(d.year);
        if(target.dataset.evolution==='download'){download(filename(d),await standalone(await documentHTML(d)),'text/html;charset=utf-8');toast('Documento fictício baixado.');}
      }catch(e){toast(e.message);}return;
    }
    if(target.id==='swap-payments'){const a=$('#compare-before').value,b=$('#compare-after').value;compareSelection={before:b,after:a};$('#compare-before').value=b;$('#compare-after').value=a;$('#comparison-result').innerHTML=comparisonResult();}
    if(target.id==='clear-documents'){filters={year:'',month:'',kind:'',query:''};try{$('#main').innerHTML=await documentsPage();}catch(e){toast(e.message);}}
    if(target.id==='clear-selection'){selected.clear();$('#documents-result').innerHTML=documentRows();}
    if(target.id==='download-selected')await batchDownload(target);
  }
  function submit(event) {
    if(event.target.id==='compare-form'){event.preventDefault();compareSelection=Object.fromEntries(new FormData(event.target));$('#comparison-result').innerHTML=comparisonResult();return true;}
    if(event.target.id==='documents-form'){event.preventDefault();filters=Object.fromEntries(new FormData(event.target));$('#documents-result').innerHTML=documentRows();return true;}
    return false;
  }
  function change(event) {
    const target=event.target;
    if(target.id==='only-changes'){onlyChanges=target.checked;$('#comparison-result').innerHTML=comparisonResult();}
    if(target.id==='compare-before'||target.id==='compare-after')$('#comparison-result').innerHTML='<div class="info-strip">Seleção alterada. Clique em Comparar para atualizar o resultado.</div>';
    if(target.classList.contains('document-select')){if(target.checked)selected.add(target.dataset.documentId);else selected.delete(target.dataset.documentId);$('#selection-toolbar').innerHTML=selectionToolbar();const list=visible().filter(d=>d.availability!=='pending'),count=list.filter(d=>selected.has(d.id)).length;$('#select-visible').checked=count===list.length;$('#select-visible').indeterminate=count>0&&count<list.length;}
    if(target.id==='select-visible'){for(const d of visible().filter(d=>d.availability!=='pending'))if(target.checked)selected.add(d.id);else selected.delete(d.id);$('#documents-result').innerHTML=documentRows();}
  }
  return {comparePage,documentsPage,ownsClick,click,submit,change};
}
