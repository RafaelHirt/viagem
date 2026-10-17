# Catálogo de aeroportos

O autocomplete e o mapa usam 4.133 aeroportos reais do **OurAirports**, com serviço regular informado, código IATA de três letras e coordenadas válidas. A lista é mundial; a presença no catálogo não comprova disponibilidade de tarifas em um fornecedor.

Fonte: [OurAirports data](https://github.com/davidmegginson/ourairports-data), arquivo [`airports.csv`](https://raw.githubusercontent.com/davidmegginson/ourairports-data/b529623d2a0b09a9be78d37fc7a7a5e1e16e3451/airports.csv), revisão fixada `b529623d2a0b09a9be78d37fc7a7a5e1e16e3451`, consultada em 17/10/2026. O catálogo da origem muda; esta aplicação usa uma fotografia versionada, sem chamada externa ao digitar.

OurAirports declara os dados como domínio público, sem garantia de precisão ou adequação. A declaração está transcrita na seção de licença do [pacote Airport Codes, que redistribui essa mesma fonte](https://github.com/datasets/airport-codes#license), consultada durante a implementação. A página original de licença é [ourairports.com/data](https://ourairports.com/data/); ela não foi consultada diretamente nesta rede. Mantemos atribuição à fonte por cortesia. Isto não representa afiliação à OurAirports, IATA ou ICAO.

Transformações: seleção de `scheduled_service=yes`, exclusão de instalações fechadas, validação de IATA/coordenadas, seleção de campos, nomes de países em português por `Intl.DisplayNames`, ordenação por IATA e serialização em `src/shared/airports.json`. Nomes e cidades vêm do catálogo. Alguns nomes de cidades comuns em português são aliases de busca em `airports.ts`, sem criar aeroportos fictícios. Não usamos IATA como prova de cobertura comercial.

É possível procurar cidade, nome ou código sem acentos. **Goiânia é GYN (Santa Genoveva, Brasil); GOI é Goa Dabolim, na Índia.** As sugestões exibem cidade, aeroporto, país e código para evitar essa confusão.

Regiões usam o continente e o país da fonte. América Central e Caribe têm lista explícita de países/territórios e são separados da América do Norte. São classificações geográficas do catálogo, não avaliação sobre condições de viagem.

O círculo do mapa filtra aeroportos pela distância geodésica em linha reta. Não representa tempo de trem, distância por estrada, deslocamento disponível ou custo de transporte. O limite entre aeroporto de entrada e saída continua sendo uma condição separada, quando configurado.
