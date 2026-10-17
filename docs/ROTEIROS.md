# Prévia de roteiros por vários países

Em **Explorar agora → Passagens aéreas → Vários países**, o usuário escolhe de dois a cinco países, marca de uma a cinco áreas e indica transporte e limite de tempo por trecho. A quantidade de áreas não pode superar a quantidade de países. Uma área pode abranger vários países; a prévia precisa visitar todas as áreas e conter exatamente a quantidade de países diferentes escolhida. Há uma cidade de referência por país, além de eventual retorno à cidade de entrada.

Países sem marcação ficam livres dentro das áreas. Os países marcados são obrigatórios. Para fixar a ordem, todos os países devem ser escolhidos; vale a sequência dos cliques. A opção de ordem livre busca uma sequência menor em distância dentro da amostra, sem afirmar que é a mais barata.

O botão **Experimentar França, Bélgica e Holanda** preenche um exemplo editável usando áreas em torno de aeroportos reais. Não injeta tarifas ou resultados de fornecedores. Os países e aeroportos vêm do catálogo descrito em [DADOS-GEOGRAFICOS.md](DADOS-GEOGRAFICOS.md); o termo país segue a classificação do catálogo, que inclui territórios.

## Como os tempos são estimados

Não existe integração com um serviço de rotas, trânsito, ferrovias ou horários nesta versão. Usamos coordenadas dos aeroportos como referência aproximada das cidades, distância geodésica e o seguinte modelo, em horas:

| Modo | Limite inferior indicativo | Limite superior indicativo |
| --- | --- | --- |
| Carro | distância × 1,15 ÷ 95 + 0,25 | distância × 1,55 ÷ 65 + 0,75 |
| Trem | distância × 1,15 ÷ 180 + 0,5 | distância × 1,6 ÷ 90 + 1 |
| Avião | distância ÷ 800 + 3 | distância ÷ 500 + 5 |

Cada valor é arredondado para cima em cinco minutos. Essas constantes são hipóteses de planejamento, não dados de uma transportadora. O avião inclui margem para acesso, antecedência e desembarque; carro/trem incluem margens para desvio e acesso. O limite escolhido pelo usuário usa o extremo superior da faixa. Não verificamos se existe uma estrada, trem, voo, travessia ou conexão entre as cidades. Mar, montanhas, fronteiras e horários podem tornar a estimativa inadequada. A interface exibe essa limitação e um detalhe com o método.

As linhas no mapa conectam referências geográficas; não desenham estradas ou linhas ferroviárias. O enquadramento automático mostra as bolhas juntas e o controle de enquadrar permite recuperar a visão do conjunto. Novas áreas podem ser posicionadas por clique ou pelo botão de marcar no centro; cada área tem raio editável e botão de remoção.

## Busca limitada e ligação com preços

O planejador considera até um aeroporto de referência por país/área, mais os aeroportos efetivos de uma oferta. Limita a amostra a 24 países, preservando os obrigatórios, e mantém até 96 caminhos por etapa. Não encontrar um caminho nessa busca não comprova inexistência de um roteiro real.

`tripPlan` é validado pela API e persistido junto ao monitor. A API rejeita países desconhecidos/duplicados, coordenadas inválidas, contagens fora do limite e limites de tempo fora de 1–48 horas. Uma área simples e um roteiro não podem ser enviados simultaneamente.

Quando há pesquisa de passagens, a descoberta continua usando a fonte já implementada: candidatos de ida e volta pelo mesmo aeroporto, ou um par exato multicidade quando há datas e aeroportos definidos. Avaliamos no máximo os 20 candidatos aéreos mais baratos da amostra, montando uma prévia ancorada nos aeroportos efetivos de cada oferta. Para ida e volta no mesmo aeroporto, incluímos o deslocamento de retorno no roteiro e no limite por trecho. Uma prévia sem tarifa é apenas uma possibilidade, e pode ter ordem diferente da prévia ligada a uma passagem.

O valor exibido é somente o informado pela fonte aérea. Trens, carros, voos internos e hotéis não têm cotação, e o sistema não calcula o menor orçamento total da viagem. O roteiro geográfico e o preço candidato permanecem sem confirmação; não geram alertas de tarifa confirmada. As regras de um alerta podem ser salvas, mas isso não conclui a integração de tarifas nem ativa notificações.

## Configuração de acesso

`/api/status` informa `authConfiguration` como `missing`, `too-short` ou `ready`, sem expor o valor nem o tamanho exato da senha. Em produção, senha com menos de 12 caracteres mantém as operações privadas bloqueadas. A interface orienta editar `DASHBOARD_PASSWORD` no contexto **Production** do Netlify e fazer novo deploy. Não existe senha substituta ou atalho de autenticação em produção.
