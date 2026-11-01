# Registro da reconstrução

O usuário solicitou o uso do REA para reproduzir a Área do Servidor e escolheu uma **cópia local com dados fictícios**, incluindo os fluxos da área autenticada.

## Evidências utilizadas

A inspeção inicial do navegador e a captura visual realizadas pelo REA orientaram a estrutura do painel: cabeçalho, navegação, últimos pagamentos, principais serviços e contratos. O conteúdo pessoal observado não integra os dados da demonstração nem é reproduzido neste registro.

A análise estática seguinte utilizou arquivos públicos obtidos sem cookies ou credenciais. Os arquivos e seus hashes SHA-256 estão no manifesto local `evidence/public-sources/manifest.json`; os achados estruturados estão em `evidence/public-sources/interface-findings.json`. Esses materiais de investigação não integram o ZIP da aplicação.

| Fonte pública | O que sustenta |
| --- | --- |
| `4141.dfd34eae3737647b.js` | Rotas de contratos e comprovantes; navegação dos últimos pagamentos. |
| `7943.2205cec82f3a6bae.js` | Lista expansível de holerites, colunas, eventos, recibos, paginação e linha do tempo da vida funcional. |
| `9136.5919cc44083ea013.js` | Comprovantes agrupados por ano, fonte pagadora, emissão e estados de disponibilidade. |
| `5959.8f759dc1cdaaf2b8.js` | Código autenticador obrigatório, limite de 100 caracteres e estados válido/inválido. |
| `common.1bbcc5ff44efa0ed.js` | Campos dos contratos e chamadas de consulta declaradas pela aplicação. |
| `main.c3995b72c726a854.js` e `runtime.41ca5e8dca9ac9a5.js` | Rotas gerais, identificação dos módulos e origem do logotipo municipal. |
| `styles.0dc6545d48666d02.css` e fontes Rawline | Referência visual e tipografia. |

Esses achados estabelecem o que o código público declara. Não comprovam disponibilidade de todas as funções por conta, respostas dos serviços internos ou equivalência com o backend original.

## O que foi reconstruído

Os quatro serviços principais usam uma API local escrita para esta demonstração. O perfil Ana Silva, matrícula DEMO-001, os 37 pagamentos de 2024 a 2026, os valores, os eventos e os códigos de validação são fictícios. As páginas e os documentos identificam a natureza demonstrativa.

Foram preservados os padrões observados de navegação e apresentação. A cópia acrescenta filtros locais de holerites e exportação CSV como recursos de teste. Os recibos podem ser baixados em HTML; a geração de PDF utiliza a impressão do navegador, enquanto o código público original declara obtenção de PDFs por seus serviços.

O logotipo municipal foi obtido do recurso público `/portal-govdig-api/api/pwa/icon/.png`; o logotipo Elotech e as fontes foram obtidos dos recursos estáticos públicos. Os scripts originais serviram como referência e não são executados pela cópia.

## Limites e escolhas

- O backend original, o banco de dados e a autenticação real não foram clonados. A API Rust utiliza os dados fictícios base e os registros de demonstração criados localmente.
- O código público menciona as abas **Consignação**, **Relatórios** e **Avaliações**. Elas não foram implementadas; sua disponibilidade na conta não foi estabelecida por essa análise estática.
- Solicitações foram acrescentadas como fluxo local fictício, com persistência PostgreSQL. Alteração de cadastro e envio ao município não fazem parte da demonstração.
- O tradutor **VLibras** não está incluído. Aumento de fonte, alto contraste, rótulos e navegação por teclado são uma escolha de implementação local, sem equivalência funcional ao tradutor.
- A validação verifica somente os códigos emitidos pela demonstração; não verifica documentos oficiais.
- Os diretórios de evidências e o perfil de navegador não são publicados pelo servidor e não acompanham o ZIP de entrega.

## Verificação registrada

Segunda entrega: 14 testes aprovados (3 Rust com integração PostgreSQL e 11 JavaScript). API em execução também verificada por HTTP. Verificação visual não concluída: o uso do navegador local está desativado nas configurações do Work. Não se afirma equivalência integral com o sistema original.

## Evoluções da primeira entrega

Comparação de holerites, explicação de rubricas e central de documentos foram criadas para esta versão local a pedido do usuário. Não são apresentadas como funcionalidades observadas no portal original. As memórias de cálculo descrevem apenas a geração dos dados fictícios, sem afirmar regras fiscais, previdenciárias ou de RH. Foram adicionadas variações fictícias em setembro e outubro de 2026 para demonstrar inclusões, remoções e alterações, com diferença líquida reconciliada de R$ 120.

O download em lote empacota HTML e CSS em ZIP. PDFs continuam disponíveis pela impressão do navegador. Documentos anuais parciais são identificados, filtros de mês não incluem comprovantes anuais e a seleção fora dos filtros é informada.

## Substituição de marca

A identidade do fornecedor exibida pela aplicação foi substituída por ArquimetrIA a pedido do usuário, com os três SVGs enviados. As referências a Elotech neste documento descrevem apenas a origem histórica da interface analisada. Os SVGs originais foram preservados integralmente.

## Evoluções da segunda entrega

Backend substituído por Rust (Axum/Tokio) e persistência PostgreSQL em Docker. A fonte fictícia base foi consolidada em `data/demo.json`. A vida funcional ganhou documentos vinculados e filtros; solicitações locais ganharam protocolo, conversa e histórico; avisos ganharam leitura e preferências persistentes. A liberação de documento pendente é uma simulação explícita operada pelo papel RH. Essas funcionalidades não foram observadas no sistema original; foram implementadas para atender à evolução solicitada.

As tabelas do teste de integração ficam em schema exclusivo descartado após o teste. A conexão é reaberta durante o teste para comprovar persistência, sem alterar os registros de uso manual. O PostgreSQL guarda também auditoria local limitada às operações implementadas, não equivalente a uma auditoria de produção.
