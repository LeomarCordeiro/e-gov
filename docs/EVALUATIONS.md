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

A aba **Avaliações** é acessível pelo contrato e pela página inicial. Há quatro exemplos fictícios em `data/demo.json`:

| Exemplo | Estado inicial | Finalidade |
| --- | --- | --- |
| `demo-eval-1` | Pendente | Preencher, salvar parcialmente e finalizar um questionário. |
| `demo-eval-2` | Minha concluída | Consulta de uma avaliação pessoal concluída. |
| `demo-eval-3` | Respondida | Consulta de respostas fictícias anteriores. |
| `demo-eval-4` | Ciência pendente | Testar concordância/discordância local sobre respostas já apresentadas. |

As três seções reproduzem os rótulos identificados no original: **Pendentes**, **Minhas Concluídas** e **Respondidas**. O enquadramento dos exemplos nas seções é uma regra local explícita, não uma recuperação das regras reais do RH. Há busca por matrícula/nome, seleção de 10 a 50 itens por página e estado vazio.

O backend Rust valida identidade de pergunta e opção, limites de observação e completude na finalização. Rascunhos aceitam respostas parciais. A transação PostgreSQL é responsável por salvar e finalizar; uma resposta finalizada não pode ser sobrescrita por outro envio. Concordância e discordância são exclusivamente simulações sobre a massa fictícia. O seletor de papéis do portal continua sem valor de autenticação de produção.

A nota apresentada é a soma de pontos e pesos **dos exemplos locais**, calculada pelo servidor. Não há classificação de aptidão nem uso para decisões funcionais. A interface mostra a nota do último salvamento, sem simular a prévia dinâmica do original.

Persistência: migração aditiva `003_evaluations.sql`, tabela `demo_evaluation_responses`. Operações `evaluation.draft`, `evaluation.finalized` e `evaluation.agreement` são registradas na auditoria local. Finalização e ciência podem gerar aviso na categoria de atendimento, conforme a preferência existente. A consulta e o relatório HTML usam as respostas persistidas, escapando o texto informado.

Endpoints locais:

- `GET /api/evaluations`
- `GET /api/evaluations/{id}`
- `POST /api/evaluations/{id}/answers`: respostas, observação e indicador de finalização.
- `POST /api/evaluations/{id}/agreement`: decisão booleana e observação.

## Limites remanescentes

Os períodos de liberação mostrados são informativos na massa fictícia. Upload e download de anexos, fluxos configuráveis de múltiplos participantes, cabeçalho/rodapé personalizados, média parametrizada, nota mínima, aptidão e PDF oficial não foram reproduzidos. O relatório local é HTML; a implementação não é uma assinatura ou uma decisão administrativa.

Perguntas, textos, opções, notas e pessoas são fictícios. Nenhum dado real de avaliação foi usado. A equivalência integral ainda exige inspeção com uma conta que disponibilize a área e validação das regras pelo responsável.

## Verificação executada

Foram aprovados 31 testes: 6 Rust, incluindo integração PostgreSQL em schema isolado, e 25 JavaScript. Cobrem rascunho incompleto, finalização, observação obrigatória, limites de texto, resposta/pergunta inválida, pontuação controlada pelo servidor, bloqueio após finalização, ciência local e persistência após reconexão. A análise Clippy e a formatação passaram.

No navegador local foram conferidos: rascunho parcial, erro de pergunta obrigatória, erro de observação exigida, finalização com nota simulada 7, campos bloqueados depois de concluir, aviso gerado, confirmação/cancelamento da ciência e download HTML. O arquivo baixado foi conferido: estilos embutidos, conteúdo fictício e nenhum script. Em 390 pixels, a lista foi inspecionada e a largura do documento não ultrapassou a janela. O ajuste temporário de tamanho foi restaurado.

O exemplo `demo-eval-1` foi finalizado durante a verificação manual desta instalação; seu resultado fica disponível em Respondidas. `demo-eval-4` permanece pendente. Uma instalação nova, sem o banco desta máquina, começa com os estados da massa base.
