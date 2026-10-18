# Pesquisa de hotéis na Booking

Verificação em 17 de outubro de 2026, com a documentação oficial acessível pelo proxy normal do ambiente. Nenhuma requisição autenticada, contratação ou consulta de tarifa de hotel foi realizada.

Booking é a fonte escolhida pelo usuário. Isso não significa que exista uma API conectada. As variáveis de credencial não estão disponíveis neste ambiente e o adaptador de preços continua pendente.

## O que foi confirmado

Os [pré-requisitos oficiais da Demand API](https://developers.booking.com/demand/docs/getting-started/prerequisites) exigem registro como **Managed Affiliate Partner**, contrato firmado e acesso ao Partner Centre concedido por um Account Manager. Nesse portal são obtidos o token da API e o identificador de afiliado. Uma conta comum de hóspede não comprova esse acesso.

A [especificação OpenAPI oficial, versão 3.1](https://developers.booking.com/_bundle/demand/docs/open-api/demand-api.json?download), declara:

| Operação | Contrato relevante |
| --- | --- |
| `POST https://demandapi.booking.com/3.1/accommodations/details` | Catálogo estático. Exige pelo menos um filtro entre `accommodations`, `airport`, `city`, `country` ou `region`. Retorna propriedades com `id`, `name` traduzido, `location`, `url` e paginação `next_page`. |
| `POST https://demandapi.booking.com/3.1/common/locations/cities` | Catálogo de cidades com identificador, nome traduzido e coordenadas. Pode filtrar por país ou outros identificadores; também é paginado. |
| `POST https://demandapi.booking.com/3.1/accommodations/search` | Busca disponibilidade e preços com datas, hóspedes e dados do comprador. Os filtros geográficos e IDs de propriedades não equivalem a uma busca por nome. |

As chamadas autenticadas usam `Authorization: Bearer <token>` e `X-Affiliate-Id: <identificador>`, com JSON no corpo. As credenciais devem existir somente no servidor; neste projeto os nomes reservados são `BOOKING_API_TOKEN` e `BOOKING_AFFILIATE_ID`. Nunca colocar os valores no frontend, em documentação ou em logs.

**Nenhuma dessas operações aceita um parâmetro de texto livre para pesquisar o nome de um hotel.** Não existe, nessa especificação, um endpoint de autocomplete de propriedades que possa receber cada nome digitado.

## Comportamento atual da interface

`GET /api/suggestions/hotels?q=...` pesquisa um índice privado de propriedades importadas da Booking. Sem esse índice, informa explicitamente que o nome ainda não foi validado. Não retorna propriedades inventadas, não faz buscas em outra fonte sob o rótulo Booking e não interpreta um campo preenchido como uma propriedade encontrada.

Ter as duas credenciais presentes também não habilita a lista: ainda é necessário conectar um índice pesquisável do catálogo. `configured: false` significa que a pesquisa de sugestões não está disponível, e não uma conclusão de que o hotel inexiste na Booking.

Nenhuma consulta à API Booking é disparada a cada tecla. Os testes usam registros sintéticos locais identificados como fixtures, sem credenciais reais nem tráfego de produção. A interface guarda o identificador da opção selecionada e desfaz a seleção quando o texto muda; sem seleção válida não permite avançar no formulário.

## Índice implementado

Em desenvolvimento, `BOOKING_HOTEL_CATALOG_PATH` aponta para um JSON privado fora dos arquivos públicos. Em produção, sem esse caminho, a função lê `index.json` do store privado Netlify Blobs `viagem-booking-catalog`. O importador autenticado e o catálogo real ainda não existem neste projeto.

O contrato do arquivo é `{ version: 1, source: 'booking', sourceEndpoint: 'https://demandapi.booking.com/3.1/accommodations/details', importedAt: '<ISO-8601>', hotels: [...] }`. Cada registro tem `id` numérico em string, `name`, `location`, `source: 'booking'` e `verified: true`; coordenadas `lat`/`lon` e URL HTTPS da Booking são opcionais. Esses campos documentam a origem esperada; escrever `verified: true` não comprova uma importação real. Somente o operador pode alimentar o índice a partir de dados licenciados verificados, nunca o navegador.

O leitor rejeita metadados inválidos, IDs duplicados, URLs de outra fonte e arquivos acima de 5 MB ou 20 mil hotéis. A ausência de um nome no índice não comprova ausência na Booking. Não publicar o índice em `public/` ou versionar credenciais e catálogos privados.

## Próxima etapa necessária

1. Confirmar elegibilidade e obter o acesso oficial; verificar as condições contratuais para armazenar e atualizar os dados estáticos e históricos de preços deste painel pessoal. A documentação técnica, isoladamente, não concede essa permissão.
2. Importar o catálogo da área atendida por `/accommodations/details`, percorrendo `next_page`, em armazenamento persistente acessível pelas funções do Netlify. Usar também o catálogo de cidades para apresentar localização compreensível. A abrangência e o custo devem ser conhecidos antes de uma importação grande.
3. Alimentar o índice pesquisável já implementado com IDs reais, fonte e data de atualização. A lista apresenta localização junto ao nome para diferenciar hotéis homônimos; documentar a cobertura importada.
4. Revalidar o ID selecionado no servidor ao implementar a consulta de preços. A seleção no frontend não substitui essa verificação.
5. Validar os hotéis desejados e implementar preços separadamente, preservando hóspedes, noites, categoria, alimentação, cancelamento, moeda e taxas equivalentes. Existir no catálogo não significa ter disponibilidade ou tarifa nas datas consultadas.

Não usar um arquivo local não verificado, nomes conhecidos ou resultados do Google como comprovação de pertencimento à base Booking. A API de preços e o envio automático de alertas continuam sendo etapas distintas da seleção do hotel.

## Alternativa para um piloto: Google Hotels pela SerpApi

A [documentação de Google Hotels da SerpApi](https://serpapi.com/google-hotels-api), consultada em 17/10/2026, oferece busca por cidade/hotel, datas de entrada e saída, adultos e moeda, além de propriedades e ofertas de vendedores. Pode haver ofertas da Booking entre os vendedores retornados. Isso é uma fonte Google Hotels via SerpApi; não é acesso direto à Booking nem prova de parceria afiliada.

Para iniciar um piloto pessoal sem o acesso de parceiro Booking, essa é a alternativa técnica recomendada. Pode usar a conta/chave SerpApi já utilizada nas passagens, com consumo adicional da cota e condições do plano a verificar. Nenhuma nova contratação, cobrança ou integração foi ativada nesta etapa. Booking continua sendo a escolha registrada; não houve troca silenciosa de fornecedor.

O trabalho seguinte deve ser concreto e separado do conector Booking:

1. Criar um adaptador identificado como Google Hotels/SerpApi e permitir buscar uma cidade ou escolher um hotel, sem exigir que o usuário conheça IDs de propriedades.
2. Consultar `engine=google_hotels` com `check_in_date`, `check_out_date`, `adults` e `currency=BRL`. Guardar o identificador próprio da fonte (`property_token`) separadamente de um ID Booking.
3. Validar preço total da estadia e composição de impostos/taxas. `rate_per_night` não pode ser apresentado como total; não converter uma tarifa base em total com taxas sem evidência da resposta.
4. Comparar a mesma hospedagem, ocupação, noites e condições de alimentação/cancelamento. Uma oferta de outro vendedor não é automaticamente equivalente.
5. Exibir vendedor e link real de reserva, testar uma consulta autenticada com hotel conhecido e só depois habilitar histórico e alertas comparáveis.

O formulário atual de hotéis continua em **Em breve**. A referência acima foi lida sem autenticação; não foi verificada disponibilidade, preço de hotel ou oferta Booking ao vivo. O teste de um preço real exige a chave configurada no ambiente seguro, sem copiá-la para o navegador ou para o chat.
