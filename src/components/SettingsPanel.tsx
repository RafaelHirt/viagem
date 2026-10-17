import { ArrowRight, Bell, Mail, MessageCircle, ShieldCheck } from 'lucide-react'
import type { Status } from '../shared/types'
import SetupGuide from './SetupGuide'
import './settings-panel.css'

export default function SettingsPanel({ status, onSearch, onAlerts }: { status: Status; onSearch: () => void; onAlerts: () => void }) {
  return <div className="simple-settings">
    <section className="panel settings-notifications" aria-labelledby="notifications-title">
      <h2 id="notifications-title">Seus avisos</h2>
      <p>O endereço para receber mensagens é escolhido ao criar cada alerta.</p>
      <div className="settings-channel"><Mail size={23} /><div><h3>E-mail</h3><p>{status.notifications.email ? 'Envio configurado. Ao salvar um alerta com e-mail, a ferramenta tenta enviar uma confirmação e mostra o resultado.' : 'Envio ainda não ativado. Você pode salvar seu e-mail no alerta, mas nenhuma mensagem será enviada enquanto o serviço estiver desconectado.'}</p></div><span className="settings-state">{status.notifications.email ? 'Configurado' : 'Pendente'}</span></div>
      <div className="settings-channel"><MessageCircle size={23} /><div><h3>WhatsApp</h3><p>Este canal ainda não está disponível na ferramenta.</p></div><span className="settings-state">Indisponível</span></div>
      {status.notifications.telegram && <div className="settings-channel"><Bell size={23} /><div><h3>Telegram</h3><p>Conexão cadastrada. O recebimento é escolhido em cada alerta e depende de preços confirmados e histórico suficiente.</p></div><span className="settings-state">Conectado</span></div>}
      <button className="button button-secondary" onClick={onAlerts}>Ver meus alertas<ArrowRight size={16} /></button>
    </section>
    <section className="panel settings-follow-up" aria-labelledby="updates-title"><Bell size={23} /><div><h2 id="updates-title">{status.collection?.enabled ? 'Consultas automáticas ativadas' : 'Atualização manual por enquanto'}</h2><p>{status.collection?.enabled ? 'As consultas são feitas em rodadas, com limite de alertas por rodada. Avisos de queda dependem da confirmação dos preços e de histórico suficiente.' : 'Abra Meus alertas e use Consultar preços quando quiser atualizar uma busca. Avisos automáticos de queda ainda não estão ativos.'}</p><button className="text-button" onClick={onSearch}>Buscar uma viagem<ArrowRight size={16} /></button></div></section>
    <p className="settings-personal"><ShieldCheck size={17} />{status.authConfigured ? 'Uso pessoal, com acesso protegido por senha.' : 'Uso pessoal. A senha do painel ainda precisa ser configurada.'} Cadastro de outras pessoas ainda não está disponível.</p>
    <details className="settings-technical"><summary>Área técnica · para quem administra</summary><p>Conexões e instruções do serviço. Quem pesquisa viagens não precisa criar conta nos fornecedores.</p><dl className="settings-connection-summary"><div><dt>Preços de passagens</dt><dd>{status.providers.flights.configured ? 'Chave cadastrada; valide com uma busca.' : 'Conexão pendente.'}</dd></div><div><dt>Hotéis</dt><dd>Integração ainda não disponível.</dd></div><div><dt>Acesso ao painel</dt><dd>{status.authConfigured ? 'Senha configurada.' : 'Senha ainda não configurada.'}</dd></div></dl><SetupGuide status={status} /><details className="settings-scheduler"><summary>Consultas automáticas e custos</summary><p>O agendamento consulta um número limitado de alertas por rodada e consome a cota do fornecedor. Só ative depois de validar as tarifas e o envio de mensagens. No Netlify, a opção do servidor é <code>ENABLE_SCHEDULED_COLLECTION=true</code>. Uma chave cadastrada, sozinha, não confirma que a integração funciona.</p></details></details>
  </div>
}
