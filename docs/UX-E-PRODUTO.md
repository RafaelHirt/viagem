# Experiência e evolução do Partiu

Revisão em 17/10/2026. Uso pessoal por senha mantido por decisão do usuário. A revisão aplica clareza das ações, redução de preenchimento repetido, apresentação progressiva, acessibilidade e feedback de erro. Não há experimento com usuários nem prova de aumento de conversão.

## Fluxo principal

1. Escolher origem, destino ou de uma a cinco cidades obrigatórias do roteiro. As cidades podem estar na entrada, no meio ou na saída. O total escolhido conta países distintos: Paris + Lyon definem um país; Paris + Milão definem dois. Com três países desejados, o restante fica livre. O formulário mostra essa contagem, permite remover cidades e amplia a área quando uma nova cidade fica fora dela.
2. Definir período, dias, duração e viajantes. Aeroportos da mesma cidade podem ser comparados juntos; o formulário mostra seus nomes, não exige conhecer IATA.
3. Opcionalmente marcar **Quero acompanhar o preço desta viagem**, informar nome/e-mail e regra. O botão final passa a **Buscar e criar alerta**, deixando a ação explícita. Uma falha na pesquisa preserva o alerta; repetir a mesma busca na sessão reutiliza o cadastro conhecido.
4. Comparar resultados ordenados. Horários, duração e escalas distinguem voos com preço/companhia iguais. Apenas duplicações comprovadas são removidas; dados insuficientes não são tratados como prova de duplicidade.
5. Criar um alerta depois da busca continua disponível. Quando ele já foi criado no formulário, a ação mostra **Ver meu alerta**. O CTA tem contraste, animação única de entrada e permanece visível no celular. A preferência de movimento reduzido é respeitada.
6. Em Meus alertas, editar critérios, consultar, ordenar e abrir histórico. O histórico tem fechamento textual, Esc, contenção/restauração do foco e link da passagem quando seguro.
7. Configurações mostra os canais disponíveis, o estado da atualização e os caminhos para buscar ou ver alertas. Chaves, fornecedores, Netlify e agendamento ficam dentro de **Área técnica · para quem administra**. WhatsApp é mostrado como indisponível, sem botão que simule uma conexão.

## Cidades obrigatórias e comparação de preço

Todas as cidades devem aparecer em cada prévia anexada a uma cotação. Paris + Milão com três países e até três horas por trecho, por exemplo, pode passar por cidades da Suíça; cada conexão precisa obedecer ao limite. Paris + Lyon continua exigindo outros dois países. Na Europa ferroviária, cidades fora da rede de referência não recebem conexões inventadas.

O algoritmo mantém uma busca limitada de combinações. Na busca aérea compara as tarifas retornadas para aeroportos de entrada/saída de roteiros compatíveis, preservando datas e passageiros. Não procura exaustivamente todos os terceiros países nem calcula o menor custo da viagem inteira: trens, hotéis, deslocamentos até aeroportos e atividades não estão cotados. As possibilidades no mapa são referências geográficas/ferroviárias, não uma ordenação por custo total.

## Estados que devem continuar honestos

- **Horários da volta a confirmar** significa que as datas foram pesquisadas, mas a integração ainda não selecionou/comprovou o voo de retorno. Os detalhes explicam isso; o texto não atribui uma tarefa pendente ao usuário.
- `priceBasis=unknown` continua sem conversão por pessoa/grupo. Ofertas e comparações não devem ser anunciadas como reserva confirmada.
- E-mail de **alerta criado** confirma o cadastro e independe de tarifa. Regra de queda, histórico e agendamento são outro evento. Sem transporte configurado, a busca fica salva e a tela informa que a confirmação não foi enviada.
- Trens europeus usam conexões e faixas de referência editadas manualmente, com links dos operadores; não são horários ao vivo. Cada aresta da prévia respeita o limite superior da faixa. Cidades fora dessa rede não ganham conexões por distância em linha reta.

## Comparação de 30% / 180 dias

A referência é a média dos menores preços de cada dia de consulta anterior, em America/Sao_Paulo, dentro da janela escolhida. Hoje, dados incompletos, critérios anteriores à edição, passageiros incompatíveis e bases diferentes de preço ficam fora. Repetir consultas no mesmo dia não aumenta seu peso.

Se a busca é sexta–domingo, os preços elegíveis devem continuar com esses dias, duração e demais critérios. Em datas flexíveis, diferentes consultas podem encontrar fins de semana diferentes no período permitido. O cálculo compara o conjunto de preferências salvo; não exige o mesmo número de voo. Por exemplo, média válida de R$1.000 e preço comparável atual de R$700 representam queda de30%.

Escolher180 dias não fornece180 dias retroativos. O painel precisa construir o histórico e exige ao menos7 dias válidos por padrão. O adaptador aéreo atual ainda retorna candidatos não confirmados; portanto não envia avisos de queda confirmada. Não apresentar percentuais como oportunidade comprovada sem esses requisitos.

## Texto e marca

Slogan curto, com foco em economia: **Partiu. Viaje por menos.** O rodapé já usa **Viaje por menos.** ao lado da marca.

Alternativa para testar: **Seu próximo destino. Por menos.** Evitar prometer o menor preço garantido. A interface preserva o verde e fonte sem serifa, com texto principal legível, contraste e ações identificáveis sem depender de animação.

## WhatsApp

A integração ainda não foi implementada. O caminho é a WhatsApp Business Platform, por API da Meta ou provedor como Twilio. Para um piloto: habilitar uma conta/número de empresa, configurar a credencial no servidor, obter autorização do destinatário e aprovar o modelo de mensagem para avisos proativos. Um cadastro no aplicativo WhatsApp Business, sozinho, não conecta a API.

Avisos enviados fora da janela de atendimento precisam seguir as regras de modelos da plataforma. A categoria do modelo deve ser aprovada pelo fornecedor; não presumir que um aviso de oportunidade seja uma mensagem transacional gratuita. Valores dependem do país, categoria, regras vigentes e taxas do provedor. Documentação oficial tentou ser consultada em17/10/2026, mas o proxy do ambiente bloqueou os destinos; nenhuma tabela de preços atual foi verificada.

Implementação necessária: telefone com código do país, registro da autorização, seleção de canal por alerta, confirmação de cadastro separada da queda de preço, fila com tentativas controladas e deduplicação, webhook autenticado para estados de entrega, opção de parar e supressão de novos envios. Validar primeiro a confirmação de cadastro; avisos de queda também dependem de tarifa confirmada e histórico comparável, ainda pendentes no adaptador atual. Nenhuma conta, número ou contratação foi criada, e nenhuma mensagem real foi enviada.

Referências para a configuração futura: [WhatsApp Business Platform](https://business.whatsapp.com/products/business-platform), [preços da Meta](https://business.whatsapp.com/products/platform-pricing) e [modelos de notificação na Twilio](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates).

## Contas e chave compartilhada

O acesso continua pessoal por escolha do usuário. Para abrir ao público, a recomendação é **Continuar com Google** e alternativa por e-mail com link de acesso, sem obrigar a criar outra senha. Isso exige autenticação no servidor, e-mail verificado, isolamento de alertas/histórico/jobs/destinatários por usuário, recuperação/saída, limites de consumo e autorização em todas as rotas. Colocar um botão de Google sobre a senha compartilhada atual não implementa essas garantias.

Priorizar a validação de tarifas e de um envio real de e-mail antes de abrir cadastros. Login não resolve as pendências de preços e notificações. Futuros usuários podem usar o contrato e a chave do operador, sempre no servidor, sem conta individual na SerpApi. Cache, orçamento global e limites por usuário controlam o consumo. Confirmar condições comerciais e permissão de uso da fonte antes de oferecer planos públicos.

## Monetização a validar

Começar com pesquisa limitada gratuita, alertas essenciais e links afiliados quando houver contrato que permita a integração. Uma assinatura pode cobrar por mais alertas, frequência de atualização, filtros e planejamento de vários países. Uma faixa de R$19,90–39,90/mês pode ser uma hipótese de teste, sem tratar isso como preço validado ou previsão de faturamento.

Afiliados de hotéis, seguro e atividades podem complementar a receita. O conector de hotéis ainda está pendente; não anunciar parceria ou comissão existente. Patrocínios, se houver, precisam ser identificados e separados da classificação dos resultados por preço.

Banners podem gerar receita, mas dependem de volume de visualizações e do valor efetivo pago por mil visualizações (RPM). Receita bruta aproximada = visualizações ÷1.000 × RPM; lucro desconta consultas à API, envio, hospedagem, suporte e demais despesas. Não há RPM nem tráfego medidos para prever o lucro deste produto. Banners não foram instalados; a hipótese inicial mais alinhada é afiliados e assinatura de alertas, preservando a experiência de busca.

Calcular margem antes de definir plano: usuários ativos × alertas × consultas/dia × dias × chamadas por consulta, mais buscas manuais, notificações, hospedagem e suporte. Exemplo hipotético de operação futura:100 usuários ×3 alertas ×1 rodada/dia ×30 dias ×2 chamadas =18.000 chamadas/mês; com4 chamadas seriam36.000. Isso não descreve a configuração atual do agendador, limitada a2 monitores por rodada global. Custos reais dependem do contrato do fornecedor e do uso medido.

Antes de vender, validar tarifas/retornos e envio real, confirmar direito de uso comercial e redistribuição das fontes, separar contas e aplicar limites de uso. Priorizar ativação (busca concluída e primeiro alerta), retorno ao produto, entrega de e-mails, conversão afiliada, custo por usuário e cancelamento. Não foi instalado rastreamento adicional nesta revisão.

## Evidência

Testes automatizados cobrem distinção de voos, ordenação, aeroportos alternativos enviados à fonte em uma chamada, confirmação idempotente de cadastro, comparação histórica e cidade obrigatória em qualquer posição com limites ferroviários por trecho. A QA do navegador usa API/armazenamento locais reais e tarifas/logos explicitamente simulados; não comprova uma tarifa, trem ou entrega de e-mail ao vivo.

Na revisão ampliada passaram138 testes automatizados e o build TypeScript/Vite. A cobertura inclui múltiplas cidades obrigatórias, duas cidades no mesmo país, normalização de aeroportos da mesma cidade, nomes reconhecíveis em vez de municípios dos aeroportos, preservação ao editar e exigência de todas as cidades nas cotações. A QA local percorreu criação durante a busca, aeroportos alternativos, 30%/180 dias, ordenação, duplicatas, logo/fallback, CTA móvel, histórico com Esc/foco/link e conexões de2–48h na prévia. Não houve tarifa, trem ou entrega de e-mail ao vivo verificados.

A QA adicional verificou Paris + Milão e Paris + Lyon, contagem dos países livres, gravação/edição por API local real sem forçar aeroporto de entrada, Configurações sem chaves técnicas visíveis por padrão e larguras de390 a1440 px. Os preços da API de QA continuaram explicitamente simulados.
