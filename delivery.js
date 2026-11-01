// Business rules shared by the browser and tests. No connection to the official portal.
export const toCents = value => Math.round(value * 100);
const money = value => value.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function eventMap(payment) {
  const map = new Map();
  for (const [kind, entries] of [['earning', payment.earnings], ['deduction', payment.deductions]]) {
    for (const entry of entries) {
      const key = `${kind}:${entry.code}`;
      const current = map.get(key) ?? {key, kind, code:entry.code, description:entry.description, cents:0, references:[]};
      current.cents += toCents(entry.amount);
      if (!current.references.includes(entry.reference)) current.references.push(entry.reference);
      map.set(key, current);
    }
  }
  return map;
}

export function comparePayments(before, after) {
  if (!before || !after) throw new Error('Selecione os dois holerites.');
  if (before.id === after.id) throw new Error('Selecione dois holerites diferentes.');
  if (before.registration !== after.registration) throw new Error('Compare holerites do mesmo vínculo.');
  const oldEvents = eventMap(before), newEvents = eventMap(after);
  const rows = [...new Set([...oldEvents.keys(), ...newEvents.keys()])].map(key => {
    const old = oldEvents.get(key), next = newEvents.get(key), entry = next ?? old;
    const beforeCents = old?.cents ?? 0, afterCents = next?.cents ?? 0;
    const deltaCents = afterCents - beforeCents;
    const referenceChanged = !!old && !!next && old.references.join('|') !== next.references.join('|');
    return {...entry, beforeCents, afterCents, deltaCents,
      impactCents:deltaCents * (entry.kind === 'deduction' ? -1 : 1),
      beforeReference:old?.references.join(' / ') ?? '—', afterReference:next?.references.join(' / ') ?? '—',
      status:!old ? 'included' : !next ? 'removed' : deltaCents || referenceChanged ? 'changed' : 'unchanged'};
  });
  const delta = {grossCents:toCents(after.gross)-toCents(before.gross), discountsCents:toCents(after.discounts)-toCents(before.discounts), netCents:toCents(after.net)-toCents(before.net)};
  return {rows, delta, differentKinds:before.kind !== after.kind, reconciled:rows.reduce((sum,row)=>sum+row.impactCents,0)===delta.netCents};
}

const explanations = {
  '001':'Valor básico do cargo nesta folha fictícia, antes dos adicionais e descontos.',
  '021':'Adicional por tempo de serviço simulado sobre o vencimento básico.',
  '045':'Benefício de alimentação representado por um valor fixo na demonstração.',
  '090':'Pagamento pontual fictício incluído apenas na folha normal de setembro de 2026.',
  '091':'Gratificação fictícia incluída apenas na folha normal de outubro de 2026.',
  '101':'Parcela fictícia de remuneração correspondente a 20 dias de férias.',
  '102':'Adicional fictício de um terço sobre a remuneração de férias da demonstração.',
  '501':'Desconto previdenciário simplificado, exclusivamente para simular o comportamento da interface.',
  '502':'Desconto fictício de imposto de renda. Não utiliza tabelas fiscais ou regras reais.'
};

export function explainRubric(payment, entry, allPayments) {
  const base = (payment.earnings.find(e=>e.code==='001') ?? allPayments.find(p=>p.year===payment.year&&p.month===payment.month&&p.kind==='normal')?.earnings.find(e=>e.code==='001'))?.amount;
  let calculation = 'Memória de cálculo não disponível para esta rubrica.';
  if (['001','045','090','091','502'].includes(entry.code) || entry.code==='501' && payment.kind==='ferias') calculation = `Valor fixo definido na massa fictícia: ${money(entry.amount)}.`;
  if (base !== undefined) {
    if (entry.code==='021') calculation = `${money(base)} × 5% = ${money(entry.amount)}.`;
    if (entry.code==='501' && payment.kind==='normal') calculation = `${money(base)} × 11% = ${money(entry.amount)}.`;
    if (entry.code==='101') calculation = `${money(base)} × 20 ÷ 30 = ${money(entry.amount)} (arredondado para centavos).`;
    if (entry.code==='102') calculation = `${money(base)} × 20 ÷ 30 ÷ 3 = ${money(entry.amount)} (arredondamento no resultado final).`;
  }
  return {description:explanations[entry.code] ?? 'Descrição adicional ainda não cadastrada.', calculation, source:'Massa de dados fictícia da aplicação local. Não representa regras ou cálculos oficiais do RH.'};
}

export function filterDocuments(records, {year='',month='',kind='',query=''}={}) {
  const needle = normalize(query.trim());
  return records.filter(d=>(!year || d.year===Number(year)) && (!kind || d.kind===kind) && (!month || d.month===Number(month)) && (!needle || normalize(`${d.title} ${d.period} ${d.year} ${d.code}`).includes(needle)));
}
