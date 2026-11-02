import {standaloneDocument} from './document-export.js';

const labels={pending:'Pendente',draft:'Rascunho',completed:'Concluída'};
const sections={pending:'Pendentes',personal:'Minhas Concluídas',answered:'Respondidas'};
const normalize=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export function filterEvaluations(items,section,query) {
  const needle=normalize(query.trim());
  return items.filter(item=>item.section===section&&normalize(`${item.registration} ${item.personName}`).includes(needle));
}

export function evaluationSummary(item,{safe,date}) {
  return `<div class="info-strip">Demonstração fictícia, sem efeito sobre a vida funcional.</div><h2>${safe(item.title)}</h2><p>${safe(item.personName)} • Matrícula ${safe(item.registration)}<br>${safe(item.role)}<br>Período ${safe(date(item.periodStart))} a ${safe(date(item.periodEnd))}</p><p>Situação: <strong>${labels[item.status]}</strong> • Nota simulada: <strong>${safe(item.score)}</strong></p>${item.questions.map(q=>{const answer=item.answers[q.id],option=q.options.find(o=>o.id===answer?.optionId);return `<section class="evaluation-answer"><h3>${safe(q.title)}</h3><p>${safe(option?.label||'Sem resposta')}</p>${answer?.observation?`<p>Observação: ${safe(answer.observation)}</p>`:''}</section>`;}).join('')}<p>Observação geral: ${safe(item.observation||'Não informada')}</p>${typeof item.agreement==='boolean'?`<p>Ciência local: <strong>${item.agreement?'Concordou':'Discordou'}</strong></p>`:''}`;
}

export function createEvaluationsUI(ctx) {
  const {api,safe,date,heading,link,icon,modal,toast}=ctx;
  let items=[],active='pending',query='',page=0,size=10,current=null,pending=null;
  const url=id=>`/governo-digital/servidor/contratos/DEMO-001?tab=avaliacoes${id?'&evaluation='+encodeURIComponent(id):''}`;
  const $=s=>document.querySelector(s);
  function rows() {
    const filtered=filterEvaluations(items,active,query),shown=filtered.slice(page*size,(page+1)*size);
    return `<p class="small muted" role="status">${filtered.length} avaliação(ões) encontrada(s)</p>${shown.length?`<div class="evaluation-list">${shown.map(e=>`<article class="section-card"><div class="evaluation-card-title"><h2>${safe(e.title)}</h2><span class="badge">${labels[e.status]}</span></div><p>${safe(e.personName)} • Matrícula ${safe(e.registration)}<br>${safe(e.questionnaire)}</p><dl class="evaluation-dates"><div><dt>Período</dt><dd>${date(e.periodStart)} a ${date(e.periodEnd)}</dd></div><div><dt>Liberação fictícia</dt><dd>${date(e.releaseStart)} a ${date(e.releaseEnd)}</dd></div></dl><a class="button secondary" href="${url(e.id)}" data-evaluation="open" data-id="${e.id}">${e.status==='completed'?'Consultar':e.action==='agreement'?'Registrar ciência local':'Abrir questionário'}</a></article>`).join('')}</div><div class="actions evaluation-pagination"><button class="button ghost" data-evaluation="previous" ${page?'':'disabled'}>Anterior</button><span>Página ${page+1} de ${Math.ceil(filtered.length/size)}</span><button class="button ghost" data-evaluation="next" ${(page+1)*size<filtered.length?'':'disabled'}>Próxima</button></div>`:'<div class="empty"><h2>Nenhuma avaliação encontrada</h2><p>Confira a seção e o filtro por matrícula ou nome.</p></div>'}`;
  }
  async function listPage() {
    const id=new URLSearchParams(location.search).get('evaluation');
    if(id)return detailPage(id);
    items=await api('evaluations');page=Math.min(page,Math.max(0,Math.ceil(filterEvaluations(items,active,query).length/size)-1));
    return heading('Avaliações funcionais','Preenchimento e consulta com perguntas inteiramente fictícias.')+ctx.rolePanel()+ctx.contractSummary()+ctx.contractTabs('evaluations')+`<div class="info-strip">Simulação orientada pelo código público. As perguntas, notas e etapas locais não representam uma avaliação real do servidor.</div><div class="evaluation-sections" role="group" aria-label="Seções das avaliações">${Object.entries(sections).map(([key,label])=>`<button class="button ${active===key?'':'secondary'}" data-evaluation="section" data-section="${key}" aria-pressed="${active===key}">${label}</button>`).join('')}</div><form id="evaluation-filter-form" class="filters"><div class="field"><label for="evaluation-query">Filtrar por matrícula ou nome</label><input id="evaluation-query" name="query" type="search" value="${safe(query)}"></div><div class="field"><label for="evaluation-size">Itens por página</label><select id="evaluation-size" name="size">${[10,20,30,40,50].map(n=>`<option ${n===size?'selected':''}>${n}</option>`).join('')}</select></div><button class="button">Filtrar</button><button type="button" class="button ghost" data-evaluation="clear-filter">Limpar</button></form><section id="evaluation-results">${rows()}</section>`;
  }
  async function detailPage(id) {
    current=await api('evaluations/'+encodeURIComponent(id));
    const e=current,readonly=e.readOnly;
    return heading(e.title,'Perguntas e decisões de demonstração.',`<a href="${url()}" data-evaluation="back" class="button ghost">${icon('back')} Avaliações</a>`)+`<div class="info-strip">${e.action==='agreement'?'Ciência local fictícia. Não assina documento nem tramita uma avaliação real.':'Questionário fictício. A finalização registra somente o teste local.'}</div><p><strong>${safe(e.personName)}</strong> • Matrícula ${safe(e.registration)}<br>${safe(e.questionnaire)}<br>Situação: ${labels[e.status]} • Nota simulada do último salvamento: <strong>${safe(e.score)}</strong></p><form id="evaluation-answer-form" novalidate>${e.questions.map((q,index)=>{const answer=e.answers[q.id];return `<fieldset class="evaluation-question"><legend>${index+1}. ${safe(q.title)}${q.required?' (obrigatória)':''}</legend>${q.options.map(o=>`<label class="evaluation-option"><input type="radio" name="answer-${q.id}" value="${o.id}" ${answer?.optionId===o.id?'checked':''} ${readonly?'disabled':''}> <span>${safe(o.label)}${o.requiresObservation?' — exige observação ao finalizar':''}</span></label>`).join('')}<div class="field"><label for="note-${q.id}">Observação da pergunta ${index+1}</label><textarea id="note-${q.id}" name="note-${q.id}" maxlength="4000" rows="2" ${readonly?'readonly':''}>${safe(answer?.observation||'')}</textarea></div>${readonly?'':`<button type="button" class="row-button" data-evaluation="clear-answer" data-id="${q.id}">Limpar resposta</button>`}</fieldset>`;}).join('')}<div class="field"><label for="evaluation-observation">Observação geral (até 255 caracteres)</label><textarea id="evaluation-observation" name="observation" rows="3" maxlength="255" ${e.status==='completed'?'readonly':''}>${safe(e.observation)}</textarea></div><div id="evaluation-error" role="alert" tabindex="-1"></div><div class="actions evaluation-actions">${!readonly?'<button type="submit" class="button secondary">Salvar rascunho</button><button type="button" class="button" data-evaluation="confirm-finalize">Salvar e Finalizar</button>':''}${e.action==='agreement'&&e.status!=='completed'?'<button type="button" class="button" data-evaluation="confirm-agree">Concordar (simulação)</button><button type="button" class="button secondary" data-evaluation="confirm-disagree">Discordar (simulação)</button>':''}${e.status==='completed'?'<button type="button" class="button secondary" data-evaluation="export">Baixar relatório HTML</button>':''}</div></form>${typeof e.agreement==='boolean'?`<p class="info-strip">Ciência registrada localmente: ${e.agreement?'Concordou':'Discordou'}.</p>`:''}<p class="small muted bottom-note">A nota é a soma dos pontos e pesos definidos no exemplo fictício. Anexos e regras oficiais de tramitação não fazem parte desta simulação.</p>`;
  }
  function payload(finalize) {
    const form=new FormData($('#evaluation-answer-form'));
    return {answers:Object.fromEntries(current.questions.map(q=>[q.id,{optionId:form.get('answer-'+q.id)||null,observation:form.get('note-'+q.id)||''}])),observation:form.get('observation')||'',finalize};
  }
  async function save(body,agreement=false) {
    try{
      await api(`evaluations/${current.id}/${agreement?'agreement':'answers'}`,{method:'POST',body:JSON.stringify(body)});
      await ctx.render();await ctx.refreshBadge();toast(agreement?'Ciência fictícia registrada.':body.finalize?'Questionário fictício finalizado.':'Rascunho salvo no PostgreSQL local.');
    }catch(e){const box=$('#evaluation-error');if(box){box.textContent=e.message;box.focus();}else toast(e.message);}
  }
  async function click(t) {
    switch(t.dataset.evaluation) {
      case 'open':ctx.navigate(url(t.dataset.id));break;
      case 'back':ctx.navigate(url());break;
      case 'section':active=t.dataset.section;page=0;await ctx.render();break;
      case 'previous':page=Math.max(0,page-1);$('#evaluation-results').innerHTML=rows();break;
      case 'next':page++;$('#evaluation-results').innerHTML=rows();break;
      case 'clear-filter':query='';page=0;await ctx.render();break;
      case 'clear-answer':$('#evaluation-answer-form').querySelectorAll(`input[name="answer-${t.dataset.id}"]`).forEach(input=>input.checked=false);break;
      case 'confirm-finalize':pending={body:payload(true),agreement:false};confirm();break;
      case 'confirm-agree':case 'confirm-disagree':pending={body:{agree:t.dataset.evaluation==='confirm-agree',observation:$('#evaluation-observation').value},agreement:true};confirm();break;
      case 'cancel':ctx.closeModal();pending=null;break;
      case 'confirm':{if(!pending)return;const input=pending;pending=null;ctx.closeModal();await save(input.body,input.agreement);break;}
      case 'export':try{const e=await api('evaluations/'+encodeURIComponent(current.id));ctx.download(`avaliacao-ficticia-${e.id}.html`,await standaloneDocument(ctx.printableDocument(e.title,evaluationSummary(e,ctx))),'text/html;charset=utf-8');toast('Relatório fictício baixado.');}catch(e){toast(e.message);}break;
    }
  }
  function confirm(){modal('Confirmar ação local',`<p>${pending.agreement?'Registrar a concordância ou discordância fictícia?':'Finalizar este questionário fictício? Depois, ele ficará disponível somente para consulta.'}</p><div class="actions"><button class="button ghost" data-evaluation="cancel">Cancelar</button><button class="button" data-evaluation="confirm">Confirmar no ambiente local</button></div>`);}
  async function submit(event) {
    event.preventDefault();
    if(event.target.id==='evaluation-filter-form'){const form=new FormData(event.target);query=form.get('query');size=Number(form.get('size'));page=0;$('#evaluation-results').innerHTML=rows();return;}
    const button=event.target.querySelector('button[type=submit]');button.disabled=true;
    try{await save(payload(false));}finally{if(button.isConnected)button.disabled=false;}
  }
  return {listPage,click,submit};
}
