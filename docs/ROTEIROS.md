# Roteiros por vários países

Em **Buscar viagem → Vários países**, escolha uma **cidade obrigatória**, de dois a cinco países, transporte, limite por trecho e área de exploração. A cidade pode ser entrada, saída ou parada intermediária. O aeroporto do voo é escolhido separadamente; marcar Paris não obriga a chegar por Paris.

Países marcados são obrigatórios. Para fixar a ordem, marque todos e desative a ordem livre. Cada área deve conter ao menos uma cidade visitada; há no máximo uma área por país desejado, e uma área pode abranger vários países. Países distintos são contados uma vez. Pode haver várias paradas no mesmo país para respeitar o tempo de cada deslocamento.

## Trem na Europa

`rail-network.ts` guarda uma rede limitada de cidades, conexões e faixas indicativas de duração, editadas manualmente, com links dos operadores. Não consulta horários, obras, conexões disponíveis ou preços para a data escolhida. As faixas não são uma garantia de tempo real; a presença de um link oficial não significa que um horário foi consultado nesse site.

A busca usa somente conexões dessa rede e aplica o limite ao maior tempo de cada faixa. Não inventa Bruxelas → Milão como um deslocamento direto de3h. Paris → Bélgica → Holanda pode ser uma opção; Paris → Suíça → Itália pode exigir Estrasburgo, Basileia, Zurique e Lugano como paradas para que cada trecho da prévia caiba no limite. A lista mostra a duração de cada trecho e como consultar o operador.

No mapa, o círculo delimita a área geográfica. As linhas verdes mostram conexões de referência da cidade obrigatória que cabem nas horas escolhidas; não são uma isócrona de viagem acumulada. A rota selecionada tem segmentos e pontos numerados. Linhas são esquemáticas, não a geometria dos trilhos. Ao mudar de2h para48h, as conexões mudam, mesmo que o raio geográfico continue igual.

As alternativas procuram mostrar direções diferentes. A busca é limitada: beam256, até10 expansões e amostra de alternativas. Uma sequência não encontrada não prova ausência de trem real. Cidades fora da rede não recebem conexões ferroviárias por uma fórmula de distância.

## Outros meios

A prévia geográfica para carro/avião usa coordenadas como referência e distância geodésica. As faixas, em horas, são:

| Modo | Inferior indicativo | Superior indicativo |
| --- | --- | --- |
| Carro | distância ×1,15 ÷95 +0,25 | distância ×1,55 ÷65 +0,75 |
| Avião | distância ÷800 +3 | distância ÷500 +5 |

Arredondamos para cima em5 minutos. São hipóteses de planejamento: não confirmam estrada, voo, travessia, fronteira, serviço ou tarifa. O limite usa o extremo superior. O modelo geográfico anterior permanece para compatibilidade de dados; não deve ser apresentado como horário ferroviário.

## Ligação com preços aéreos

`tripPlan` é validado e persistido com os critérios do alerta. Entrada e saída de uma oferta, quando conhecidas, ficam fixas na prévia daquela oferta. Uma ida e volta pelo mesmo aeroporto precisa incluir também o caminho de retorno dentro do limite por trecho. A prévia sem tarifa pode ter outra ordem.

Em datas exatas e sem entrada aérea fixa, a busca pode amostrar até3 pares de entrada/saída de roteiros compatíveis, preservando as datas. Para períodos flexíveis, a descoberta e amostras continuam limitadas. Não é uma busca de todas as combinações nem prova de menor orçamento total.

O preço inclui somente a passagem aérea informada pela fonte. Trens, carros, voos internos e hotéis não estão cotados. Candidatos sem confirmação do retorno/total continuam fora da média válida e dos avisos de queda confirmada. A confirmação de criação do alerta é outro evento.

## Edição e dados antigos

O cadastro novo usa `requiredAirport` como referência da cidade obrigatória. `startAirport` permanece para ler alertas antigos que fixavam a entrada. Ao abrir edição, a referência pode ser migrada para cidade obrigatória; o aeroporto de chegada salvo continua visível e pode ser liberado nas preferências. Mudar critérios separa o histórico por `criteriaVersion`.

Os aeroportos vêm do catálogo descrito em [DADOS-GEOGRAFICOS.md](DADOS-GEOGRAFICOS.md). A rede ferroviária usa centros de cidades para desenhar o mapa, aeroportos de referência para ligação com a busca aérea e uma identificação suíça para a estação de Basileia, apesar da localização francesa do aeroporto compartilhado.

## Operação do mapa

Arraste a bolha para mover a área; puxe a borda ou uma das quatro alças para mudar o raio. O slider é alternativa por teclado. Arrastar fora da bolha move a câmera. Mapas salvos são somente leitura. No modo ferroviário, ampliar a área não dispensa o limite de tempo das conexões.
