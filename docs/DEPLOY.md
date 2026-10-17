# Publicação no Netlify

Endereço atual informado pelo usuário: https://partiu-viagem.netlify.app/ . O endereço antigo `viagem-rafael.netlify.app` foi substituído.

O aplicativo é pessoal. A publicação dos arquivos da interface não torna públicas as operações privadas: elas exigem a senha definida no servidor.

## Conectar o repositório

Depois que existir um commit enviado à branch `main` de `RafaelHirt/viagem`, volte à seleção do repositório no Netlify e atualize a lista. O aviso de repositório vazio deixa de se aplicar quando o GitHub tem esse commit.

O `netlify.toml` define:

| Campo | Valor |
| --- | --- |
| Branch de produção | Escolher `main` na interface Netlify |
| Build | `npm run build` |
| Diretório publicado | `dist` |
| Funções | `netlify/functions` |
| Node de build | 24 |

O deploy da interface é independente da configuração das fontes. A falta de uma chave é mostrada como configuração necessária, sem inventar ofertas e sem abrir consultas anônimas ao fornecedor.

## Variáveis do servidor

Preencha valores apenas nas variáveis de ambiente do Netlify, disponíveis às funções, ou em `.env.local` no desenvolvimento. Faça um novo deploy após alterar variáveis de produção. Não use prefixo `VITE_` nas credenciais: esse prefixo é destinado a valores públicos da interface.

| Variável | Finalidade |
| --- | --- |
| `DASHBOARD_PASSWORD` | Senha privada de acesso, pelo menos 12 caracteres no deploy. Obrigatória para operações privadas. |
| `SERPAPI_API_KEY` | Consultar passagens reais. Conta, chave e cota são geridas pelo responsável pela instalação, sem exigir uma conta SerpApi de cada futuro passageiro. |
| `BOOKING_API_TOKEN`, `BOOKING_AFFILIATE_ID` | Nomes reservados para incorporar a conexão Booking já definida. O adaptador de hotéis está pendente neste checkout; preencher esses valores sozinho não o implementa. |
| `BOOKING_HOTEL_CATALOG_PATH` | Desenvolvimento: caminho de um catálogo privado importado legitimamente da Booking. No Netlify, a pesquisa pode ler o store privado `viagem-booking-catalog`, chave `index.json`. Sem índice, a lista permanece indisponível. Ver [hotéis](HOTEIS.md). |
| `ENABLE_SCHEDULED_COLLECTION` | `true` para habilitar a coleta programada depois da validação; ausente ou `false` a mantém desligada. |
| `RESEND_API_KEY`, `ALERT_FROM_EMAIL` | Transporte de e-mail, com remetente autorizado. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Bot e chat de destino do Telegram. |

O armazenamento em Netlify Blobs usa o contexto do site e das funções. Não requer criar uma senha de banco ou expor um token de armazenamento na interface.

Se a chave aérea aparecer presente mas o painel continuar bloqueado pela senha, confira o contexto **Production** de `DASHBOARD_PASSWORD`, o escopo **Functions** e o mínimo de 12 caracteres. Salvar uma variável não atualiza as funções de um deploy já publicado: faça novo deploy. O status agora distingue senha não recebida de senha recebida com menos de 12 caracteres; o valor nunca é exposto pelo diagnóstico.

## Coleta e alertas

A tarefa está configurada para 11h e 23h UTC, correspondentes a 8h e 20h em São Paulo no fuso atual. O agendador deve permanecer desligado enquanto a fonte não estiver validada para o uso pretendido.

O coletor processa no máximo dois monitores habilitados por rodada. Uma pesquisa flexível pode fazer uma chamada de descoberta e, se não houver resultados compatíveis, até três consultas de combinações de aeroportos e datas. São até quatro chamadas por pesquisa; com dois monitores em duas rodadas, até 16 chamadas por dia. Um par multicidade fixo com datas livres usa até três combinações. Pesquisas manuais consomem consultas adicionais. Essa contagem não é uma garantia de cobertura anual nem um limitador global da franquia do fornecedor.

O fornecedor publica 250 consultas mensais no plano gratuito. No pior caso, um monitor duas vezes por dia pode usar 240 chamadas em 30 dias com a busca alternativa, antes de consultas manuais ou confirmações adicionais. Dois monitores podem ultrapassar essa franquia. Mantenha o agendador desligado até definir uma coleta compatível com a cota e validar tarifas.

Nesta versão, candidatos SerpApi são mantidos como **não confirmados**, e a exploração flexível informa cobertura parcial. Esses resultados não alimentam uma média comparável nem disparam alertas reais. O transportador de notificações só deve enviar uma oferta confirmada, com histórico válido e queda suficiente. O mínimo inicial implementado é sete dias válidos; o painel mostra o tamanho real da amostra.

## Validação antes de considerar a fonte operacional

1. Acessar o painel com a senha privada.
2. Configurar a chave SerpApi no servidor e pesquisar a origem real do usuário.
3. Conferir BRL, passageiros, bagagem, condições e preço na página do vendedor.
4. Completar a seleção do retorno e as opções de compra antes de habilitar alertas de preço confirmado.
5. Obter acesso elegível à Booking Demand, importar o catálogo autorizado e implementar/validar o conector de preços. Booking foi escolhido como fonte; ainda não existe uma integração real neste projeto.
6. Configurar canais e verificar destinatários; então validar um envio autorizado de teste.

Nenhum pagamento, reserva, contratação ou envio real foi realizado na preparação deste repositório.

## Consultas em segundo plano

O deploy deve incluir `netlify/functions/search-background.ts`. O sufixo `-background` é parte do nome da função e permite que a busca continue depois da resposta inicial. A interface cria um job em `/api/search-jobs`, aciona o worker e consulta o estado autenticado. O worker usa a mesma senha/sessão e as mesmas verificações de origem; não há endpoint público para consultas pagas.

O store privado `viagem-search-jobs-v1` usa leitura forte e gravação condicional para impedir execução duplicada. Jobs ficam acessíveis por dez minutos; essa expiração lógica não é uma política de exclusão física dos blobs. Não exige variável de acesso nova. Autenticação, Blobs, publicação do worker e uma busca real autenticada precisam ser conferidos no deploy antes de anunciar o serviço operacional.

Validação local desta atualização: 117 testes automatizados passaram e o build TypeScript/Vite passou. O navegador verificou login, criação persistente, primeira consulta em segundo plano, preservação do alerta após falha, preços sem base presumida, rota/datas/duração, larguras de 390 a 1440 px, arraste da bolha e redimensionamento pela borda com mouse e toque. Ofertas de QA são respostas controladas no navegador ou em uma API local isolada com adaptador injetado; nenhuma tarifa real da conta foi confirmada nesta máquina, pois `SERPAPI_API_KEY` ainda não está vinculada ao ambiente cloud.


## Busca única e validação dos passageiros

O menu inicial é Buscar viagem. Criar alerta desta busca abre somente nome, e-mail de destino e regras opcionais. Meus alertas contém consultas salvas e edição. As conexões técnicas ficam recolhidas em Administração da ferramenta; o usuário informa o e-mail dentro do produto, sem criar conta em um serviço de envio. O acesso permanece pessoal por senha; contas públicas/Google não foram habilitadas.

Na criação, sourceSearchJobId permite reaproveitar um resultado concluído que ainda esteja no store privado (10 minutos). A API compara os critérios validados e copia o menor preço elegível do resultado do servidor. Não aceita preço enviado pelo navegador. A observação inicial permanece incompleta, fora da média e sem notificação; salvar não dispara outra busca quando o preço foi reaproveitado. Se o job expirou ou não trouxe preço, o cadastro é preservado e uma nova consulta pode ser necessária.

A busca flexível para mais de um adulto usa a promoção apenas como indicação de rota/datas e faz nova cotação com google_flights e deep_search=true. É necessário comprovar os adultos na resposta ou no link da fonte; divergência é falha, não tarifa zero. Links Google que comprovam um adulto são recusados para dois. Links sem passageiros verificáveis são omitidos em buscas de grupo. Não se alteram parâmetros opacos de um link nem se multiplica a tarifa antiga para inventar um total. A chave configurada no Netlify continua separada do ambiente de testes.

## Confirmação de cadastro e revisão de UX

O formulário permite definir o alerta antes de pesquisar, com ação explícita Buscar e criar alerta. O cadastro é persistido antes da consulta para sobreviver a falhas da fonte; o job retorna as ofertas e atualiza o histórico sem repetir a busca. O fluxo de criação posterior continua usando o resultado privado do servidor.

A criação tenta enviar um recibo por e-mail quando o usuário informou destinatário. `RESEND_API_KEY` e `ALERT_FROM_EMAIL` devem estar configurados no escopo Functions do Netlify, com remetente autorizado no provedor. Sem essas variáveis, a API registra `creationEmail.status=not-configured`; não anuncia envio bem-sucedido. Resposta aceita comID é necessária para marcar sent. A confirmação possui chave idempotente por alerta/destinatário; falhas são repetíveis em POST /api/monitors/:id/confirmation, com autenticação. Ela não depende de preço confirmado, ao contrário dos avisos de queda. Nenhuma mensagem real foi enviada durante os testes.

Aeroportos alternativos são guardados em originAirports, arrivalAirports e departureAirports. A fonte exata recebe IDs separados por vírgula numa chamada; os aeroportos efetivamente retornados são validados. Os critérios e a apresentação distinguem esses conjuntos dos aeroportos observados no voo.

Resultados removem repetições comprovadas, permitem ordenação e mostram horários/escalas. Logos são aceitos do CDN público da fonte, com alternativa textual. O histórico possui botão textual de fechamento, Esc, foco contido/restaurado e links seguros das passagens. Leia UX-E-PRODUTO.md para limitações, comparação180 dias, slogan e hipóteses de monetização.
