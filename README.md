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

- Explorar passagens com datas exatas ou descobrir ofertas com duração variável; apresenta a cobertura retornada, sem inventar preços.
- Consultar itinerários com cidades de chegada e saída diferentes em datas definidas e validar a distância entre aeroportos conhecidos.
- Criar, pausar, consultar e excluir monitores, com persistência local ou Netlify Blobs no deploy.
- Calcular a média dos menores preços diários anteriores, excluindo hoje, dados incompletos e dias ausentes.
- Proteger a API por senha e manter credenciais fora do navegador.

## Limites atuais

A documentação, os parâmetros e o adaptador da SerpApi foram verificados; **a busca autenticada ainda precisa ser executada com uma chave válida**. A fonte tem um plano gratuito publicado de 250 consultas por mês, sujeito às condições atuais. Nenhum plano foi contratado.

Os resultados de passagens desta versão são candidatos: a sequência completa de seleção do retorno e confirmação das opções de compra ainda não está implementada. Portanto não geram alertas de preço confirmado. A exploração flexível é uma amostra de ida e volta pela mesma cidade; não cobre exaustivamente um ano nem todos os pares de entrada e saída. Consultas exatas suportam o formato multicidade.

Booking permanece a fonte de hotéis confirmada pelo usuário. Sua conexão existente não está presente neste checkout; o adaptador autenticado de hotéis precisa ser incorporado ao servidor. Não existe consulta de hotel fictícia no lugar dessa integração.

A coleta agendada começa desativada. E-mail e Telegram têm transportes implementados, mas precisam de credenciais, histórico suficiente e ofertas confirmadas para enviar alertas reais. Nenhuma notificação foi enviada durante a configuração.

## Documentação

- [Escopo e critérios de aceitação](docs/PRODUTO.md).
- [Validação atual da fonte de passagens](docs/VALIDACAO-AEREOS.md).
- [Pesquisa e comparação dos fornecedores](docs/FONTES.md).
- [Publicação e configuração](docs/DEPLOY.md).
