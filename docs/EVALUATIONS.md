# Avaliações funcionais — evidência e simulação local

Levantamento em 02/11/2026. A conta autorizada voltou a exibir somente Holerites e Relatórios no contrato. A aba Avaliações não foi apresentada. Nenhum questionário, resposta ou operação de concordância foi enviado ao sistema original.

## Evidência pública adicional

A rota de ação identificada no bundle 7943 referencia o chunk **7858.506b380709260d58.js**, mapeado pelo runtime retido. O arquivo foi obtido sem autenticação, com 28.589 bytes e SHA-256 `0d88c9dd047d016f57e8dbeec6b743d5cec67763b95259f2716e41fe2295ae01`.

O REA concluiu a análise estática desse arquivo sem executá-lo. O bundle integral permanece somente em `evidence/evaluations-rea-bundle`. [evaluations-evidence.json](evaluations-evidence.json) registra sua identidade e âncoras em bytes UTF-8 dos achados. O componente de pergunta do bundle 7943 foi lido diretamente para confirmar seleção e observações.

O código público declara:

- Ações **Salvar** e **Salvar e Finalizar**, com confirmação antes da finalização.
- Perguntas de seleção única, possibilidade de limpar a resposta, pergunta obrigatória e observação exigida por determinadas opções.
- Limite de 4.000 caracteres para observação de pergunta e 255 para a observação geral na interface.
- Rascunho parcial e bloqueio da finalização quando faltam respostas obrigatórias ou observações exigidas.
- Leitura sem edição para situação concluída ou visualização somente leitura.
- Exibição de nota, pesos e modos soma/média parametrizados; nota mínima e indicação de aptidão no componente original.
- Etapas de questionário e concordância, botões de concordar/discordar definidos por dados, consulta de fluxos anteriores e arquivos anexados.

Essas são declarações do frontend. Não comprovam as regras efetivamente aplicadas pelo backend, a disponibilidade por conta, a integridade dos documentos ou os efeitos administrativos das ações.

## Implementação da demonstração

A aba **Avaliações** é acessível pelo contrato e pela página inicial. Há seis exemplos fictícios em `data/demo.json`:

| Exemplo | Estado inicial | Finalidade |
| --- | --- | --- |
| `demo-eval-1` | Pendente | Preencher, salvar parcialmente e finalizar um questionário. |
| `demo-eval-2` | Minha concluída | Consulta de uma avaliação pessoal concluída. |
| `demo-eval-3` | Respondida | Consulta de respostas fictícias anteriores. |
| `demo-eval-4` | Ciência pendente | Testar concordância/discordância local sobre respostas já apresentadas. |
| `demo-eval-5` | Pendente | Preencher exemplo com média ponderada, pesos 2 e 1 e máximo 5. |
| `demo-eval-6` | Preenchimento | Anexar arquivos e percorrer revisão, devolução e ciência fictícias. |

As três seções reproduzem os rótulos identificados no original: **Pendentes**, **Minhas Concluídas** e **Respondidas**. O enquadramento dos exemplos nas seções é uma regra local explícita, não uma recuperação das regras reais do RH. Há busca por matrícula/nome, seleção de 10 a 50 itens por página e estado vazio.

O backend Rust valida identidade de pergunta e opção, limites de observação e completude na finalização. Rascunhos aceitam respostas parciais. A transação PostgreSQL é responsável por salvar e finalizar; uma resposta finalizada não pode ser sobrescrita por outro envio. Concordância e discordância são exclusivamente simulações sobre a massa fictícia. O seletor de papéis do portal continua sem valor de autenticação de produção.

O servidor Rust é o único responsável pelo cálculo. A nota usa soma de pontos × pesos nos exemplos 1–4 e média ponderada no exemplo 5. O divisor da média é a soma dos pesos de todas as perguntas; perguntas não respondidas contribuem com zero e são identificadas como pendentes. O mesmo cálculo fornece nota, máximo e memória por pergunta na prévia, no salvamento, na consulta e no relatório HTML. A exibição usa até duas casas decimais. Não há classificação de aptidão nem uso para decisões funcionais.

Selecionar ou limpar uma resposta consulta uma prévia sem persistir o formulário. A prévia aceita respostas parciais, mas a finalização continua exigindo perguntas obrigatórias e observações condicionais. A interface ignora respostas de rede ultrapassadas e mostra falha com recuperação quando a prévia não pode ser calculada. Somente Salvar rascunho ou Salvar e Finalizar persiste respostas.

Persistência: migração aditiva `003_evaluations.sql`, tabela `demo_evaluation_responses`. Operações `evaluation.draft`, `evaluation.finalized` e `evaluation.agreement` são registradas na auditoria local. Finalização e ciência podem gerar aviso na categoria de atendimento, conforme a preferência existente. A consulta e o relatório HTML usam as respostas persistidas, escapando o texto informado.

Endpoints locais:

- `GET /api/evaluations`
- `GET /api/evaluations/{id}`
- `POST /api/evaluations/{id}/preview`: apenas respostas; consulta sem escrita nem eventos.
- `POST /api/evaluations/{id}/answers`: respostas, observação e indicador de finalização.
- `POST /api/evaluations/{id}/agreement`: decisão booleana e observação.

## Limites remanescentes

Os períodos de liberação mostrados são informativos na massa fictícia. Os anexos e um fluxo fixo local foram acrescentados na entrega 7. Fluxos configuráveis de múltiplos participantes, cabeçalho/rodapé personalizados, editor de regras de cálculo, nota mínima, aptidão e PDF oficial não foram reproduzidos. O relatório local é HTML; a implementação não é uma assinatura ou uma decisão administrativa.

Perguntas, textos, opções, notas e pessoas são fictícios. Nenhum dado real de avaliação foi usado. A equivalência integral ainda exige inspeção com uma conta que disponibilize a área e validação das regras pelo responsável.

## Verificação executada

Foram aprovados 31 testes: 6 Rust, incluindo integração PostgreSQL em schema isolado, e 25 JavaScript. Cobrem rascunho incompleto, finalização, observação obrigatória, limites de texto, resposta/pergunta inválida, pontuação controlada pelo servidor, bloqueio após finalização, ciência local e persistência após reconexão. A análise Clippy e a formatação passaram.

No navegador local foram conferidos: rascunho parcial, erro de pergunta obrigatória, erro de observação exigida, finalização com nota simulada 7, campos bloqueados depois de concluir, aviso gerado, confirmação/cancelamento da ciência e download HTML. O arquivo baixado foi conferido: estilos embutidos, conteúdo fictício e nenhum script. Em 390 pixels, a lista foi inspecionada e a largura do documento não ultrapassou a janela. O ajuste temporário de tamanho foi restaurado.

O exemplo `demo-eval-1` foi finalizado durante a verificação manual desta instalação; seu resultado fica disponível em Respondidas. `demo-eval-4` permanece pendente. Uma instalação nova, sem o banco desta máquina, começa com os estados da massa base.

## Verificação da entrega 6

35 testes passaram: 8 Rust e 27 JavaScript. O fluxo real com PostgreSQL confirmou que a prévia não altera o questionário nem a auditoria e produz a mesma memória que o rascunho salvo. Os testes cobrem soma, média com pesos diferentes, respostas parciais, rejeição de pontos/finalização enviados pelo cliente, identidades inválidas, erro de regra, escape de texto e respostas de rede fora de ordem. Clippy, formatação e compilação passaram.

No navegador: prévia parcial e completa, nota 4 de 5 e memória `12 / 3`, recarregamento sem salvar, rascunho, seleção por teclado e memória em 390 pixels. A base desta máquina contém um rascunho de teste em `demo-eval-5`. Não houve operação no portal original nesta entrega. A inspeção original continua limitada à evidência pública já registrada.

## Entrega 7: anexos e fluxo local

O exemplo `demo-eval-6` usa `workflowEnabled: true`. A etapa persistida é a fonte das permissões de edição; os demais exemplos mantêm suas regras anteriores. Etapas locais: `filling` → `review` → `acknowledgment` → `completed`. O RH simulado pode devolver de `review` para `filling` com motivo obrigatório. Na ciência, concordância e discordância levam a `completed`, com decisão preservada. Não há assinatura, efeito funcional, tramitação oficial ou regra de aptidão.

Questionário e anexos só podem ser alterados durante o preenchimento; os papéis são verificados no servidor a partir do seletor de demonstração. Etapas e gravações compartilham o bloqueio transacional da resposta. Não é um controle de identidade de produção. O histórico registra eventos novos a partir desta implantação; não inventa o histórico dos exemplos concluídos anteriormente e não constitui versionamento integral de todas as respostas anteriores.

Anexos são bytes no PostgreSQL: até cinco arquivos de 2 MiB por avaliação. PDF é admitido por extensão e cabeçalho; TXT exige UTF-8 sem NUL. Não há renderização inline, verificação completa de PDF, análise antimalware, exclusão ou substituição. O download valida a associação entre avaliação e anexo e usa nome codificado e cabeçalhos de download. O HTML de relatório relaciona os arquivos; não os incorpora nem garante sua disponibilidade fora do portal.

As rotas e o roteiro estão na seção Entrega 7 do README. A migração `004_evaluation_workflow.sql` é aditiva e idempotente. Inclui `workflow_stage`, `demo_evaluation_attachments` e `demo_evaluation_events`. Transições podem gerar avisos segundo as preferências de atendimento; gravações, anexos e downloads registram auditoria local.

### Verificação executada na entrega 7

45 testes passaram: 10 Rust e 35 JavaScript. O teste com PostgreSQL real cobre fluxo completo, limites, tipos, bytes, cabeçalhos, isolamento do anexo por avaliação, papéis, etapas inválidas, devolução, finalização e persistência após reconexão. Os módulos da interface cobrem ações por papel, escape de texto, preservação do formulário durante upload, confirmação e recuperação de atualização da lista. Clippy, formatação e compilação passaram.

Na API do processo local foi enviado um TXT fictício de 111 bytes e confirmado o download idêntico (SHA-256 `6907dc2d16fe057225140318ec1400737071d8f47bdaef789f600b4b280986d2`). O exemplo 6 foi enviado, devolvido, reenviado, encaminhado à ciência e concluído com concordância. Ele permanece concluído nesta instalação, com um anexo e seis eventos. Nenhuma operação foi enviada ao original.

O navegador integrado recusou acesso nesta etapa; a nova interface não teve conferência visual nem teste integral de teclado/celular. Essa limitação é distinta da aprovação dos módulos e da API.
