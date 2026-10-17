# Avaliação das fontes de preços

Data da pesquisa: 17 de outubro de 2026. Fontes públicas oficiais; nenhuma consulta autenticada de preços, contratação ou compra foi realizada.

Atualização: a documentação SerpApi passou a responder neste ambiente e o adaptador inicial foi implementado. Veja a [validação atual de passagens](VALIDACAO-AEREOS.md). As observações de bloqueio de rede abaixo descrevem os testes anteriores, não impedem o acesso SerpApi agora observado. O usuário confirmou que a fonte de hotel já deu certo; sua integração não foi revalidada nesta etapa nem está disponível neste checkout.

## Conclusão desta etapa

**Skyscanner não atende, nas condições padrão publicadas, ao painel pessoal com monitoramento automático.** A SerpApi é a candidata tecnicamente mais alinhada encontrada para uma prova de conceito de passagens, ainda condicionada a termos, custos e uma consulta real. Booking continua como fonte planejada para hotéis, com elegibilidade e cobertura pendentes. Nenhum fornecedor está integrado ou definitivamente escolhido.

O usuário confirmou uso pessoal, sem comercialização no momento. Priorizar elegibilidade individual e baixo custo, sem presumir orçamento zero nem autorização de cobrança. Nenhum serviço pago foi contratado.

## Skyscanner

Fontes oficiais consultadas com HTTP 200:

- [Formulário e critérios de acesso](https://www.partners.skyscanner.net/contact/travel-api).
- [Apresentação das APIs](https://www.partners.skyscanner.net/affiliates/travel-apis).
- [Usage Guidelines](https://developers.skyscanner.net/docs/getting-started/usage-guidelines).
- [Flights Indicative Prices](https://developers.skyscanner.net/docs/flights-indicative-prices/overview).
- [Multi-City](https://developers.skyscanner.net/docs/flights-live-prices/multiCity).
- [FAQ](https://developers.skyscanner.net/docs/faqs).

Achados:

- O formulário limita o acesso a uso comercial e exclui indivíduos em uso não comercial. Publica um mínimo de 100 mil usuários ativos mensais, incompatível com presumir acesso para um painel pessoal novo.
- As regras de Live Pricing dizem: **“Automated requests (calls without user action) to the Live Pricing Service do not occur.”** Chamadas devem ser iniciadas por ação do usuário. A confirmação automática antes de um alerta também precisa respeitar essa regra.
- A apresentação comercial exige empresa estabelecida com audiência grande. A documentação vincula o modelo à geração de cliques de compra e reservas.
- Preços indicativos podem estar em cache por até quatro dias e referem-se a um adulto em econômica; não comprovam uma oferta atual para passageiros e bagagem configurados.
- Multi-City está disponível no Live. Não presumir que estimativas independentes de trechos formam uma tarifa real de ida e volta com cidades diferentes.
- A documentação consultada não estabeleceu permissão para retenção própria de preços durante meses.

Decisão: retirar como fonte padrão do monitor. Uma autorização contratual específica poderia mudar a avaliação; ela não existe neste projeto.

## Amadeus Self-Service

O [README oficial de developer-guides](https://github.com/amadeus4dev/developer-guides) declara: **“The Amadeus for Developers Self-Service offer has been deprecated.”**

O [comunicado vinculado](https://amadeus.com/en/industry-messaging/statement-regarding-amadeus-for-developers-portal) não pôde ser consultado nesta etapa. Não foi verificada uma data de encerramento nem a disponibilidade de modalidades comerciais alternativas.

Decisão: não recomendar Self-Service como alternativa garantida para um projeto novo. Especificações antigas continuam disponíveis, mas não comprovam acesso atual ao serviço.

## Duffel

Fontes oficiais consultadas:

- [Services Agreement](https://duffel.com/services-agreement), versão apresentada com atualização em 17 de junho de 2026.
- [Pricing](https://duffel.com/pricing).
- [Documentação](https://duffel.com/docs).

Achados:

- A seção 2.5(d) proíbe acessar ou usar os serviços para metabusca, incluindo construir um metabuscador sobre a plataforma Duffel.
- Acesso real depende de verificação cadastral. As regras vinculam pesquisas a reservas e podem limitar ou suspender uso por relação excessiva entre pesquisas e pedidos.
- A página de preços publica 1.500 pesquisas por reserva e US$ 0,005 por pesquisa excedente. Esse preço não elimina as restrições contratuais e não representa uma cotação de operação deste painel.
- Duffel Links é uma experiência de venda com marca e pagamentos integrados; não equivale a encaminhar o usuário para comprar externamente no site de uma companhia.
- Não foi encontrada autorização expressa para o histórico tarifário e o monitor pessoal pretendidos.

Decisão: não selecionar nas condições padrão. Só reavaliar com autorização contratual apropriada ao produto.

## SerpApi — candidata para prova de conceito

É uma API de terceiros que coleta e estrutura resultados de busca, incluindo Google Flights. **Não é uma API oficial do Google.**

Material oficial acessível no GitHub:

- [Google Flights Scraper](https://github.com/serpapi/google-flights-scraper).
- [Catálogo Google Flights](https://github.com/serpapi/serpapi-mcp/blob/main/engines/google_flights.json).
- [Catálogo Google Travel Explore](https://github.com/serpapi/serpapi-mcp/blob/main/engines/google_travel_explore.json).
- [Catálogo Google Flights Deals](https://github.com/serpapi/serpapi-mcp/blob/main/engines/google_flights_deals.json).
- [Catálogo Google Hotels](https://github.com/serpapi/serpapi-mcp/blob/main/engines/google_hotels.json).

Capacidade documentada:

- O fornecedor cita expressamente **“Track fare changes and send price alerts”** como caso de uso.
- `type=3` e `multi_city_json` representam itinerários com cidades diferentes e datas concretas por trecho. A distância máxima entre aeroportos seria uma regra do nosso sistema.
- Tokens de seleção permitem consultar retorno, próximos trechos e opções de compra. Essas etapas podem consumir consultas adicionais; não fazem reserva ou compra.
- `price_insights` pode trazer faixa típica e histórico quando disponíveis. Esses dados não substituem automaticamente a média personalizada dos mínimos diários da nossa busca.
- O explorador pronto documenta os próximos **seis meses**, com durações predefinidas. Ele não comprova sozinho a pesquisa de 12 meses nem todas as durações de 10 a 20 dias.
- O catálogo de Flights Deals aceita duração em intervalo, mas não comprovou um filtro de destino que resolva sozinho Europa e entrada/saída diferentes.
- O catálogo de hotéis tem propriedade, datas, ocupação e parâmetros de cancelamento. Isso não demonstra equivalência de categoria de quarto, alimentação e taxas em todas as ofertas.

Pendências antes de escolher ou contratar:

1. Ler termos atuais para confirmar consultas recorrentes, retenção histórica e uso pessoal pretendido.
2. Conferir planos, cotas, limites e custo das consultas adicionais. Não assumir preço ou franquia de material antigo.
3. Executar uma busca real com origem e passageiros escolhidos pelo usuário; conferir tarifa, bagagem, moeda e link para compra.
4. Validar um itinerário com cidades de chegada e saída diferentes dentro do raio configurado.
5. Medir a cobertura e o custo do horizonte anual. Não anunciar varredura completa se a consulta cobrir apenas parte das datas ou destinos.

As páginas `serpapi.com` ainda retornaram bloqueio do proxy nesta etapa; o material GitHub comprova capacidade técnica descrita, não valida conta, termos atuais nem uma tarifa real.

## Booking — fonte planejada para hotéis

O usuário aceitou Booking como fonte planejada. Ainda faltam verificar requisitos de acesso à Demand API, permissão para coleta automática e retenção, e disponibilidade dos hotéis e tarifas pretendidos.

A página oficial de [pré-requisitos](https://developers.booking.com/demand/docs/getting-started/prerequisites) retornou bloqueio do proxy nesta etapa. Não presumir que uma conta comum de hospedagem dá acesso à API nem que todo hotel do site aparece em uma integração.

O teste deve identificar exatamente o Royal Tulip desejado e a propriedade Fasano Boa Vista, depois conferir ocupação, quarto, noites, alimentação, cancelamento e impostos. Nenhum desses testes foi executado.

## Travelpayouts — avaliação preliminar

O [projeto oficial de exemplo](https://github.com/travelpayouts/flights-api-project) informa que a API de busca de voos requer cadastro no programa de afiliados e solicitação de acesso, com descrição de como a API será usada. É material de exemplo antigo, não comprovação das condições atuais.

A documentação atual em `support.travelpayouts.com` retornou bloqueio do proxy. Não foram confirmados suporte ao Brasil, multicidade, automação, retenção ou equivalência entre dados em cache e preços confirmados. Não foi selecionada como fonte.

## Como a próxima prova deve funcionar

Usar uma busca configurada pelo usuário, sem origem, passageiros ou hotel presumidos. Medir consultas e limites antes de ampliar a coleta. A busca flexível pode combinar descoberta de candidatos e confirmação de ofertas, respeitando os termos de cada fonte.

Exemplo de dimensão, não estimativa de chamadas faturadas: cinco cidades de entrada × cinco de saída × 300 datas de partida × 11 durações possíveis geram até 82.500 combinações por rodada antes de aplicar filtros. Uma API pode agrupar consultas ou usar calendário/cache, mas não se deve pressupor que uma consulta retorne esse universo completo. Esse é o motivo para medir custo e cobertura antes de configurar duas varreduras diárias anuais.

Perguntas para verificar em termos ou, se necessário, apresentar ao fornecedor sem enviar contatos nesta etapa:

- Um painel pessoal pode executar duas coletas automáticas por dia?
- Pode armazenar preços observados durante meses e calcular alertas percentuais?
- Pode encaminhar o usuário para reservar com o vendedor, sem emitir a reserva no painel?
- Quais limites, cotas e custos se aplicam a calendário, multicidade e confirmação?
- Como identificar preços em cache, extras e ofertas indisponíveis?

## Rede e configuração desta pesquisa

O rascunho de rede preserva os presets existentes e contém estas adições personalizadas: `developers.skyscanner.net`, `www.partners.skyscanner.net`, `developers.amadeus.com`, `duffel.com`, `developers.booking.com`, `support.travelpayouts.com`, `serpapi.com` e `amadeus.com`.

O acesso ao Skyscanner e à Duffel foi observado funcionando; as novas páginas de SerpApi, Booking, Travelpayouts e o comunicado Amadeus ainda estavam bloqueados nos testes. Estado de rascunho ou status de rede, isoladamente, não comprova acesso. O salvamento confirmado não publica o ambiente. A ferramenta indicou que o rascunho precisa ser revisado e salvo nas configurações e o ambiente publicado. Nenhum script de instalação ou instrução de inicialização foi necessário nesta etapa de documentação.
