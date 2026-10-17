import { createHash } from 'node:crypto';
import type { Monitor, Offer, Status } from '../src/shared/types.ts';
import type { Baseline } from '../src/shared/domain.ts';
import { getPriceDrop } from '../src/shared/domain.ts';
import type { Storage } from './storage.ts';
import { airportSetLabel } from '../src/shared/airport-options.ts';
import { flightPeriodLabel, weekdayLabel } from '../src/shared/flight-dates.ts';
import type { FlightQuery } from '../src/shared/types.ts';

/** A creation receipt is independent of fare confirmation and historical price alerts. */
export async function sendCreationConfirmation(storage: Storage, monitor: Monitor, appOrigin: string, fetcher: typeof fetch = fetch): Promise<NonNullable<Monitor['creationEmail']>> {
  const attemptedAt = new Date().toISOString();
  const receipt = (status: NonNullable<Monitor['creationEmail']>['status']) => ({ status, attemptedAt });
  if (!monitor.channels.email) return receipt('no-recipient');
  if (!getNotificationStatus().email) return receipt('not-configured');
  const key = createHash('sha256').update(JSON.stringify(['monitor-created-v1', monitor.id, monitor.channels.email])).digest('hex');
  const token = await storage.claimAlert(key);
  if (!token) return receipt('duplicate');
  const flight = monitor.query as FlightQuery;
  const text = [`Seu alerta foi criado: ${monitor.name}`,
    monitor.kind === 'flight' ? `${airportSetLabel(flight.origin, flight.originAirports)} → ${airportSetLabel(flight.arrivalAirport, flight.arrivalAirports) === 'Qualquer aeroporto' ? flight.destination : airportSetLabel(flight.arrivalAirport, flight.arrivalAirports)}` : 'Busca de hospedagem salva.',
    `${monitor.query.adults} adulto(s)`,
    monitor.kind === 'flight' ? `${flightPeriodLabel(flight)} · ${flight.minDays} a ${flight.maxDays} dias · ida ${weekdayLabel(flight.departureWeekdays)}, volta ${weekdayLabel(flight.returnWeekdays)}` : '',
    `Regra: queda de ${monitor.rule.dropPercent}% em relação à média dos últimos ${monitor.rule.windowDays} dias de consultas comparáveis.`,
    process.env.ENABLE_SCHEDULED_COLLECTION === 'true' ? 'Consultas automáticas ativadas. Avisos de queda dependem de preços confirmados e histórico suficiente.' : 'Atualização manual por enquanto. Esta mensagem confirma o cadastro; ainda não é um aviso de preço baixo.',
    `${appOrigin}/?alert=${encodeURIComponent(monitor.id)}`,
  ].filter(Boolean).join('\n');
  let accepted = false;
  try {
    const response = await fetcher('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ from: process.env.ALERT_FROM_EMAIL, to: [monitor.channels.email], subject: `Partiu: alerta criado — ${monitor.name}`, text }), signal: AbortSignal.timeout(8_000) });
    const result = await response.json() as { id?: unknown };
    accepted = response.ok && typeof result.id === 'string';
  } catch { /* A failed receipt never deletes the saved alert. */ }
  await storage.finishAlert(key, token, accepted);
  return receipt(accepted ? 'sent' : 'failed');
}

export interface Delivery {
  channel: 'email' | 'telegram';
  status: 'sent' | 'duplicate' | 'failed' | 'not-configured';
}

export function getNotificationStatus(): Status['notifications'] {
  return {
    email: Boolean(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  };
}

function message(monitor: Monitor, offer: Offer, baseline: Baseline): string {
  const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
  const drop = getPriceDrop(offer.price, baseline.mean);
  return [
    `Oportunidade: ${monitor.name}`,
    offer.title,
    `Preço informado pela fonte: ${money(offer.price)}`,
    baseline.mean === null ? '' : `Média: ${money(baseline.mean)} · ${baseline.validDays} dias válidos em ${baseline.windowDays} dias`,
    drop === null ? '' : `Queda: ${drop.toLocaleString('pt-BR')}%`,
    offer.outboundDate ? `Ida/entrada: ${offer.outboundDate}` : '',
    offer.returnDate ? `Volta/saída: ${offer.returnDate}` : '',
    ...offer.details,
    `Fonte: ${offer.provider} · consulta: ${offer.observedAt}`,
    offer.url ?? '',
    'Preço e disponibilidade podem mudar até a conclusão da compra.',
  ].filter(Boolean).join('\n');
}

/** A delivery is recorded only after the transport explicitly accepts it. */
export async function sendNotifications(
  storage: Storage,
  monitor: Monitor,
  offer: Offer,
  baseline: Baseline,
  fetcher: typeof fetch = fetch,
): Promise<Delivery[]> {
  if (!offer.confirmed) return [];
  const status = getNotificationStatus();
  const text = message(monitor, offer, baseline);
  const deliveries: Delivery[] = [];
  const channels: Array<'email' | 'telegram'> = [];
  if (monitor.channels.email) channels.push('email');
  if (monitor.channels.telegram) channels.push('telegram');
  for (const channel of channels) {
    if (!status[channel]) { deliveries.push({ channel, status: 'not-configured' }); continue; }
    const destination = channel === 'email' ? monitor.channels.email : process.env.TELEGRAM_CHAT_ID;
    // Provider result IDs may change on every fetch; identity must describe the actual itinerary.
    const identity = [monitor.id, offer.kind, offer.title, offer.origin, offer.arrivalAirport,
      offer.departureAirport, offer.outboundDate, offer.returnDate, offer.nights, offer.airline,
      offer.price, offer.currency, offer.provider, offer.details, channel, destination];
    const key = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
    const token = await storage.claimAlert(key);
    if (!token) { deliveries.push({ channel, status: 'duplicate' }); continue; }
    let accepted = false;
    try {
      if (channel === 'email') {
        const response = await fetcher('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
          body: JSON.stringify({ from: process.env.ALERT_FROM_EMAIL, to: [monitor.channels.email], subject: `Viagem: oportunidade em ${monitor.name}`, text }),
          signal: AbortSignal.timeout(15_000),
        });
        const result = await response.json() as { id?: unknown };
        accepted = response.ok && typeof result.id === 'string';
      } else {
        const response = await fetcher(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text, link_preview_options: { is_disabled: true } }),
          signal: AbortSignal.timeout(15_000),
        });
        const result = await response.json() as { ok?: unknown };
        accepted = response.ok && result.ok === true;
      }
    } catch { /* Never expose transport errors, which may contain credentials. */ }
    await storage.finishAlert(key, token, accepted);
    deliveries.push({ channel, status: accepted ? 'sent' : 'failed' });
  }
  return deliveries;
}
