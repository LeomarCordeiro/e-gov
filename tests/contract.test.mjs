import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContractUI,reportContent,consignmentsContent} from '../contract-ui.js';
import {standaloneDocument} from '../document-export.js';
const seed=JSON.parse(readFileSync(new URL('../data/demo.json',import.meta.url),'utf8'));
const safe=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const context={safe,date:s=>s,money:n=>`R$ ${n.toFixed(2)}`,heading:t=>t,link:()=>'',icon:()=>'',contractSummary:()=>'',contractTabs:()=>''};

test('functional report preserves pending document status and escapes supplied text',()=>{
  const events=structuredClone(seed.history);events[0].title='<img src=x>';
  const html=reportContent({report:seed.reports[0],person:seed.person,events,generatedAt:'2026-11-01T12:00:00Z'},context);
  assert.match(html,/Ana Silva/);assert.match(html,/DEMO-001/);assert.match(html,/Ainda não liberado/);
  assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img src=x>/);
  assert.match(html,/DEMO-REPORT-HISTORY-001/);
});

test('consignment details retain supplied available margin and signed base entries',()=>{
  const html=consignmentsContent(seed.consignments[0],context);
  assert.match(html,/R\$ 880.00/);assert.match(html,/R\$ -190.00/);assert.match(html,/35%/);
  assert.match(html,/Empréstimo fictício A/);assert.match(html,/10\/2026/);
});

test('missing consignment data is distinct from missing optional groups',()=>{
  const empty=consignmentsContent(seed.consignments[2],context);
  assert.match(empty,/Nenhuma consignação encontrada/);assert.doesNotMatch(empty,/R\$ 0/);
  const partial=consignmentsContent(seed.consignments[1],context);
  assert.match(partial,/Base detalhada não fornecida/);assert.match(partial,/Nenhum desconto consignado informado/);
  assert.match(partial,/R\$ 1330.00/);
});

test('catalogue renders empty state while query failure remains an error',async()=>{
  assert.match(await createContractUI({...context,api:async()=>[]}).reportsPage(),/Nenhum relatório encontrado/);
  await assert.rejects(createContractUI({...context,api:async()=>{throw new Error('Consulta indisponível');}}).reportsPage(),/Consulta indisponível/);
});

test('failed report generation restores the action and presents the failure',async()=>{
  let error='';const button={dataset:{contract:'open-report',id:'functional-history'},innerHTML:'Abrir relatório',disabled:false};
  await createContractUI({...context,api:async()=>{throw new Error('Falha de geração');},toast:text=>error=text}).click(button);
  assert.equal(error,'Falha de geração');assert.equal(button.disabled,false);assert.equal(button.innerHTML,'Abrir relatório');
});

test('standalone reports embed shared styles, remove remote fonts and preserve dollar text',async()=>{
  const html='<html><head><link rel="stylesheet" href="http://127.0.0.1/styles.css"></head><body>Relatório</body></html>';
  const css='@font-face{src:url(/assets/font.woff2)}p:after{content:"$&"}';
  const result=await standaloneDocument(html,async()=>({ok:true,text:async()=>css}));
  assert.doesNotMatch(result,/@font-face|<link/);assert.match(result,/<style>p:after\{content:"\$&"\}<\/style>/);
  await assert.rejects(standaloneDocument(html,async()=>({ok:false})),/estilo dos documentos/);
});
