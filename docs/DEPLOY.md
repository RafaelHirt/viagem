# Publicação no Netlify

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
| `SERPAPI_API_KEY` | Consultar passagens reais. Conta e chave devem ser criadas e fornecidas pelo usuário. |
| `BOOKING_API_TOKEN`, `BOOKING_AFFILIATE_ID` | Nomes reservados para incorporar a conexão Booking já definida. O adaptador de hotéis está pendente neste checkout; preencher esses valores sozinho não o implementa. |
| `ENABLE_SCHEDULED_COLLECTION` | `true` para habilitar a coleta programada depois da validação; ausente ou `false` a mantém desligada. |
| `RESEND_API_KEY`, `ALERT_FROM_EMAIL` | Transporte de e-mail, com remetente autorizado. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Bot e chat de destino do Telegram. |

O armazenamento em Netlify Blobs usa o contexto do site e das funções. Não requer criar uma senha de banco ou expor um token de armazenamento na interface.

## Coleta e alertas

A tarefa está configurada para 11h e 23h UTC, correspondentes a 8h e 20h em São Paulo no fuso atual. O agendador deve permanecer desligado enquanto a fonte não estiver validada para o uso pretendido.

O coletor processa no máximo dois monitores habilitados por rodada. Na versão inicial, cada pesquisa faz uma chamada de descoberta; isso representa até quatro chamadas agendadas por dia. Pesquisas manuais consomem consultas adicionais. Essa contagem não é uma garantia de cobertura anual nem um limitador global da franquia do fornecedor.

O fornecedor publica 250 consultas mensais no plano gratuito. Uma descoberta duas vezes por dia dá até 60 consultas por monitor em 30 dias; confirmações, seleção de retorno e pesquisas manuais podem custar mais. Confira a cota na conta antes de ampliar a coleta.

Nesta versão, candidatos SerpApi são mantidos como **não confirmados**, e a exploração flexível informa cobertura parcial. Esses resultados não alimentam uma média comparável nem disparam alertas reais. O transportador de notificações só deve enviar uma oferta confirmada, com histórico válido e queda suficiente. O mínimo inicial implementado é sete dias válidos; o painel mostra o tamanho real da amostra.

## Validação antes de considerar a fonte operacional

1. Acessar o painel com a senha privada.
2. Configurar a chave SerpApi no servidor e pesquisar a origem real do usuário.
3. Conferir BRL, passageiros, bagagem, condições e preço na página do vendedor.
4. Completar a seleção do retorno e as opções de compra antes de habilitar alertas de preço confirmado.
5. Verificar a integração de hotel já existente no ambiente em que ela está configurada e incorporá-la aqui sem copiar segredos para o repositório.
6. Configurar canais e verificar destinatários; então validar um envio autorizado de teste.

Nenhum pagamento, reserva, contratação ou envio real foi realizado na preparação deste repositório.
