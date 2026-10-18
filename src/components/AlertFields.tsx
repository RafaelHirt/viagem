export interface AlertValues { name: string; email: string; telegram: boolean; dropPercent: string; windowDays: string }

export default function AlertFields({ value, onChange, emailAvailable, telegramAvailable, automatic }: {
  value: AlertValues; onChange: (value: AlertValues) => void; emailAvailable: boolean; telegramAvailable: boolean; automatic: boolean
}) {
  const update = (patch: Partial<AlertValues>) => onChange({ ...value, ...patch })
  const percent=Number(value.dropPercent)
  const example=Number.isFinite(percent)&&percent>=1&&percent<=90 ? new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(1000*(1-percent/100)):undefined
  return <div className="alert-fields">
    <label className="field"><span>Nome do alerta</span><input id="alert-name" maxLength={100} placeholder="Ex.: Férias na Europa" value={value.name} onChange={event => update({ name: event.target.value })} /></label>
    <label className="field"><span>Seu e-mail (opcional)</span><input type="email" aria-label="Seu e-mail (opcional)" aria-describedby="alert-email-help" autoComplete="email" placeholder="voce@email.com" value={value.email} onChange={event => update({ email: event.target.value })} /><small id="alert-email-help">{emailAvailable ? 'Receba avisos neste endereço quando houver uma queda de preço confirmada.' : 'O endereço fica salvo aqui. O envio por e-mail ainda não está ativo.'}</small></label>
    <section className="alert-rule-settings" aria-labelledby="alert-rule-title"><h4 id="alert-rule-title" tabIndex={-1}>Qual queda de preço vale um aviso?</h4><p>Escolha o percentual e o período que vamos usar como referência.</p>
      <div className="field-grid"><label className="field"><span>Avisar quando cair pelo menos</span><div className="input-suffix"><input type="number" required min={1} max={90} aria-label="Percentual de queda para avisar" value={value.dropPercent} onChange={event=>update({dropPercent:event.target.value})}/><span>%</span></div></label><label className="field"><span>Comparar com a média dos últimos</span><select aria-label="Período da média de referência" value={value.windowDays} onChange={event=>update({windowDays:event.target.value})}>{[7,15,30,60,90,180].map(days=><option key={days} value={days}>{days} dias</option>)}</select></label></div>
      <p className="alert-rule-preview" aria-live="polite">{example ? `Exemplo: se a média for R$ 1.000, avisar em ${example} ou menos.`:'Escolha um percentual entre 1% e 90%.'}</p>
      <details className="alert-reference-help"><summary>De onde vem essa média?</summary><p>Usamos o menor preço confirmado observado em cada dia anterior pela ferramenta, com os mesmos critérios de viajantes, período, aeroportos e dias da semana. Não é uma média geral de todas as passagens do mercado.</p><p>Selecionar 180 dias não cria histórico retroativo. A comparação precisa de pelo menos 7 dias válidos; avisos automáticos também dependem de preços confirmados, atualizações e um canal de envio ativo.</p></details>
    </section>
    {!automatic && <p className="inline-note">Por enquanto, a atualização é manual. Você poderá consultar os preços em Meus alertas.</p>}
    {(telegramAvailable || value.telegram) && <label className="checkbox-label"><input type="checkbox" checked={value.telegram} onChange={event => update({ telegram: event.target.checked })} /><span>Receber também no Telegram conectado</span></label>}
  </div>
}
