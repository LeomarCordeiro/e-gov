import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEvaluationsUI,filterEvaluations,evaluationSummary} from '../evaluations-ui.js';
const {evaluations}=JSON.parse(readFileSync(new URL('../data/demo.json',import.meta.url),'utf8'));
const safe=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const context={safe,date:s=>s,heading:t=>t,icon:()=>'',link:()=>'',rolePanel:()=>'',contractSummary:()=>'',contractTabs:()=>''};

test('evaluation filtering respects section and accent-insensitive names without mixing lists',()=>{
  const items=[...evaluations,{...evaluations[0],id:'other',personName:'João Fictício'}];
  assert.equal(filterEvaluations(items,'pending','joao')[0].id,'other');
  assert.equal(filterEvaluations(items,'personal','DEMO-001').length,1);
  assert.equal(filterEvaluations(items,'answered','not-found').length,0);
});

test('completed questionnaire renders read-only answers and export, without editing actions',async()=>{
  globalThis.location={search:'?tab=avaliacoes&evaluation=demo-eval-2'};
  const item={...evaluations[1],score:10,readOnly:true};
  try{
    const html=await createEvaluationsUI({...context,api:async()=>item}).listPage();
    assert.match(html,/disabled/);assert.match(html,/readonly/);assert.match(html,/Baixar relatório HTML/);
    assert.doesNotMatch(html,/Salvar rascunho|Salvar e Finalizar|confirm-agree/);
  }finally{delete globalThis.location;}
});

test('pending science stage shows local agreement controls and locks questionnaire answers',async()=>{
  globalThis.location={search:'?evaluation=demo-eval-4'};
  try{
    const html=await createEvaluationsUI({...context,api:async()=>({...evaluations[3],score:10,readOnly:true})}).listPage();
    assert.match(html,/Concordar \(simulação\)/);assert.match(html,/Discordar \(simulação\)/);assert.match(html,/disabled/);
    assert.doesNotMatch(html,/Salvar rascunho|Salvar e Finalizar/);
  }finally{delete globalThis.location;}
});

test('export escapes question, observation and person text',()=>{
  const item=structuredClone(evaluations[1]);item.personName='<img src=x>';item.observation='<script>bad</script>';item.score=10;
  const html=evaluationSummary(item,context);
  assert.match(html,/&lt;img/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<img|<script/);
});

test('failed evaluation query is not reported as an empty list',async()=>{
  globalThis.location={search:'?tab=avaliacoes'};
  try{await assert.rejects(createEvaluationsUI({...context,api:async()=>{throw new Error('Banco indisponível');}}).listPage(),/Banco indisponível/);}
  finally{delete globalThis.location;}
});
