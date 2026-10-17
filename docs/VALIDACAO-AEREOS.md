# Validação da fonte de passagens

Verificação em 17 de outubro de 2026. Esta atualização complementa `FONTES.md`: o domínio da SerpApi passou a responder neste ambiente. Os documentos oficiais abaixo retornaram HTTP 200, com TLS e proxy preservados. Não foi feita consulta autenticada, não houve consumo de cota nem contratação de serviço.

## Decisão

**SerpApi é viável para uma prova de conceito pessoal e para implementar o adaptador de passagens. Ainda não está validada uma tarifa real deste projeto.** É uma API de terceiros que estrutura resultados do Google Flights; não é uma API oficial do Google e não emite passagens.

Não há um único endpoint documentado que garanta a busca exaustiva de todas as datas dos próximos 12 meses, todas as durações e todos os pares de aeroportos de entrada e saída. A coleta precisa combinar descoberta e confirmação, com limites explícitos de consultas e de cobertura.

## Fontes oficiais consultadas

- [Google Flights API](https://serpapi.com/google-flights-api).
- [Google Flights Booking Options](https://serpapi.com/google-flights-booking-options).
- [Google Travel Explore API](https://serpapi.com/google-travel-explore-api).
- [Google Flights Deals API](https://serpapi.com/google-flights-deals-api).
- [Preços e contagem de consultas](https://serpapi.com/pricing).
- [Termos e política de privacidade](https://serpapi.com/legal).
- [Caso de uso: monitoramento de preços](https://serpapi.com/use-cases/price-monitoring).
- [Repositório oficial Google Flights Scraper](https://github.com/serpapi/google-flights-scraper).

## Acesso, automação e histórico

O fornecedor documenta uso por aplicações via API e divulga monitoramento contínuo de preços. O repositório oficial de Google Flights cita “Track fare changes and send price alerts”. Não foi encontrada nos termos públicos consultados uma exigência de empresa ou audiência mínima, nem proibição específica de um monitor pessoal agendado.

Isso sustenta a escolha técnica para a prova de conceito; não constitui um contrato específico de licença dos dados de terceiros. A seção 2 dos termos limita reprodução e revenda do próprio serviço sem permissão; a seção 12 exige respeito aos direitos de terceiros. Os termos não trazem uma autorização específica e detalhada de retenção histórica tarifária por meses. Caso essa garantia seja necessária antes de operar, a pendência é obter esclarecimento escrito do fornecedor, sem presumir autorização contratual inexistente.

O prazo de **31 dias** da política de privacidade descreve a retenção dos resultados nos sistemas da **SerpApi**. Não é uma licença para usar os dados, nem fornece ao nosso painel um histórico personalizado de meses. O histórico do monitor deve registrar suas próprias observações; não depender da API de arquivos do fornecedor para preservá-las.

`price_insights.price_history`, `typical_price_range`, `average_price` e `discount_percentage`, quando retornados, são referências fornecidas pela fonte. Não representam a média dos mínimos diários da regra personalizada do usuário. Essa média precisa ser calculada separadamente.

## Cotas e preços publicados

Valores em dólares dos EUA na página oficial consultada; sujeitos a alterações. Nenhum plano foi assinado.

| Plano | Mensalidade | Consultas por mês | Limite por hora |
| --- | ---: | ---: | ---: |
| Free | US$ 0 | 250 | 50 |
| Starter | US$ 25 | 1.000 | 200 |
| Developer | US$ 75 | 5.000 | 1.000 |
| Production | US$ 150 | 15.000 | 3.000 |

A página informa que somente consultas bem-sucedidas consomem a franquia. Resultado vazio bem-sucedido também conta como uma consulta. Resultados atendidos pelo cache, erros e falhas não são contabilizados. O cache dura uma hora e exige parâmetros idênticos; duas consultas por dia normalmente não compartilharão esse cache.

Exemplo de orçamento de requisições, sem promessa de cobertura: uma consulta de descoberta por rodada, duas rodadas por dia, durante 30 dias, consome até 60 consultas bem-sucedidas. Cada seleção de retorno, próximo trecho, opção de reserva ou nova combinação pode consumir outra consulta. A franquia gratuita não comporta varrer milhares de combinações diariamente. Definir teto global antes de habilitar o agendador.

## Contrato técnico para o adaptador

Endpoint base: `GET https://serpapi.com/search.json`. Usar `URLSearchParams` ou codificação equivalente e a chave `api_key` somente no servidor. Nunca retornar a chave ou a URL completa da requisição autenticada ao navegador ou aos logs.

### Datas específicas, ida e volta

```json
{
  "engine": "google_flights",
  "type": "1",
  "departure_id": "GRU",
  "arrival_id": "CDG,ORY",
  "outbound_date": "2027-03-10",
  "return_date": "2027-03-21",
  "currency": "BRL",
  "gl": "br",
  "hl": "pt-BR",
  "adults": "1",
  "travel_class": "1"
}
```

Origem, passageiros e datas são apenas exemplos de formato; não são preferências assumidas do usuário. `departure_id` e `arrival_id` aceitam aeroportos IATA ou IDs de localização do Google; múltiplos valores podem ser separados por vírgulas.

- `type=1`: ida e volta; exige as duas datas, salvo uso de itinerário fixado por `selected_flights_json`.
- `type=2`: somente ida; omitir `return_date`.
- `type=3`: multicidade; usar `multi_city_json` com datas por trecho. Não usar `outbound_date` ou `return_date` no nível superior.
- Ler tanto `best_flights` quanto `other_flights`; qualquer grupo pode faltar. Não presumir que o primeiro resultado é o mais barato.
- `deep_search=true` é documentado como mais fiel aos resultados do navegador, com resposta mais demorada. Não garante que a oferta permanecerá disponível até a compra.
- `exclude_basic` só é documentado para voos domésticos dos EUA com `gl=us`; não serve para garantir bagagem em voos Brasil–Europa.
- O campo `price` é documentado como preço do bilhete na moeda escolhida. Confirmar em uma consulta real como o fornecedor apresenta totais para vários passageiros antes de multiplicar/dividir ou rotular preço por pessoa.

### Entrada e saída por cidades diferentes

```json
{
  "engine": "google_flights",
  "type": "3",
  "multi_city_json": "[{\"departure_id\":\"GRU\",\"arrival_id\":\"CDG\",\"date\":\"2027-03-10\"},{\"departure_id\":\"AMS\",\"arrival_id\":\"GRU\",\"date\":\"2027-03-21\"}]",
  "currency": "BRL",
  "gl": "br",
  "hl": "pt-BR",
  "adults": "1"
}
```

A distância máxima entre CDG e AMS é uma regra do aplicativo, baseada em coordenadas dos aeroportos. Distância aérea não comprova tempo ou preço de trem/ônibus. Não somar duas tarifas independentes e apresentá-las como uma tarifa multicidade confirmada.

### Seleção e confirmação

1. Executar a pesquisa com rota, passageiros e datas.
2. Usar o `departure_token` de um resultado para selecionar o voo e obter o retorno ou o próximo trecho da multicidade, preservando os parâmetros da busca.
3. Prosseguir pelas etapas até obter `booking_token` e consultar as opções de reserva.
4. `departure_token` e `booking_token` são mutuamente exclusivos na mesma requisição.
5. Ler `booking_options`, vendedor, bagagem, condições e eventual `separate_tickets`. Revalidar antes do alerta.

Algumas opções trazem `booking_request.url` e `post_data`, exigindo formulário HTTP POST com o corpo fornecido sem modificações; outras podem trazer link direto. Não tratar toda opção como um URL GET, nem expor links autenticados da SerpApi como link de compra. Abrir a oferta não autoriza fazer uma reserva ou pagamento.

## Descoberta flexível

### Google Travel Explore

`engine=google_travel_explore` aceita `arrival_area_id` para uma região (Europa: `/m/02j9z`), `departure_id`, moeda e passageiros. O parâmetro `month` cobre **somente os próximos seis meses**, com `0` representando todos eles. As durações prontas são fim de semana, uma semana e duas semanas. Não equivale a testar todas as durações de 10 a 20 dias.

### Google Flights Deals

`engine=google_flights_deals` aceita:

- `departure_id`, inclusive múltiplos aeroportos separados por vírgula.
- `outbound_date` exata ou intervalo `YYYY-MM-DD,YYYY-MM-DD`.
- `trip_length="10,20"`, por exemplo, para duração mínima e máxima em dias.
- `query` em linguagem natural para descoberta temática/geográfica.
- `type=1` (ida e volta) ou `type=2` (somente ida), sem modo multicidade documentado.

Restrições relevantes: `query` não pode ser combinado com `trip_length` ou `travel_duration`; nesse modo a duração precisa estar no texto. `trip_length` não pode ser combinado com `return_date` ou `travel_duration`. Não há `arrival_id` ou `arrival_area_id` documentado para esse endpoint: filtrar países nos resultados ou avaliar a interpretação de `query` com teste real. O horizonte máximo não é declarado nesta documentação; não estender automaticamente a regra de seis meses do Explore, nem prometer 12 meses sem verificar retorno real.

Os resultados `deals` podem incluir `price`, `average_price`, `discount_percentage`, `start_date`, `end_date`, `departure_airport_code`, `arrival_airport_code` e `flight_link`. Alguns campos são opcionais, e o exemplo de busca por `query` também mostra `outbound_date`/`return_date`; o adaptador deve tolerar os dois pares de nomes. O desconto da fonte não substitui a regra histórica do monitor.

## O que falta para considerar a fonte operacional

1. Chave da SerpApi fornecida em configuração segura, disponível somente ao servidor. Não solicitar valores no chat.
2. Consulta autenticada com origem e quantidade de passageiros informadas pelo usuário, validando BRL, totais, condições e link utilizável.
3. Sequência completa de seleção de um itinerário multicidade e confirmação das opções.
4. Teste de cobertura de descoberta e datas futuras, registrando chamadas consumidas e intervalo efetivamente pesquisado.
5. Persistência do histórico próprio, teto de cota e agendador antes de chamar o monitor de automático; e-mail e Telegram antes de chamar alertas de ativos.

O usuário informou que a fonte de hotel já deu certo; esta verificação ficou restrita a passagens e não revalidou a integração de hotéis.
