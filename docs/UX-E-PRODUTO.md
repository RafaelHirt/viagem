# Experiência e evolução do Partiu

Revisão em 17/10/2026. Uso pessoal por senha mantido por decisão do usuário. A revisão aplica clareza das ações, redução de preenchimento repetido, apresentação progressiva, acessibilidade e feedback de erro. Não há experimento com usuários nem prova de aumento de conversão.

## Fluxo principal

1. Escolher origem, destino ou cidade obrigatória do roteiro.
2. Definir período, dias, duração e viajantes. Aeroportos da mesma cidade podem ser comparados juntos; o formulário mostra seus nomes, não exige conhecer IATA.
3. Opcionalmente marcar **Quero acompanhar o preço desta viagem**, informar nome/e-mail e regra. O botão final passa a **Buscar e criar alerta**, deixando a ação explícita. Uma falha na pesquisa preserva o alerta; repetir a mesma busca na sessão reutiliza o cadastro conhecido.
4. Comparar resultados ordenados. Horários, duração e escalas distinguem voos com preço/companhia iguais. Apenas duplicações comprovadas são removidas; dados insuficientes não são tratados como prova de duplicidade.
5. Criar um alerta depois da busca continua disponível. Quando ele já foi criado no formulário, a ação mostra **Ver meu alerta**. O CTA tem contraste, animação única de entrada e permanece visível no celular. A preferência de movimento reduzido é respeitada.
6. Em Meus alertas, editar critérios, consultar, ordenar e abrir histórico. O histórico tem fechamento textual, Esc, contenção/restauração do foco e link da passagem quando seguro.

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

Recomendação de slogan para o futuro: **Partiu. Sua próxima viagem, na hora certa.**

Alternativas para testar: **Mais destinos, menos procura.** e **Oportunidades que viram viagens.** A recomendação não foi imposta à identidade atual. A interface preserva o verde e fonte sem serifa, com texto principal legível, contraste e ações identificáveis sem depender de animação.

## Monetização a validar

Começar com pesquisa limitada gratuita, alertas essenciais e links afiliados quando houver contrato que permita a integração. Uma assinatura pode cobrar por mais alertas, frequência de atualização, filtros e planejamento de vários países. Uma faixa de R$19,90–39,90/mês pode ser uma hipótese de teste, sem tratar isso como preço validado ou previsão de faturamento.

Afiliados de hotéis, seguro e atividades podem complementar a receita. O conector de hotéis ainda está pendente; não anunciar parceria ou comissão existente. Patrocínios, se houver, precisam ser identificados e separados da classificação dos resultados por preço.

Calcular margem antes de definir plano: usuários ativos × alertas × consultas/dia × dias × chamadas por consulta, mais buscas manuais, notificações, hospedagem e suporte. Exemplo hipotético de operação futura:100 usuários ×3 alertas ×1 rodada/dia ×30 dias ×2 chamadas =18.000 chamadas/mês; com4 chamadas seriam36.000. Isso não descreve a configuração atual do agendador, limitada a2 monitores por rodada global. Custos reais dependem do contrato do fornecedor e do uso medido.

Antes de vender, validar tarifas/retornos e envio real, confirmar direito de uso comercial e redistribuição das fontes, separar contas e aplicar limites de uso. Priorizar ativação (busca concluída e primeiro alerta), retorno ao produto, entrega de e-mails, conversão afiliada, custo por usuário e cancelamento. Não foi instalado rastreamento adicional nesta revisão.

## Evidência

Testes automatizados cobrem distinção de voos, ordenação, aeroportos alternativos enviados à fonte em uma chamada, confirmação idempotente de cadastro, comparação histórica e cidade obrigatória em qualquer posição com limites ferroviários por trecho. A QA do navegador usa API/armazenamento locais reais e tarifas/logos explicitamente simulados; não comprova uma tarifa, trem ou entrega de e-mail ao vivo.

Nesta revisão passaram131 testes automatizados e o build TypeScript/Vite. A QA local percorreu criação durante a busca, aeroportos alternativos, 30%/180 dias, ordenação, duplicatas, logo/fallback, CTA móvel, histórico com Esc/foco/link e conexões de2–48h na prévia. Não houve tarifa, trem ou entrega de e-mail ao vivo verificados.
