export interface AlertValues { name: string; email: string; telegram: boolean; dropPercent: string; windowDays: string }

export default function AlertFields({ value, onChange, emailAvailable, telegramAvailable, automatic }: {
  value: AlertValues; onChange: (value: AlertValues) => void; emailAvailable: boolean; telegramAvailable: boolean; automatic: boolean
}) {
  const update = (patch: Partial<AlertValues>) => onChange({ ...value, ...patch })
  return <div className="alert-fields">
    <label className="field"><span>Nome do alerta</span><input id="alert-name" maxLength={100} placeholder="Ex.: Férias na Europa" value={value.name} onChange={event => update({ name: event.target.value })} /></label>
    <label className="field"><span>Seu e-mail (opcional)</span><input type="email" aria-label="Seu e-mail (opcional)" aria-describedby="alert-email-help" autoComplete="email" placeholder="voce@email.com" value={value.email} onChange={event => update({ email: event.target.value })} /><small id="alert-email-help">{emailAvailable ? 'Receba avisos neste endereço quando houver uma queda de preço confirmada.' : 'O endereço fica salvo aqui. O envio por e-mail ainda não está ativo.'}</small></label>
    {!automatic && <p className="inline-note">Por enquanto, a atualização é manual. Você poderá consultar os preços em Meus alertas.</p>}
    <details className="advanced-fields"><summary>Personalizar o aviso</summary>
      <div className="field-grid"><label className="field"><span>Avisar com queda de</span><div className="input-suffix"><input type="number" required min={1} max={90} value={value.dropPercent} onChange={event => update({ dropPercent: event.target.value })} /><span>%</span></div></label>
        <label className="field"><span>Comparar com a média de</span><select value={value.windowDays} onChange={event => update({ windowDays: event.target.value })}>{[7, 15, 30, 60, 90, 180].map(days => <option key={days} value={days}>{days} dias</option>)}</select></label></div>
      <p className="wizard-hint">O aviso depende de histórico de preços confirmados e atualizações automáticas ativas.</p>
      {(telegramAvailable || value.telegram) && <label className="checkbox-label"><input type="checkbox" checked={value.telegram} onChange={event => update({ telegram: event.target.checked })} /><span>Receber também no Telegram conectado</span></label>}
    </details>
  </div>
}
