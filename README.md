# Partiu · Viagem

Painel pessoal para descobrir oportunidades de passagens e hotéis com foco em preço, datas flexíveis e alertas percentuais. React, TypeScript, funções Netlify e armazenamento durável em Netlify Blobs.

## Desenvolvimento

Node 24 é a versão indicada em `.nvmrc`; o mínimo é Node 22.13.

```sh
npm ci
npm run dev
```

O comando inicia Vite na porta 5173 e a API local na 8787. O acesso local usa a senha de desenvolvimento `viagem-local`, salvo se `DASHBOARD_PASSWORD` estiver definida. Dados locais ficam em `.local/data`, ignorada pelo Git. Não use essa senha pública no deploy.

Para configurar variáveis locais, copie `.env.example` para `.env.local` e preencha apenas as necessárias. Nunca versione esse arquivo. A API mantém as chaves no servidor.

```sh
npm test
npm run build
```

## Netlify

Conecte o repositório e selecione a branch `main`. O arquivo `netlify.toml` define o comando `npm run build`, a pasta publicada `dist`, as funções e os redirecionamentos.

Nas variáveis do projeto Netlify, configure `DASHBOARD_PASSWORD` com uma senha privada de pelo menos 12 caracteres e faça o deploy. Sem ela, operações privadas ficam bloqueadas; o aplicativo orienta a configuração. Para pesquisar passagens, configure também `SERPAPI_API_KEY` no escopo das funções.

Consulte [Publicação e configuração](docs/DEPLOY.md) para as variáveis de fonte, coleta e notificações. O envio inicial de código ao GitHub permite conectar o repositório; não substitui o deploy no Netlify nem fornece credenciais automaticamente.

## O que esta primeira versão faz

- Buscar passagens em um único fluxo, definir o alerta durante o preenchimento ou criá-lo depois do resultado, sem repetir a viagem. Os hotéis permanecem indisponíveis enquanto o conector não estiver pronto.
- Buscar cidade, país ou região na pergunta **Para onde você quer viajar?**, sem destino predefinido nem mapa obrigatório. Cartões visíveis incluem Estados Unidos/Caribe e um diretório reúne todos os países do catálogo. Regiões brasileiras como Nordeste usam estados reais; limitar uma região no mapa é opcional.
- Comparar aeroportos alternativos da mesma cidade na mesma consulta (como Galeão/Santos Dumont, Charles de Gaulle/Orly, Denver DEN/BJC e Orlando MCO/SFB, com indicação do principal).
- Ajustar percentual e período da referência nos campos visíveis do alerta; na revisão, **Alterar queda e período** volta diretamente a eles.
- Ordenar resultados, distinguir horários/escalas, remover duplicações comprovadas e mostrar logos fornecidos pela fonte.
- Enviar confirmação de cadastro por e-mail quando o transporte estiver configurado, com controle de duplicidade.
- Encontrar aeroportos digitando cidade ou nome, escolher regiões sugeridas e marcar uma área circular no mapa, sem precisar conhecer códigos ou estimar quilômetros.
- Planejar roteiros por dois a cinco países incluindo de uma a cinco cidades obrigatórias em qualquer posição. Cidades no mesmo país contam como um país; os países restantes ficam livres. Área ajustável e limite por trecho são preservados. A prévia ferroviária europeia usa conexões de referência; horários atuais e preços internos não são consultados. A comparação é entre as passagens aéreas amostradas, sem garantia do menor custo da viagem inteira.
- Ver o roteiro completo e ligações ferroviárias separadas para todas as cidades obrigatórias, com tempos e legendas por origem.
- Ver canais de aviso e atualização em Configurações, com instruções de fornecedores e Netlify recolhidas na área técnica. WhatsApp e cadastro público ainda não estão disponíveis.
- Explorar passagens com datas exatas ou descobrir ofertas com duração variável; apresenta a cobertura retornada, sem inventar preços.
- Consultar itinerários com cidades de chegada e saída diferentes em datas definidas e validar a distância entre aeroportos conhecidos.
- Salvar a busca concluída e seu preço no alerta sem consumir outra consulta, usando o resultado guardado no servidor; editar, pausar, consultar e excluir alertas com persistência.
- Calcular a média dos menores preços diários anteriores, excluindo hoje, dados incompletos e dias ausentes.
- Escolher períodos entre meses (por exemplo, fevereiro a outubro de 2027), dias de ida/volta como sexta–domingo, datas exatas e aeroportos independentes de chegada/retorno.
- Editar alertas salvos; mudanças de viagem preservam o histórico anterior separado da nova referência.
- Proteger a API por senha e manter credenciais fora do navegador.

## Limites atuais

A documentação e os testes do adaptador foram verificados; **a busca corrigida ainda precisa ser validada de ponta a ponta com a chave real**. A chave cadastrada no Netlify não está disponível automaticamente no ambiente cloud de desenvolvimento. O acesso continua pessoal por decisão do usuário; cadastro público e login com Google ficam para uma etapa futura, com dados separados por conta. Futuros usuários não devem precisar de conta própria na SerpApi: a contratação, as credenciais e a cota são responsabilidade de quem opera o serviço.

A fonte tem um plano gratuito publicado de 250 consultas por mês, sujeito às condições atuais. Nenhum plano foi contratado.

Os resultados de passagens desta versão são candidatos: a sequência completa de seleção do retorno e confirmação das opções de compra ainda não está implementada. Portanto não geram alertas de preço confirmado. A exploração flexível direciona o destino ao buscador de promoções e filtra os resultados pelas preferências. Sem resultados compatíveis, consulta até três combinações de datas/aeroportos; pares fixos diferentes podem usar multicidade. Para grupos, a descoberta fornece apenas aeroportos/datas: até três combinações são cotadas novamente no Google Flights com a quantidade solicitada. Respostas e links com passageiros incompatíveis são recusados, e preços antigos do grupo pedem nova consulta. A base por pessoa/total continua desconhecida até validação explícita; os valores não são multiplicados. Continua sendo uma amostra, sem cobertura exaustiva de um ano ou de todos os pares de entrada e saída.

Booking permanece a fonte de hotéis escolhida pelo usuário. O autocomplete pesquisa um índice privado quando houver um catálogo real importado; sem ele, informa que o nome não foi validado e bloqueia a seleção. O acesso de parceiro, a importação do catálogo e o adaptador autenticado de preços continuam pendentes. Não existe consulta de hotel fictícia no lugar dessa integração.

Como alternativa para um piloto pessoal, foi documentado Google Hotels pela SerpApi: pode retornar ofertas de vários vendedores, inclusive Booking, quando presentes na resposta. O adaptador ainda precisa ser implementado e validado; não é a API oficial da Booking e não foi ativado no lugar dela. Ver [caminhos para hotéis](docs/HOTEIS.md).

A coleta agendada começa desativada. E-mail e Telegram têm transportes implementados, mas precisam de credenciais, histórico suficiente e ofertas confirmadas para enviar alertas reais. Nenhuma notificação foi enviada durante a configuração.

## Documentação

- [Escopo e critérios de aceitação](docs/PRODUTO.md).
- [Validação atual da fonte de passagens](docs/VALIDACAO-AEREOS.md).
- [Pesquisa e comparação dos fornecedores](docs/FONTES.md).
- [Publicação e configuração](docs/DEPLOY.md).
- [Busca de hotéis e pré-requisitos Booking](docs/HOTEIS.md).
- [Origem e licença dos dados geográficos](docs/DADOS-GEOGRAFICOS.md).
- [Roteiros e método das estimativas de tempo](docs/ROTEIROS.md).

- [Revisão de UX, slogan e monetização](docs/UX-E-PRODUTO.md).
