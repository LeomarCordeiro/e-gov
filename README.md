# e-gov — ArquimetrIA

Portal do Servidor local, com backend **Rust**, banco **PostgreSQL em Docker** e dados inteiramente fictícios. Reconstrução orientada por observações com o REA, seguida de evoluções próprias. Não é o portal oficial e não se comunica com o RH da prefeitura.

## Iniciar no Windows

Pré-requisitos: Rust/Cargo (edição 2024; validado com Rust 1.96), Docker Desktop em execução com contêineres Linux e PowerShell. Node.js é opcional, usado apenas para testar os módulos JavaScript do navegador.

Abra `Iniciar.cmd` ou execute nesta pasta:

```powershell
powershell -NoProfile -File scripts/setup-local.ps1
cargo run --locked
```

O script cria `.env` com uma senha aleatória somente se o arquivo ainda não existir e inicia o PostgreSQL dedicado. Não modifica outros contêineres. A primeira compilação pode baixar dependências do Cargo.

Abra [o portal local](http://127.0.0.1:4173/governo-digital/servidor). Mantenha o terminal aberto; `Ctrl+C` encerra o servidor. Ele escuta somente em `127.0.0.1`. A API `/api/health` identifica Rust/PostgreSQL e verifica a conexão com o banco.

## Funcionalidades

| Área | Recursos |
| --- | --- |
| Holerites | 37 pagamentos fictícios de 2024 a outubro de 2026, filtros, recibos, download HTML e impressão/PDF. |
| Comparação | Inclusões, remoções, valores e referências alteradas; impacto no líquido e inversão dos períodos. |
| Rubricas | Descrição, referência e memória de cálculo fictícia; indicação explícita quando indisponível. |
| Documentos | 45 registros: 37 holerites, 3 comprovantes e 5 documentos funcionais. Busca, filtros, prévia e ZIP com HTML/CSS. |
| Avaliações funcionais | Listas, questionário fictício, prévia da nota, soma/média ponderada, memória de cálculo, rascunho, finalização, consulta, ciência simulada e relatório HTML. |
| Relatórios | Catálogo fictício, relatório do vínculo e vida funcional, prévia, HTML e impressão/PDF. |
| Consignação | Margens e bases fictícias por competência; exemplos completos, sem detalhamento e sem dados. |
| Vida funcional | Filtros por datas, tipo e texto; evento vinculado ao documento e à solicitação ao RH. |
| Solicitações ao RH | Protocolo, vínculo com holerite/evento, mensagens, histórico, resposta simulada, conclusão e reabertura. |
| Avisos | Documentos liberados e andamento de solicitações; leitura persistente e preferências para novos avisos. |
| Auditoria local | Registro de alterações do atendimento, preferências, leitura de avisos e acesso/liberação de documentos funcionais. Consulta dos últimos 100 eventos no modo RH. |

A identidade fictícia é **Ana Silva — DEMO-001**. Setembro e outubro de 2026 apresentam uma diferença líquida intencional de **R$ 120** para demonstrar a comparação. Os demonstrativos de 2026 são parciais até outubro.

A interface distingue filtro sem registros, documento ainda não liberado e falha na consulta. Há um documento funcional inicialmente pendente. Documentos pendentes não podem ser baixados nem incluídos no ZIP.

## Experimentar o atendimento e a liberação

1. Em **Vida Funcional**, abra um evento e use **Perguntar ao RH**; também há esse botão nos holerites.
2. Informe somente dados fictícios e registre o protocolo.
3. Na página de solicitações, altere **Simulação local — visualizar como** para **RH (simulado)**. Inicie a análise e registre uma resposta.
4. Volte ao modo **Servidor**, leia a resposta e conclua ou reabra o atendimento.
5. Em **Vida Funcional**, no modo RH, abra o evento com documento pendente e use **Liberar documento fictício**. O documento passa a estar disponível e gera aviso quando essa preferência está ativa.
6. Abra o sino do cabeçalho para consultar avisos, marcá-los como lidos e ajustar preferências. No modo RH, essa tela também permite consultar a auditoria local.

O seletor de papéis **não é autenticação nem controle de acesso de produção**. Ele apenas permite testar os dois lados do fluxo local; qualquer pessoa com acesso ao computador pode alterná-lo. Não há envio de e-mails, SMS ou mensagens ao município.

A validação aceita somente códigos da demonstração, como `DEMO-202610-N-001`, `DEMO-IR-2025-001` e códigos funcionais de documentos disponíveis. Os documentos não têm validade oficial. PDF usa a impressão do navegador; download direto e ZIP contêm HTML/CSS.

## Persistência e operação local

- PostgreSQL: `postgres:18-alpine`, porta do host **127.0.0.1:55437**.
- Projeto Compose: `arquimetria-portal`; contêiner: `arquimetria-portal-db-1`.
- Volume persistente: `arquimetria-portal_portal_pgdata`.
- Credenciais: `.env`, ignorado pelo Git e excluído da entrega. Preserve esse arquivo junto com o volume local; regenerar a senha não altera uma base já inicializada.
- Solicitações, mensagens, eventos, avisos, preferências, liberações e auditoria ficam no PostgreSQL.
- Perfil, pagamentos, comprovantes e eventos base são a massa fictícia imutável em `data/demo.json`.
- Preferências de acessibilidade ficam no navegador; o papel simulado vale para a sessão da aba.

`docker compose stop db` interrompe o banco sem apagar o volume; `docker compose up -d --wait db` o reinicia. Reinicie também o portal se a conexão com o banco tiver sido interrompida. As migrações iniciais são idempotentes e executadas ao iniciar. Para mudar a porta HTTP, defina `PORT` antes de `cargo run` ou ajuste `.env`.

## Estrutura e verificação

- `src/main.rs`: servidor Axum, API local, transações e consultas parametrizadas.
- `migrations/001_portal.sql`: esquema inicial PostgreSQL.
- `data/demo.json`: única fonte dos dados fictícios base.
- `app.js`, `delivery-ui.js`, `workflow-ui.js` e CSS: interface do navegador.
- `delivery.js`, `zip.js`: comparação, explicação de rubricas, filtros e arquivos ZIP.
- `public-assets/`: marca ArquimetrIA fornecida pelo usuário, imagem municipal e fontes usadas na reconstrução.
- `src/tests.rs`, `tests/*.test.mjs`: testes do backend e dos módulos de interface.

```powershell
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked -- --include-ignored
node tests/delivery.test.mjs
node tests/workflow.test.mjs
node tests/feedback.test.mjs
node tests/contract.test.mjs
node tests/evaluations.test.mjs
```

O teste de integração precisa do banco local preparado. Ele cria um schema exclusivo, testa os handlers reais com PostgreSQL e o remove ao final, sem alterar as tabelas de demonstração. Testa reconexão, migração idempotente, fluxo de atendimento, documentos, preferências, leitura de avisos, auditoria e limites de acesso aos arquivos.

Nesta entrega passaram **31 testes**: 6 Rust (incluindo integração PostgreSQL) e 25 JavaScript. Compilação, `cargo fmt --check` e Clippy sem avisos também verificados. A API em execução respondeu com saúde válida. Nesta etapa, o navegador voltou a estar disponível: foram conferidos o carregamento e a abertura do avatar VLibras, envio local da pesquisa, resumo no RH, persistência após recarregar e ativação/restauração de fonte e contraste. Uma revisão integral dos fluxos, dispositivos e navegação por teclado permanece pendente. Os cenários REA em `tests/*.scenario.json` são roteiros anteriores, não comprovam aprovação desses fluxos novos.

## Antes do uso real

Ainda são necessários autenticação oficial, identificação e isolamento por usuário/órgão, permissões no servidor, contratos e integração com APIs oficiais, política de operação e backup do banco, auditoria de produção e validação dos cálculos/documentos pelo RH. A auditoria desta demonstração não cobre todas as consultas nem constitui trilha inviolável. Não existem essas garantias no seletor de papéis local.

## Repositórios e arquivos locais

O projeto foi registrado na seção Projetos como **REA**. O código do portal possui repositório Git próprio em [LeomarCordeiro/e-gov](https://github.com/LeomarCordeiro/e-gov), separado do upstream do REA.

- REA: `C:\Users\leoma\Documents\ChatGPT\REA`
- Portal e-gov: `C:\Users\leoma\Documents\ChatGPT\REA\projects\sarandi-servidor`

Materiais de investigação (`evidence/`, `.browser-profile/`), credenciais, banco, dependências e binários compilados não integram o Git nem o ZIP. Veja [RECONSTRUCTION.md](RECONSTRUCTION.md) para a origem e os limites das observações. As evoluções são funcionalidades locais propostas pelo usuário, não afirmações sobre o que existe no sistema original.

## Libras e pesquisa de satisfação

**VLibras:** use **Ativar VLibras**, na lateral. Após o carregamento, o botão é substituído pelo ícone oficial azul. Abra o tradutor para usar o avatar e seus controles. Feche a janela do tradutor para voltar à interação normal com os controles do portal. Contraste e aumento de fonte continuam no botão de acessibilidade separado.

A integração segue a [documentação oficial](https://vlibras.gov.br/doc/widget/installation/webpageintegration.html). O serviço precisa de internet: o navegador carrega recursos de `vlibras.gov.br` e seu CDN e a tradução pode enviar o texto selecionado aos serviços VLibras. Não é uma tradução offline nem um mecanismo próprio em Rust. O servidor/API continuam em Rust. Se o serviço estiver indisponível, a interface informa o erro; o restante do portal pode ser utilizado.

**Pesquisa:** abra **Avaliar experiência** no rodapé. A pesquisa também pode aparecer após um download, quando não há modal aberto. Notas de 1 a 5 são opcionais; fechar não envia resposta. A confirmação é lembrada por navegador. Respostas e a página avaliada são salvas em `satisfaction_feedback` no PostgreSQL. Não é coletado texto livre nem são enviados dados ao PostHog. A API usa um identificador de envio para evitar duplicação em tentativas repetidas; não é autenticação nem garantia de uma resposta por pessoa.

Em **Avisos e preferências**, selecione **RH (simulado)** e abra **Avaliações da experiência** para ver contagem, média e distribuição das notas. Isso é pesquisa de usabilidade; não corresponde ao módulo de avaliação funcional do servidor original.

A migração aditiva `002_feedback.sql` é aplicada ao iniciar; as respostas ficam no mesmo volume persistente local. O teste de integração valida limites de nota, contexto, reenvio sem duplicação, conflitos, acesso ao resumo e persistência. Uma nota fictícia 4 foi registrada manualmente durante o teste do navegador e integra a base de demonstração local.

## Levantamento de equivalência

Veja a [matriz de comparação funcional](docs/FUNCTIONAL-COMPARISON.md) e sua [proveniência](docs/functional-evidence.json). A inspeção autenticada mostrou Holerites e Relatórios no contrato, incluindo emissão de **Portal Servidor - Vida Funcional**. Consignação e Avaliações não apareceram na navegação dessa conta. O levantamento orientou a implementação local de Relatórios e Consignação descrita abaixo. O núcleo de Avaliações funcionais foi acrescentado após a análise do arquivo público de questionários; anexos e regras oficiais permanecem fora da demonstração.

## Entrega 4 — Relatórios e Consignação

Os novos atalhos aparecem na página inicial e nas abas do contrato:

- **Relatórios:** `/governo-digital/servidor/contratos/DEMO-001?tab=relatorios`. Abra **Portal Servidor - Vida Funcional** para visualizar vínculo e movimentações. Use **Baixar HTML** ou **Imprimir / Salvar PDF**. O relatório identifica documentos vinculados ainda não liberados, sem expor seu conteúdo. A emissão registra `report.generated` na auditoria local. Código de teste: `DEMO-REPORT-HISTORY-001`.
- **Consignação:** `/governo-digital/servidor/contratos/DEMO-001?tab=consignacao`. Consulte **10/2026** (margem disponível R$ 880, com descontos e bases), **09/2026** (margem R$ 1.330, sem detalhamento de grupos) e **12/2025** (sem dados). Nenhum desses valores representa regra oficial, aprovação de crédito ou resultado calculado a partir da folha real.

O backend Rust oferece `GET /api/reports`, `GET /api/reports/{id}` e `GET /api/consignments?year=2026&month=10`. O catálogo e os valores base pertencem a `data/demo.json`. A ausência de dados é distinta de falha de consulta. A consulta por período é um recurso adicional da demonstração, sem afirmar que exista na aba original.

`contract-ui.js` e `contract.css` implementam as telas. `document-export.js` é o proprietário do preparo de estilos para HTML autossuficiente, compartilhado com a central de documentos e os ZIPs.

Nesta entrega foram executados 23 testes, Clippy sem avisos, verificação de formatação e compilação Rust. A API do processo atualizado foi conferida por HTTP. A ferramenta de navegador voltou a reportar acesso desabilitado, apesar de o controle aparecer ativado para o usuário; por isso **as duas novas telas ainda não tiveram conferência visual automatizada**. A posição dos botões de acessibilidade foi aprovada visualmente pelo usuário antes desta entrega e foi preservada.

## Entrega 5 — Avaliações funcionais

Abra **Avaliações funcionais** na página inicial ou a aba **Avaliações** do contrato: `/governo-digital/servidor/contratos/DEMO-001?tab=avaliacoes`.

As seções **Pendentes**, **Minhas Concluídas** e **Respondidas** permitem buscar por matrícula/nome e paginar resultados. No questionário de exemplo, salve um rascunho parcial ou responda todas as perguntas para finalizar. A opção que pede esclarecimento exige uma observação na finalização. Após confirmar a conclusão, o questionário passa a ser somente para consulta e permite baixar relatório HTML. A nota é calculada pelo servidor a partir de pontos fixos fictícios.

O exemplo de ciência permite **Concordar (simulação)** ou **Discordar (simulação)**, após confirmação. A decisão e a observação ficam apenas no PostgreSQL local, sem assinatura nem efeitos administrativos. A avaliação de preenchimento `demo-eval-1` foi finalizada durante o teste de navegador desta instalação; consulte-a em Respondidas. A ciência `demo-eval-4` continua pendente.

A migração `003_evaluations.sql` preserva respostas em `demo_evaluation_responses`. Rascunhos, finalizações e ciência registram auditoria local e podem gerar aviso conforme a preferência de atendimento. O backend segue em Rust; a interface usa `evaluations-ui.js` e `evaluations.css`.

**31 testes passaram**. No navegador foram verificados rascunho, validações, finalização, modo de leitura, aviso, confirmação/cancelamento da ciência e download HTML. A lista foi conferida em 390 pixels sem transbordamento horizontal. As telas de Relatórios e Consignação também tiveram sua conferência visual inicial: prévia do relatório funcional, valores de margem e período sem dados.

Na entrega 5 ainda faltavam a prévia da nota e a média ponderada, acrescentadas na entrega 6 abaixo. Anexos, fluxo oficial configurável, aptidão parametrizada e documentos oficiais continuam pendentes. Os períodos de liberação dos exemplos são informativos. Veja [evidências e limites de Avaliações](docs/EVALUATIONS.md).

## Entrega 6 — Prévia e memória das avaliações

Em **Avaliações**, abra **Média ponderada — exemplo de preenchimento** (`demo-eval-5`). Selecionar ou limpar uma resposta atualiza a prévia pelo backend Rust, sem salvar respostas, finalizar ou gerar auditoria/avisos. Em falha de consulta, a nota anterior deixa de ser apresentada como atual e há uma opção de tentar novamente. Respostas atrasadas não substituem a prévia mais recente.

**Ver memória de cálculo fictícia** mostra pontos, pesos, contribuições e divisor. O mesmo cálculo do servidor alimenta prévia, salvamento, consulta e relatório HTML. Os quatro exemplos anteriores mantêm a soma de pontos × pesos. O novo exemplo usa média ponderada, com pesos 2 e 1; respostas 5 e 2 produzem `(5 × 2 + 2 × 1) / 3 = 4`, de um máximo de 5. Perguntas sem resposta contam como zero; a média usa os pesos de todas as perguntas, inclusive as não respondidas. A nota é exibida com até duas casas decimais, sem arredondar o cálculo no servidor. Não há classificação de aptidão.

Endpoint adicional: `POST /api/evaluations/{id}/preview`, com apenas `answers`. A regra e os pontos vêm da massa fictícia; o cliente não pode enviar nota ou finalizar por esse endpoint. Não há migração nova nem configuração editável de regras pelo usuário.

**35 testes passaram:** 8 Rust, incluindo PostgreSQL real em schema isolado, e 27 JavaScript. Clippy, formatação e compilação também passaram. No navegador foram conferidos atualização parcial/completa, memória, seleção de opções e abertura da memória por teclado, ausência de salvamento ao recarregar e persistência após salvar rascunho. A memória foi conferida em 390 pixels; a revisão integral de acessibilidade e dos demais fluxos continua pendente.

Nesta instalação, `demo-eval-5` contém um rascunho fictício com nota 4; uma base nova começa sem respostas. A implementação amplia a demonstração com base nas declarações públicas já registradas, sem alegar equivalência com as regras do RH original.
