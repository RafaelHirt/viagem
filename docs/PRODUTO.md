# Viagem — oportunidades de viagem com foco em preço

## Objetivo e estado atual

Encontrar oportunidades de viajar pagando menos, usando flexibilidade de datas, duração e aeroportos. O usuário escolhe onde quer ir e o sistema constrói uma referência de preço; não é obrigatório informar um preço máximo.

O escopo inicial é de uso pessoal, sem comercialização. A seleção de fornecedores deve priorizar acesso para projetos individuais e baixo custo operacional. Não foi definido um orçamento mensal de dados; uso pessoal não deve ser interpretado como autorização para contratar um serviço pago.

Este documento consolida o produto acordado e seus critérios de aceitação completos. A primeira implementação já inclui interface, API autenticada, monitores persistidos, cálculo histórico e adaptador de consulta SerpApi. Ainda não foi executada uma busca autenticada com chave nem confirmada uma tarifa real. A confirmação completa e a pesquisa flexível multicidade continuam pendentes; os alertas reais dependem dessas capacidades e das credenciais dos canais. O README descreve o escopo implementado. O Netlify é o destino de publicação; seu deploy é uma etapa separada do envio do código ao GitHub.

## Experiência principal

O painel terá passagens e hotéis, cada um com duas funções:

| Função | Resultado |
| --- | --- |
| Explorar agora | Consulta datas futuras e apresenta as melhores combinações encontradas, sem criar alertas. |
| Monitorar | Salva uma regra, acumula observações e avisa quando uma oferta atingir a queda percentual escolhida. |

Uma pesquisa de exploração poderá ser convertida em monitor. Cada resultado mostrará condições, fonte, vendedor quando disponível, momento da consulta e link de reserva. Dados demonstrativos, se usados no desenvolvimento, serão identificados claramente e não gerarão notificações.

## Passagens

O formulário deve permitir:

- Um ou mais aeroportos de origem, escolhidos pelo usuário; nenhuma origem foi informada ainda.
- Região, países, cidades ou aeroportos de destino; Europa é um caso principal.
- Datas flexíveis dentro do horizonte disponível no fornecedor, buscando até 12 meses quando suportado, ou intervalo escolhido.
- Duração mínima e máxima em dias. Todas as durações inteiras do intervalo serão consideradas: de 10 a 20 inclui 10, 11, 12 e assim por diante.
- Ida e volta pela mesma cidade ou chegada e saída por aeroportos diferentes, inclusive em países diferentes, dentro das restrições escolhidas.
- Distância máxima configurável entre o aeroporto de chegada na região e o aeroporto de saída para voltar. O mesmo aeroporto continua permitido.
- Países permitidos e excluídos, passageiros, cabine, bagagem e restrições de escalas e duração de voo.
- Queda percentual e janela histórica para o alerta. Preço máximo é opcional.

A distância inicial é geodésica, calculada com coordenadas conhecidas dos aeroportos. O painel explicará que isso não representa distância rodoviária nem tempo de viagem. Coordenadas ausentes não podem ser tratadas como distância zero. A regra se aplica aos aeroportos de chegada e saída da viagem, sem pressupor que também restrinja conexões.

Tempo e custo do deslocamento entre cidades só aparecerão quando houver fonte apropriada, com origem e momento da estimativa. Ausência desses dados será exibida como desconhecida, nunca como custo zero. Um voo mais barato não será apresentado como menor custo total de viagem sem incluir os deslocamentos relevantes.

O explorador deve ordenar oportunidades pelo preço total dos voos para os passageiros configurados e exibir também o equivalente por pessoa quando calculável. Deve identificar impostos, bagagem e cobranças incluídas ou desconhecidas. Uma combinação de bilhetes separados precisa ser identificada e não pode ser comparada silenciosamente com uma reserva única equivalente.

## Hotéis

O usuário escolhe o estabelecimento e a ocupação. Fasano Boa Vista é um exemplo solicitado. O Royal Tulip exato ainda precisa ser identificado; não se deve adivinhar a propriedade.

No explorador, poderá consultar datas específicas ou descobrir estadias futuras mais baratas dentro de um período. No monitor, poderá acompanhar padrões recorrentes sem fixar uma data de check-in:

- Sexta a domingo: duas noites.
- Domingo a sexta: cinco noites.
- Ambos: executar e apresentar duas séries separadas, mantendo a duração e o padrão de cada uma.

Para cada padrão, o sistema pesquisa futuras estadias elegíveis e acompanha o menor preço encontrado a cada dia. Assim, o alerta pode indicar uma data futura que ficou barata dentro daquela regra, sem afirmar que uma reserva de datas fixas sofreu a mesma queda.

A comparação deve manter estabelecimento, hóspedes e idades relevantes, quantidade de quartos, noites, categoria de quarto, alimentação, política de cancelamento e taxas equivalentes. Tarifas não equivalentes não entram na mesma série. O valor principal é o total da estadia para a ocupação configurada, com impostos e taxas informados; preço por noite é complementar.

Feriados, eventos e antecedência podem influenciar o resultado. Separar fins de semana de dias úteis melhora a comparação, mas não elimina essas diferenças. O painel deve mostrar as datas da oferta e a regra usada, sem prometer um ajuste estatístico por temporada ainda inexistente.

Booking é a fonte planejada para hotéis, condicionada à elegibilidade de acesso à API, às condições de uso e à cobertura comprovada dos estabelecimentos e tarifas.

## Histórico e cálculo dos alertas

Cada monitor possui uma versão da regra de comparação. Mudanças em condições que alterem o preço ou o universo de ofertas criam uma nova versão: origens, destinos, política de datas e horizonte, duração, passageiros, bagagem, cabine, restrições, distância e, para hotéis, condições da estadia. O sistema não mistura silenciosamente históricos incompatíveis.

Em buscas flexíveis, a série compara o custo de encontrar uma oportunidade dentro da mesma regra. As ofertas podem ter datas, duração ou aeroportos distintos quando a regra permitir isso. Uma política de janela móvel deve permanecer explícita: os limites de datas consultados em cada execução ficam registrados.

Para cada dia completo, o sistema armazena como amostra diária o menor preço válido entre as observações elegíveis daquele dia. Consultar duas ou mais vezes não aumenta o peso do dia na média. Também preserva o vínculo com a oferta, a regra e a cobertura da consulta.

Sejam `m(d)` esses mínimos diários válidos. Para a janela dos últimos X dias ou meses, excluindo o dia corrente:

```text
média = soma dos mínimos diários válidos / quantidade de dias válidos
queda percentual = 100 × (média − preço confirmado da oferta) / média
```

Um alerta é elegível quando a queda atingir ou superar o percentual configurado e houver histórico e cobertura suficientes. O histórico começa com a coleta; consultar preços futuros não cria dados do passado. O primeiro dia não oferece uma média histórica anterior.

Regras obrigatórias:

- Dias sem consulta válida, falhas, preços inválidos ou ausência de oferta não viram zero.
- A média usa amostras diárias, e não a média de todas as respostas recebidas.
- O dia corrente fica fora da referência, mesmo depois de encontrar uma oferta barata.
- A data do dia e os limites da janela seguem um fuso declarado; para a experiência inicial, America/Sao_Paulo.
- Uma janela em meses deve usar meses de calendário e mostrar os limites efetivos, sem ser apresentada como um número fixo de dias.
- Mostrar a quantidade de dias válidos, período observado, cobertura e estado de coleta; nunca exibir confiança histórica que os dados não sustentem.
- Definir e expor o mínimo de dias válidos e a cobertura exigida antes de habilitar notificações. Esses limites ainda precisam ser fixados na implementação; ausência de configuração mantém alertas suspensos.
- Consultas interrompidas ou parciais precisam informar sua cobertura. Só entram na comparação se satisfizerem os critérios de comparabilidade e cobertura definidos para o monitor.
- Alterações no fornecedor ou na composição da consulta exigem reavaliação da comparabilidade; não podem causar quedas artificiais por mistura de condições.

O registro histórico deve permitir reproduzir o cálculo mostrado ao usuário. Valores serão tratados em centavos, com moeda e escopo explícitos. A experiência tem foco em R$; ofertas que exijam conversão precisam registrar fonte e momento do câmbio, ou permanecer fora da comparação em BRL até que a conversão seja confiável.

## Frequência e notificações

Duas consultas por dia são a proposta inicial, sujeita aos limites, custos, permissões e cobertura do fornecedor. Não existe agendamento ativo ainda. A exploração de muitas combinações exige estratégia de busca compatível com esses limites; o painel não pode sugerir uma varredura completa quando apenas parte foi pesquisada.

Os canais confirmados são e-mail e Telegram. O usuário escolhe os destinos e canais habilitados. A configuração de tokens e demais credenciais ocorre no servidor, sem valores em código, logs ou navegador.

Antes do envio, a oferta deve ser confirmada novamente quando o fornecedor permitir consultas automáticas e confirmação para esse uso. Sem permissão ou confirmação apropriada, o sistema não apresentará aquela oferta como confirmada nem disparará um alerta que prometa preço atual. Não contornar restrições de uso com scraping.

Cada aviso contém datas, preço e condições, média e tamanho da amostra, queda, momento da confirmação e link para reservar. A compra pode ter preço ou disponibilidade diferente no momento de concluir a reserva.

O sistema registra o envio e usa uma chave de idempotência por monitor, oferta e evento de queda. Reprocessamentos e consultas repetidas não reenviam a mesma oportunidade. Uma nova queda relevante pode gerar novo aviso conforme regra explícita de repetição e intervalo, a definir antes de habilitar envios. A ativação dos canais deve permitir verificar os destinos antes de começar o monitoramento.

## Arquitetura prevista

- Painel hospedado no Netlify, com autenticação para dados pessoais e destinos de notificação.
- Operações de fornecedores e notificações executadas no servidor.
- Tarefas agendadas para coleta, avaliação das regras e envio.
- Armazenamento durável de monitores, versões, ofertas, observações, amostras diárias e entregas.
- Adaptadores de fornecedores para separar as regras do produto das particularidades de cada API.

O componente de coleta poderá ficar fora do Netlify se o volume e a duração excederem os recursos disponíveis. A escolha de tecnologia e banco ainda não está fechada. Integrações precisam permitir o uso pretendido e a retenção necessária do histórico; uma API comercial de reserva não deve ser presumida adequada para monitoramento automatizado.

## Critérios de aceitação do primeiro produto funcional

1. Explorar voos considera cada duração do intervalo e respeita origens, destinos, países e limite geodésico configurados, aceitando retorno pelo mesmo aeroporto.
2. Explorar hotéis apresenta estadias e condições identificadas; sexta a domingo e domingo a sexta produzem séries separadas e comparáveis.
3. Ambas as explorações mostram fontes, horário e horizonte efetivamente consultado, inclusive falhas e cobertura parcial, sem inventar preços ou disponibilidade.
4. Converter uma pesquisa em monitor preserva suas condições e cria uma versão identificável.
5. Repetir consultas no mesmo dia altera apenas o mínimo daquele dia; não muda o peso dessa data na média.
6. Com mínimos históricos de R$ 100, R$ 120 e R$ 80 em três dias válidos anteriores, a média exibida é R$ 100. Uma oferta confirmada de R$ 75 representa queda de 25%; o dia corrente não altera a referência. O exemplo testa a fórmula, não estabelece três dias como cobertura suficiente para envios reais.
7. Dias ausentes e erros não geram zeros nem falsas quedas; histórico insuficiente suspende alertas e explica a situação.
8. Uma mudança de condição comparável separa a versão do histórico; a nova regra não herda uma média incompatível.
9. Uma oferta que satisfaz o percentual, a cobertura e a confirmação permitida gera uma única notificação em cada canal habilitado. Reprocessar o mesmo evento não duplica o envio.
10. Distância, transporte e taxas desconhecidos aparecem como desconhecidos; o painel não declara economia total a partir apenas do preço do voo.
11. Nenhuma chave de fornecedor ou de notificação é entregue ao navegador, incluída em repositório ou impressa em logs.
12. Pelo menos uma busca real de voo e uma dos hotéis selecionados comprovam cobertura, preço utilizável e link de reserva antes de declarar integrações prontas. Fixtures ou dados de demonstração não satisfazem esse critério.

## Informações e decisões ainda pendentes

- Aeroportos de origem, passageiros e condições usuais das buscas de voo.
- Identificação do Royal Tulip, ocupação e condições de hotel desejadas.
- Fonte de voos com acesso autorizado para exploração flexível, consultas recorrentes, confirmação e retenção de histórico; Booking também depende de elegibilidade e teste real.
- Orçamento operacional, limites de consultas e estratégia de cobertura dentro deles.
- Percentual e janela padrão, limites mínimos de histórico e cobertura, e política de repetição de alertas.
- Contas e credenciais dos fornecedores, remetente de e-mail e destino de Telegram, configurados com segurança quando necessários.

Essas pendências não devem ser preenchidas com dados presumidos. Até sua resolução, o trabalho pode avançar em especificação e componentes independentes, sem declarar monitoramento real ou notificações operacionais.
