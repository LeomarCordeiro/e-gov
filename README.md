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
```

O teste de integração precisa do banco local preparado. Ele cria um schema exclusivo, testa os handlers reais com PostgreSQL e o remove ao final, sem alterar as tabelas de demonstração. Testa reconexão, migração idempotente, fluxo de atendimento, documentos, preferências, leitura de avisos, auditoria e limites de acesso aos arquivos.

Nesta entrega passaram **14 testes**: 3 Rust (incluindo integração PostgreSQL) e 11 JavaScript. Compilação, `cargo fmt --check` e Clippy sem avisos também verificados. A API em execução respondeu com saúde válida. Estes testes não constituem validação visual: revisão em celular, teclado e navegador permanece pendente porque o acesso ao navegador local está desabilitado na sessão de trabalho. Os cenários REA em `tests/*.scenario.json` são roteiros anteriores, não comprovam aprovação desses fluxos novos.

## Antes do uso real

Ainda são necessários autenticação oficial, identificação e isolamento por usuário/órgão, permissões no servidor, contratos e integração com APIs oficiais, política de operação e backup do banco, auditoria de produção e validação dos cálculos/documentos pelo RH. A auditoria desta demonstração não cobre todas as consultas nem constitui trilha inviolável. Não existem essas garantias no seletor de papéis local.

## Repositórios e arquivos locais

O projeto foi registrado na seção Projetos como **REA**. O código do portal possui repositório Git próprio em [LeomarCordeiro/e-gov](https://github.com/LeomarCordeiro/e-gov), separado do upstream do REA.

- REA: `C:\Users\leoma\Documents\ChatGPT\REA`
- Portal e-gov: `C:\Users\leoma\Documents\ChatGPT\REA\projects\sarandi-servidor`

Materiais de investigação (`evidence/`, `.browser-profile/`), credenciais, banco, dependências e binários compilados não integram o Git nem o ZIP. Veja [RECONSTRUCTION.md](RECONSTRUCTION.md) para a origem e os limites das observações. As evoluções são funcionalidades locais propostas pelo usuário, não afirmações sobre o que existe no sistema original.
