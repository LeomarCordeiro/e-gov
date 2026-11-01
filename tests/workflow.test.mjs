import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDeliveryUI} from '../delivery-ui.js';
import {createWorkflowUI} from '../workflow-ui.js';

const safe=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const pending={id:'history:event-1',eventId:'event-1',kind:'history',year:2026,month:10,title:'Progressão',period:'01/10/2026',code:'DEMO-EVENT-1',availability:'pending',reason:'Aguardando revisão.'};
const event={id:'event-1',date:'2026-10-01',type:'Progressão',title:'Progressão funcional',description:'Evento fictício',document:pending};
const context=api=>({safe,api,icon:()=>'',link:()=>'',heading:(title,description='',actions='')=>title+description+actions,money:String,rolePanel:()=>'',contractSummary:()=>'',contractTabs:()=>'',getPayments:()=>[]});

test('central documents prevents selecting and downloading an unreleased document',async()=>{
  let error='';
  const ui=createDeliveryUI({...context(async()=>[pending]),eventDetail:async()=>{throw new Error('Consulta indisponível');},toast:message=>error=message});
  const html=await ui.documentsPage();
  assert.match(html,/Ainda não liberado/);assert.match(html,/Ver pendência/);
  assert.match(html,/class="document-select"[^>]*disabled/);
  assert.match(html,/<button disabled[^>]*data-evolution="download"/);
  assert.doesNotMatch(html,/undefined/);
  await ui.click({dataset:{evolution:'preview',documentId:pending.id}});
  assert.equal(error,'Consulta indisponível');
});

test('history links the event context and explains pending release without exposing content',async()=>{
  let dialog='';
  const ui=createWorkflowUI({...context(async()=>[event]),modal:(_title,body)=>dialog=body});
  assert.match(await ui.historyPage(),/data-context-kind="history" data-context-id="event-1"/);
  await ui.eventDetail('event-1');
  assert.match(dialog,/Documento ainda não liberado/);assert.match(dialog,/Aguardando revisão/);
  assert.doesNotMatch(dialog,/data-workflow="history-document"/);
});

test('request detail escapes messages and only offers permitted next steps',async()=>{
  globalThis.location={search:'?request=7'};
  globalThis.sessionStorage={getItem:()=> 'servidor'};
  const row={id:'7',protocol:'ARQ-2026-000007',title:'<script>bad</script>',category:'Outros',contextKind:'general',contextLabel:'Dúvida geral',status:'respondida',createdAt:'2026-11-01T12:00:00Z',messages:[{author:'rh',body:'<img src=x onerror=bad()>',createdAt:'2026-11-01T12:00:00Z'}],events:[]};
  const ui=createWorkflowUI(context(async()=>row));
  const html=await ui.requestsPage();
  assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script>|<img/);
  assert.match(html,/Concluir atendimento/);assert.match(html,/Reabrir solicitação/);assert.doesNotMatch(html,/Iniciar análise/);
  delete globalThis.location;delete globalThis.sessionStorage;
});

test('query failures are propagated rather than rendered as an empty list',async()=>{
  const fail=async()=>{throw new Error('Banco indisponível');};
  await assert.rejects(createDeliveryUI(context(fail)).documentsPage(),/Banco indisponível/);
  await assert.rejects(createWorkflowUI(context(fail)).historyPage(),/Banco indisponível/);
  await assert.rejects(createWorkflowUI(context(fail)).notificationsPage(),/Banco indisponível/);
});
