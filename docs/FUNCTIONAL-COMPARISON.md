# Comparação funcional — portal original e demonstração ArquimetrIA

Levantamento em 01/11/2026. Escopo: Área do Servidor e contrato da conta autorizada; inspeção visual somente de leitura, complementada por análise estática com REA dos scripts públicos. Nenhuma avaliação, solicitação ou pesquisa foi enviada no sistema original. Nenhum identificador de conta ou conteúdo do relatório original é reproduzido aqui.

## Resultado da inspeção autenticada

No contrato da conta inspecionada, apareceram **Holerites e Relatórios**. As abas **Consignação e Avaliações não apareceram**, assim como a aba de linha do tempo **Vida Funcional**. Isso descreve a navegação dessa conta; não estabelece que as funcionalidades sejam inexistentes no produto ou inacessíveis a todas as contas.

Em **Relatórios**, havia o item **Portal Servidor - Vida Funcional**. A emissão apresentou estado de carregamento e abriu o visualizador com **Imprimir** e **Baixar**. O conteúdo e a fidelidade do documento não foram auditados. A vida funcional como relatório é diferente da linha do tempo funcional implementada na demonstração.

Também foi observado **Ver minhas solicitações**. Portanto, não se deve apresentar solicitações como recurso ausente no produto original. O atendimento da demonstração é uma implementação própria, cujas etapas não foram comparadas com o atendimento original.

A página original exibiu versão **8.4.11**. Os nomes de `main` e `runtime` carregados correspondem aos nomes da captura pública retida; isso não substitui nova verificação dos bytes de todos os chunks.

## Matriz

**Parcial** significa comportamento reconstruído com lacunas de comparação. **Ausente** significa não implementado na demonstração. **Evolução local** significa recurso próprio, sem afirmação de ausência no original. Nenhuma linha abaixo atesta equivalência integral de backend, cálculos ou documentos.

| Função | Evidência no original | Demonstração atual | Resultado |
| --- | --- | --- | --- |
| Painel e seleção do contrato | Inspeção inicial e atual; últimos pagamentos e contrato | Perfil fictício e atalhos | Parcial: arquitetura visual semelhante, conteúdo fictício. |
| Holerites | Lista de competências, folhas, totais, expansão; paginação no código público | Lista, filtros, eventos, recibos | Parcial: filtros locais adicionais; validar todos os estados e arquivos. |
| Emissão de holerite | Serviço de PDF declarado no código público | HTML e impressão para salvar PDF | Diferente: não reproduz o gerador de PDF original. |
| Comprovantes anuais | Agrupamento anual, emissão, não liberado/indisponível no código público | Dados fictícios anuais, HTML/CSV/impressão | Parcial: disponibilidade anual original não modelada em todas as suas variantes. |
| Validação de documentos | Formulário e estados válido/inválido no código público | Apenas códigos fictícios locais | Parcial na interface; sem validade/autenticação oficial. |
| Vida funcional em linha do tempo | Declarada no bundle; aba não visível nesta conta | Linha do tempo com filtros e documentos fictícios | Reconstrução orientada pelo código, sem validação nesta conta. |
| Vida funcional como relatório | Item e abertura do visualizador observados nesta conta | Catálogo local e relatório do vínculo/vida funcional em HTML e impressão | Parcial: emissão simulada, gerador de PDF e conteúdo oficial não reproduzidos. |
| Consignação | Margens, base e estado vazio declarados; aba não visível nesta conta | Valores fixos fictícios, grupos opcionais e competências de teste | Reconstrução orientada pelo código; execução original não verificada nesta conta. |
| Relatórios genéricos | Lista do serviço, emissão e visualizador; um item disponível nesta conta | Catálogo local em aba própria e prévia/HTML/impressão | Parcial: apenas um relatório fictício, sem integração ao catálogo oficial. |
| Avaliações funcionais | Listas, questionários e operações declaradas; aba não visível nesta conta | Questionário, prévia/memória da nota, soma/média ponderada, anexos e fluxo local de revisão/devolução/ciência | Parcial: regras oficiais e fluxo parametrizado pendentes; não confundir com pesquisa de satisfação. |
| Solicitações | Botão de acesso observado; etapas internas fora deste levantamento | Protocolos, mensagens, RH simulado e histórico | Evolução local; equivalência com o atendimento original desconhecida. |
| Comparação de holerites e rubricas | Ausência no original não estabelecida | Comparação e memórias fictícias | Evolução local. |
| Central de documentos e liberação simulada | Ausência no original não estabelecida | Busca, ZIP e documentos funcionais | Evolução local. |
| Avisos e preferências | Botão de notificações observado; regras não comparadas | Avisos persistentes e preferências locais | Evolução local; sem equivalência de canais ou regras. |
| Contraste e fonte | Implementação local já existente | Controles de contraste/fonte e preferências | Recurso local; revisão integral de acessibilidade pendente. |
| VLibras | Widget oficial observado e indicado pelo usuário | Integração oficial sob ativação, com internet | Verificação específica registrada no README; dependência externa. |
| Pesquisa de satisfação | Formulário 1–5 observado e indicado pelo usuário | Pesquisa própria, respostas em PostgreSQL | Reprodução do fluxo visual com persistência local, sem integração ao PostHog. |

## Consignação — contrato declarado no código público

A aba `consignacao` apresenta **Limite de Consignação (%)**, **Margem Bruta**, **Valor Disponível**, mês/ano dos dados, **Consignados Existentes** e **Bases de Cálculo** com total. Os grupos são condicionais à presença de dados. Há estado vazio **Nenhuma consignação encontrada** e carregamento.

O serviço declara `GET <apiUrl>/oxy/folha-pagamento/margem-consignacao/{funcionarioId}`. A interface consome `margemConsignacao`, `margemBruta`, `margemDisponivel`, `mes`, `ano`, `consignadosExistentes` e `baseCalculos`.

A exibição depende de `OXY_MARGEM_CONSIGNADO` e da entidade. A razão exata de a aba não aparecer na conta é desconhecida. O frontend mostra valores recebidos; **não estabelece a regra que calcula a margem**. Nenhuma fórmula real deve ser inferida dos rótulos.

## Relatórios — observado e declarado

A aba `relatorios` consulta a lista por entidade e funcionário. Cada item usa `name` e `report`; clicar gera um arquivo com estado de carregamento e abre um visualizador de PDF. O código declara mensagem de lista vazia **Nenhum relatório encontrado!** e erro de geração solicitando contato com o responsável.

Serviços declarados:

- `GET <apiUrl>/oxy/folha-pagamento/reports/{entidade}?funcionarioId={id}`
- `GET <apiUrl>/oxy/folha-pagamento/report/{entidade}/{report}?funcionarioId={id}`, resposta blob.

O catálogo é fornecido pelo serviço; não é uma lista fixa recuperável apenas dos nomes das abas. `OXY_SERVIDOR_RELATORIOS` condiciona disponibilidade. Nesta conta, um único item foi observado e sua abertura foi confirmada. Outros tipos, parâmetros adicionais, limites e conteúdo final continuam desconhecidos.

## Avaliações — apenas código público

A aba `avaliacoes`, condicionada a `OXY_AVALIACAO_FUNCIONAL`, instancia a lista quando é acessada. Os rótulos são **Pendentes**, **Minhas Concluídas** e **Respondidas**; nomes internos dos estados diferem dos rótulos. Há filtro por matrícula/nome nas listas aplicáveis, página inicial de 10 e opções de 10 a 50, carregamento e estado **Nenhuma avaliação encontrada**.

Campos declarados: matrícula, funcionário, cargo, questionário, situação, início/fim de período, número da avaliação e início/fim de liberação. Ações incluem abrir questionário e emitir relatório conforme a seção. O questionário é carregado pelo chunk adicional **7858**. Ele foi analisado na entrega 5; detalhes e limites estão em [EVALUATIONS.md](EVALUATIONS.md).

O serviço declara consultas separadas para pendentes, pessoais e concluídas; consulta por avaliação/fluxo; questionário de preenchimento e de visualização; operações `salvar-questionario`, `tramitar-fluxo` e `concordar`. Essas operações **não foram chamadas**. Regras de notas, permissões por avaliador, editabilidade, concordância e efeitos funcionais permanecem desconhecidos. A simulação futura deve ser explicitamente fictícia e independente dessas operações reais.

## Evidência e limites

[functional-evidence.json](functional-evidence.json) registra URLs públicas, hashes SHA-256, posições de âncoras em bytes UTF-8 e o identificador de Evidence do REA. O bundle completo fica somente em `evidence/remaining-areas-rea-bundle-authorized`, ignorado pelo Git. A inspeção focada dos trechos é análise direta dos arquivos públicos; a observação visual é evidência de execução distinta da análise estática do REA.

A análise REA terminou com sucesso para dois arquivos selecionados. Seu grafo atingiu o limite de retenção semântica por arquivo; outros arquivos inventariados não foram analisados. Assim, não se usa ausência no grafo como prova de ausência de uma função. As constatações específicas foram conferidas nas âncoras dos scripts.

Não foram retidos no repositório dados pessoais da sessão, URLs com identificadores da conta, conteúdo do PDF ou credenciais. A matriz é uma comparação de cobertura, não uma certificação de equivalência.

## Próxima implementação orientada pelo levantamento

1. **Implementado localmente:** Relatórios com catálogo fictício, item de vida funcional, geração, erros e exportação HTML/impressão. Gerador e conteúdo oficial continuam pendentes de comparação.
2. **Implementado localmente:** Consignação com valores fixos fictícios, grupos presentes/ausentes e período sem dados; sem inferir a fórmula oficial.
3. **Núcleo de Avaliações implementado localmente** após análise pública do questionário. A conta não expõe a aba; validar execução original, anexos e regras com uma conta autorizada que os disponibilize.
4. Conferir os estados originais de indisponibilidade de comprovantes, navegação e documentos. Ampliar testes de navegador por função, incluindo teclado e celular.

As integrações oficiais e a autenticação de produção seguem um trabalho separado, dependente de contratos e acesso fornecidos pelos responsáveis.

## Estado após a entrega 4

A coluna da demonstração foi atualizada para incluir Relatórios e Consignação. Os fatos da inspeção original permanecem os mesmos. Essas implementações locais foram verificadas por testes e HTTP; a revisão visual das novas telas segue pendente devido ao bloqueio informado pela ferramenta de navegador. Avaliações funcionais continua sem implementação.

## Estado após a entrega 5

Avaliações funcionais agora conta com uma simulação local persistente, orientada pela evidência pública adicional registrada em [evaluations-evidence.json](evaluations-evidence.json). As perguntas, pontos e decisões são fictícios. Não se afirma reprodução dos questionários específicos do RH. A implementação continua parcial em anexos e tramitação oficial.

A verificação no navegador local foi retomada: questionário, leitura após concluir, exportação, confirmação da ciência e lista em 390 pixels; também foram conferidos a prévia do relatório funcional e a consulta de Consignação com dados e sem dados. Isso reduz a pendência visual da entrega anterior, sem substituir revisão integral de acessibilidade nem comparação com funções originais indisponíveis na conta.

## Atualização da entrega 7

Anexos PDF/TXT e um fluxo fixo local foram implementados no exemplo `demo-eval-6`, com persistência, histórico e avisos. Tipos, limites e transições são escolhas da demonstração, não regras recuperadas do backend original. Não houve nova inspeção do original nesta entrega. A API e os módulos foram testados; a conferência visual ficou indisponível. Veja [EVALUATIONS.md](EVALUATIONS.md).
