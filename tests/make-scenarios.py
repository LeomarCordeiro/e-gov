"""Generate REA scenarios that operate only on the fictional local application."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
origin='http://127.0.0.1:4173'
def action(name,kind,selector=None,**extra):
    result={'step_id':name,'action':kind,'timeout_ms':10000,**extra}
    if selector:result['locator']={'kind':'css','selector':selector}
    return result
def wait(name,selector):
    selector={'.payment-card':'.payment-card:first-of-type','.payslip':'.payslip:first-child','.timeline-item':'.timeline-item:first-child','.income-year':'.income-year:first-child'}.get(selector,selector)
    return action(name,'wait_for',selector,state='visible')
def click(name,selector):return action(name,'click',selector)
def value(name,kind,selector,text):return action(name,kind,selector,value={'source':'literal','value':text})
def goto(name,path):return action(name,'goto',destination={'url':origin+path},wait_until='load')
base={'browser':{'mode':'launch','executable_path':'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','headless':True},'start_url':{'url':origin+'/governo-digital/servidor'},'environment':{'viewport':{'width':1285,'height':959},'locale':'pt-BR','timezone':'America/Sao_Paulo'}}
def write(name,actions,width=1285,height=959,each=False):
    scenario={**base,'environment':{**base['environment'],'viewport':{'width':width,'height':height}},'actions':actions,'capture':{'at_end':['screenshot','accessibility','url'],'after_each_step':['accessibility'] if each else []}}
    (root/'tests'/name).write_text(json.dumps(scenario,ensure_ascii=False,indent=2),encoding='utf-8')
write('desktop.scenario.json',[wait('dashboard-ready','.payment-card')])
write('mobile.scenario.json',[wait('mobile-dashboard-ready','.payment-card')],390,844)
steps=[wait('dashboard-ready','.payment-card'),click('open-payments','.service-link[data-route="holerites"]'),wait('payments-ready','.payslip'),click('expand-payment','.payslip:first-child summary'),wait('receipt-items','.payslip:first-child .receipt-details'),click('receipt-dialog','.payslip:first-child [data-receipt]'),wait('receipt-ready','#modal[open] [data-print-receipt]'),click('close-receipt','#close-modal'),value('empty-month','select_option','#month','12'),click('apply-empty-filters','#payment-filters button[type="submit"]'),wait('empty-result','#payment-results .empty'),click('clear-filters','#clear-filters'),wait('pagination-ready','#load-more'),click('load-next-page','#load-more'),wait('page-two','.payslip:nth-child(24)'),click('functional-history','.tabs [data-route="history"]'),wait('history-ready','.timeline-item'),goto('income-page','/governo-digital/servidor/comprovante-rendimento'),wait('income-ready','.income-year'),click('emit-income','[data-income="2026"]'),wait('income-document','#modal[open] [data-csv="2026"]'),click('close-income','#close-modal'),goto('validation-page','/governo-digital/oxy/validar-autenticacao-relatorios'),wait('validation-ready','#verification-code'),click('fill-example','#use-demo-code'),click('validate-code','#verify-button'),wait('valid-result','.verify-result:not(.invalid)'),value('invalid-code','fill','#verification-code','NOT-A-REAL-CODE'),click('validate-invalid','#verify-button'),wait('invalid-result','.verify-result.invalid'),click('search-dialog','#open-search'),value('search-service','fill','#service-search','vida'),wait('search-match','#search-results [data-route="history"]'),click('search-navigation','#search-results [data-route="history"]'),wait('search-destination','.timeline'),click('accessibility-options','#accessibility'),click('contrast-on','#toggle-contrast'),wait('contrast-enabled','body.contrast'),click('contrast-reset','#reset-accessibility'),click('close-accessibility','#close-modal'),goto('return-home','/governo-digital/servidor'),wait('final-dashboard','.payment-card')]
write('flows.scenario.json',steps,each=True)
print('Created desktop, mobile and 40-step local flow scenarios.')
