import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import QueryWizard, { initialFlight, initialHotel, type FlightDraft, type HotelDraft } from "./components/QueryWizard";
import { findAirport, shortAirportLabel } from "./shared/airports";
import SettingsPanel from "./components/SettingsPanel";
import AlertFields, { type AlertValues } from "./components/AlertFields";
import { airportSetLabel } from "./shared/airport-options";
import AirlineBrand from "./components/AirlineBrand";
import { outboundSchedule, sortOffers, uniqueOffers, type OfferSort } from "./shared/offer-results";
import { needsPassengerRecheck, presentFare, presentFlightFacts } from "./shared/fare-presentation";
import { runSearchJob } from "./shared/search-client";
import { flightCityDraftFromQuery, flightQueryFromDraft } from "./shared/flight-draft";
import { flightPeriodLabel, weekdayLabel } from "./shared/flight-dates";
import TripSummary from "./components/TripSummary";
import {
  ArrowDownRight,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Compass,
  ExternalLink,
  Hotel,
  Info,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Plane,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingDown,
  X,
} from "lucide-react";
import type {
  Coverage,
  ExploreResult,
  FlightQuery,
  HotelQuery,
  Monitor,
  MonitorSummary,
  Observation,
  Offer,
  Status,
} from "./shared/types";

const SavedSearchMap = lazy(() => import("./components/SavedSearchMap"));

type Tab = "overview" | "explore" | "monitors" | "settings";
type Kind = "flight" | "hotel";
const tabs: { id: Tab; label: string; icon: typeof Plane }[] = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "explore", label: "Buscar viagem", icon: Compass },
  { id: "monitors", label: "Meus alertas", icon: Bell },
  { id: "settings", label: "Configurações", icon: Settings2 },
];
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(cents / 100);
const date = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Data flexível";
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      data.error || "Não foi possível concluir a solicitação. Tente novamente.",
    );
  return data as T;
}
function monitorInput(kind: Kind, query: FlightQuery | HotelQuery, value: AlertValues) {
  const flight = query as FlightQuery;
  return { kind, query, name: value.name.trim() || (kind === 'flight' ? `${airportSetLabel(flight.origin, flight.originAirports)} → ${flight.arrivalAirport ? airportSetLabel(flight.arrivalAirport, flight.arrivalAirports) : flight.destination}` : (query as HotelQuery).property).slice(0, 120),
    rule: { dropPercent: Number(value.dropPercent), windowDays: Number(value.windowDays) }, channels: { ...(value.email.trim() ? { email: value.email.trim() } : {}), telegram: value.telegram } };
}
function confirmationMessage(monitor: Monitor) {
  const status = monitor.creationEmail?.status;
  return status === 'sent' ? 'Confirmação enviada por e-mail.' : status === 'duplicate' ? 'Confirmação já solicitada para este alerta.' : status === 'not-configured' ? 'E-mail salvo; o serviço de envio ainda não está ativo.' : status === 'failed' ? 'Alerta salvo; não conseguimos enviar o e-mail de confirmação.' : '';
}
function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "field-wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function KindSwitch({
  value,
  onChange,
}: {
  value: Kind;
  onChange: (value: Kind) => void;
}) {
  return (
    <div className="kind-switch" role="group" aria-label="Tipo de viagem">
      <button
        type="button"
        className={value === "flight" ? "selected" : ""}
        aria-pressed={value === "flight"}
        onClick={() => onChange("flight")}
      >
        <Plane size={17} />
        Passagens aéreas
      </button>
      <button
        type="button"
        className={value === "hotel" ? "selected" : ""}
        aria-pressed={value === "hotel"}
        onClick={() => onChange("hotel")}
      >
        <Hotel size={17} />
        Hotéis
      </button>
    </div>
  );
}
function StatusPill({
  configured,
  text,
}: {
  configured: boolean;
  text: string;
}) {
  return (
    <span className={`status-pill ${configured ? "connected" : ""}`}>
      <span />
      {text}
    </span>
  );
}
function queryDescription(summary: MonitorSummary) {
  const q = summary.monitor.query;
  if (summary.monitor.kind === "flight") {
    const flight = q as FlightQuery;
    return `${airportSetLabel(flight.origin, flight.originAirports)} → ${flight.tripPlan?.startAirport ? `${shortAirportLabel(flight.tripPlan.startAirport)} · ${flight.tripPlan.countryCount} países` : flight.arrivalAirport ? airportSetLabel(flight.arrivalAirport, flight.arrivalAirports) : flight.destination} · ${flight.minDays === flight.maxDays ? flight.minDays : `${flight.minDays} a ${flight.maxDays}`} dias · ${flightPeriodLabel(flight)}${flight.departureWeekdays?.length || flight.returnWeekdays?.length ? ` · ida ${weekdayLabel(flight.departureWeekdays)}, volta ${weekdayLabel(flight.returnWeekdays)}` : ''}`;
  }
  const hotel = q as HotelQuery;
  return `${hotel.property} · ${hotel.pattern === "weekend" ? "sexta a domingo" : hotel.pattern === "weekdays" ? "domingo a sexta" : "semana e fins de semana"}`;
}
function FlightFacts({ offer, showRoute = true }: { offer: Offer; showRoute?: boolean }) {
  if (offer.kind !== "flight") return null;
  const facts = presentFlightFacts(offer);
  return <div className="flight-facts">
    {showRoute && facts.route && <p className="flight-facts-route">{facts.route}</p>}
    {facts.returnRoute && <p>Volta{offer.itineraryStatus === 'complete' ? '' : ' prevista'}: {facts.returnRoute}</p>}
    {facts.dates && <p><CalendarDays size={15} />{facts.dates}{facts.duration && <strong>{facts.duration}</strong>}</p>}
    {outboundSchedule(offer) && <p className="flight-schedule"><strong>{outboundSchedule(offer)}</strong>{facts.legs[0]?.duration && <span>{facts.legs[0].duration}</span>}{facts.legs[0]?.stops && <span>{facts.legs[0].stops}</span>}</p>}
    {facts.returnNotice && <small>{facts.returnNotice}</small>}
  </div>;
}
function FareAmount({ offer, adults }: { offer: Offer; adults?: number }) {
  const fare = presentFare(offer, adults);
  if (needsPassengerRecheck(offer, adults)) return <div className="fare-amount fare-recheck"><strong>Consulte novamente</strong><small>O preço antigo não confirmou a quantidade de adultos.</small></div>;
  return <div className="fare-amount"><span className="price-label">{fare.caption}</span><strong>{money(fare.priceCents)}</strong><small>{fare.context}</small>{offer.tripPreview && <small>Somente passagem aérea; deslocamentos entre países à parte.</small>}</div>;
}
function OfferCard({ offer, adults }: { offer: Offer; adults?: number }) {
  const safeUrl = !needsPassengerRecheck(offer, adults) && offer.url && /^https:\/\//i.test(offer.url) ? offer.url : undefined;
  return <article className="offer-card">
    <h3>{offer.kind === 'flight' ? presentFlightFacts(offer).route || offer.title : offer.title}</h3>
    {offer.kind === 'flight' ? <FlightFacts offer={offer} showRoute={false} /> : <p className="offer-dates">{date(offer.outboundDate)} — {date(offer.returnDate)}{offer.nights ? ` · ${offer.nights} noites` : ''}</p>}
    <AirlineBrand offer={offer} />
    {offer.tripPreview && <details className="offer-trip-preview"><summary>Roteiro: {offer.tripPreview.stops.map(stop => stop.city).join(" → ")}</summary><TripSummary preview={offer.tripPreview} transport={offer.tripPreview.transport} /></details>}
    <div className="offer-bottom"><FareAmount offer={offer} adults={adults} />{safeUrl && <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="button button-secondary button-small">Ver no vendedor<ExternalLink size={14} /></a>}</div>
    <details className="offer-conditions"><summary>Voos e condições</summary>{offer.itineraryStatus !== "complete" && <p>A consulta inclui a data de volta, mas ainda não confirmou um voo de retorno. Confira ida, volta e total antes de comprar.</p>}
      {offer.flightLegs?.filter(leg => leg.segments.length).map((leg, index) => <div className="flight-leg-detail" key={index}><strong>{leg.direction === 'return' ? 'Volta' : 'Ida'}</strong>{leg.segments.map((segment, i) => <p key={i}>{segment.origin} → {segment.destination}{segment.departureTime ? ` · ${segment.departureTime}` : ''}{segment.arrivalTime ? ` — ${segment.arrivalTime}` : ''}{segment.flightNumber ? ` · ${segment.flightNumber}` : ''}</p>)}</div>)}
      <ul className="offer-details">{offer.details.map((detail, i) => <li key={i}>{detail}</li>)}</ul>

      <p>Consultado em {dateTime(offer.observedAt)}. {offer.confirmed ? 'Preço verificado na consulta.' : 'Confira disponibilidade, total e bagagem no vendedor.'}</p>
    </details>
  </article>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>(() => new URLSearchParams(location.search).has("alert") ? "monitors" : "explore");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [monitors, setMonitors] = useState<MonitorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [kind, setKind] = useState<Kind>("flight");
  const [flight, setFlight] = useState<FlightDraft>(initialFlight);
  const [hotel, setHotel] = useState<HotelDraft>(initialHotel);
  const [createMonitor, setCreateMonitor] = useState(false);
  const [createWhileSearching, setCreateWhileSearching] = useState(false);
  const [inlineCreated, setInlineCreated] = useState<{ id: string; identity: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [monitorName, setMonitorName] = useState("");
  const [dropPercent, setDropPercent] = useState("20");
  const [windowDays, setWindowDays] = useState("60");
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ExploreResult | null>(null);
  const [offerSort, setOfferSort] = useState<OfferSort>("price-asc");
  const [searchContext, setSearchContext] = useState<{ kind: Kind; query: FlightQuery | HotelQuery; jobId?: string; monitorId?: string } | null>(null);
  const [pendingAlert, setPendingAlert] = useState<typeof searchContext>(null);
  const [exploreError, setExploreError] = useState("");
  const [monitorSort, setMonitorSort] = useState("recent");
  const [monitorFilter, setMonitorFilter] = useState<"all" | Kind>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const historyDialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!historyId) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = historyDialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.querySelector<HTMLButtonElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHistoryId(null);
      if (event.key === 'Tab' && dialog) {
        const items = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],summary,[tabindex="0"]')].filter(element => element.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('keydown', keydown); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, [historyId]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [runReport, setRunReport] = useState<{
    coverage: Coverage;
    warnings: string[];
    found?: number;
    message?: string;
    notifications?: { channel: string; status: string }[];
  } | null>(null);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const nextStatus = await api<Status>("/status");
      setStatus(nextStatus);
      if (nextStatus.authConfigured && nextStatus.authenticated) {
        const data = await api<{ monitors: MonitorSummary[] }>("/monitors");
        setMonitors(data.monitors);
      } else setMonitors([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
  }, []);
  useEffect(() => { if (results) document.getElementById('search-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [results]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const focusedLink = useRef(false);
  useEffect(() => {
    if (loading || tab !== 'monitors' || focusedLink.current) return;
    const id = new URLSearchParams(location.search).get('alert');
    const element = id && /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? document.getElementById(`monitor-${id}`) : null;
    if (element) { focusedLink.current = true; element.tabIndex = -1; element.scrollIntoView({ block: 'center' }); element.focus({ preventScroll: true }); }
  }, [loading, tab, monitors]);
  const navigate = (next: Tab) => {
    setTab(next);
    setMobileMenu(false);
    setError("");
    if (next !== "monitors") setCreateMonitor(false);
    setPendingAlert(null);
  };
  function openCreate(nextKind?: Kind) {
    setEditingId(null); setCreateMonitor(false); setPendingAlert(null);
    if (nextKind) setKind(nextKind);
    setTab("explore"); setResults(null); setExploreError("");
    setMobileMenu(false); setError("");
  }
  function openAlert() {
    if (!searchContext) return;
    setPendingAlert(structuredClone(searchContext)); setEditingId(null); setMonitorName(""); setError("");
    window.setTimeout(() => document.getElementById('alert-name')?.focus(), 0);
  }
  function openEdit(item: MonitorSummary) {
    setPendingAlert(null);
    const monitor = item.monitor;
    setEditingId(monitor.id); setKind(monitor.kind); setMonitorName(monitor.name);
    setDropPercent(String(monitor.rule.dropPercent)); setWindowDays(String(monitor.rule.windowDays));
    setEmail(monitor.channels.email || ""); setTelegram(monitor.channels.telegram);
    if (monitor.kind === "flight") setFlight(flightCityDraftFromQuery(monitor.query as FlightQuery));
    else { const q = monitor.query as HotelQuery; setHotel({ ...initialHotel, property: q.property, propertyId: q.propertyId || "", adults: String(q.adults), pattern: q.pattern, horizonMonths: String(q.horizonMonths || 12), checkIn: q.checkIn || "", checkOut: q.checkOut || "" }); }
    setTab("monitors"); setCreateMonitor(true); setError(""); setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function makeQuery(): FlightQuery | HotelQuery {
    if (kind === "flight") return flightQueryFromDraft(flight);
    if (!hotel.property.trim() || !hotel.propertyId)
      throw new Error("Selecione um hotel encontrado na Booking antes de continuar.");
    if (Boolean(hotel.checkIn) !== Boolean(hotel.checkOut))
      throw new Error(
        "Informe check-in e check-out ou deixe os dois em branco.",
      );
    if (hotel.checkIn && hotel.checkOut <= hotel.checkIn)
      throw new Error("O check-out precisa ser depois do check-in.");
    return {
      property: hotel.property.trim(),
      propertyVerified: true,
      pattern: hotel.pattern,
      horizonMonths: Number(hotel.horizonMonths),
      adults: Number(hotel.adults),
      ...(hotel.propertyId ? { propertyId: hotel.propertyId.trim() } : {}),
      ...(hotel.checkIn
        ? { checkIn: hotel.checkIn, checkOut: hotel.checkOut }
        : {}),
    };
  }
  async function explore(event: FormEvent) {
    event.preventDefault(); setSubmitting(true); setExploreError(""); setResults(null);
    let created: Monitor | undefined;
    try {
      const context: NonNullable<typeof searchContext> = { kind, query: structuredClone(makeQuery()) };
      if (createWhileSearching) {
        const value = { name: monitorName, email, telegram, dropPercent, windowDays };
        const identity = JSON.stringify(monitorInput(kind, context.query, value));
        if (inlineCreated?.identity === identity) created = monitors.find(item => item.monitor.id === inlineCreated.id)?.monitor;
        if (!created) {
          const saved = await api<{ monitor: Monitor }>("/monitors", { method: 'POST', body: identity });
          created = saved.monitor; setInlineCreated({ id: created.id, identity });
          setToast(`Alerta criado. ${confirmationMessage(created)}`);
        }
        context.monitorId = created.id;
        setMonitors((await api<{ monitors: MonitorSummary[] }>("/monitors")).monitors);
      }
      setSearchContext(context);
      const result = await runSearchJob<ExploreResult>(created ? { monitorId: created.id } : { kind, query: context.query }, jobId => setSearchContext({ ...context, jobId }));
      setResults(result);
      if (created) setMonitors((await api<{ monitors: MonitorSummary[] }>("/monitors")).monitors);
    } catch (e) {
      setExploreError(`${(e as Error).message}${created ? ' Seu alerta ficou salvo em Meus alertas.' : ''}`);
    } finally { setSubmitting(false); }
  }
  async function saveMonitor(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const query = pendingAlert?.query ?? makeQuery();
      const savedKind = pendingAlert?.kind ?? kind;
      const wasEditing = Boolean(editingId);
      const saved = await api<{ monitor: Monitor; seeded?: boolean; criteriaChanged?: boolean; additionalMonitors?: unknown[] }>(editingId ? `/monitors/${editingId}` : "/monitors", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify({ ...monitorInput(savedKind, query, { name: monitorName, email, telegram, dropPercent, windowDays }), ...(pendingAlert?.jobId ? { sourceSearchJobId: pendingAlert.jobId } : {}) }),
      });
      const data = await api<{ monitors: MonitorSummary[] }>("/monitors");
      setMonitors(data.monitors);
      setCreateMonitor(false);
      setPendingAlert(null);
      setTab("monitors");
      setEditingId(null);
      setMonitorName("");
      setSubmitting(false);
      if ((!wasEditing || saved.criteriaChanged) && !saved.seeded) {
        setToast(wasEditing ? "Alerta atualizado. Consultando preços para os novos critérios…" : "Alerta salvo. Consultando os primeiros preços…");
        await monitorAction(saved.monitor.id, "run");
      } else setToast(wasEditing ? "Alterações salvas." : `Alerta salvo com o preço desta busca. ${confirmationMessage(saved.monitor)}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  async function monitorAction(
    id: string,
    action: "run" | "toggle" | "delete",
    enabled?: boolean,
  ) {
    setBusyId(id);
    setError("");
    try {
      if (action === "run") {
        const report = await runSearchJob<{
          summary: MonitorSummary;
          coverage: Coverage;
          warnings: string[];
          found?: number;
          message?: string;
          notifications?: { channel: string; status: string }[];
        }>({ monitorId: id });
        setRunReport(report);
        setToast(
          report.found ? "Preços atualizados para esta busca." : "Esta consulta não trouxe preços. Você pode tentar outras datas ou destinos.",
        );
      } else if (action === "toggle")
        await api(`/monitors/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled }),
        });
      else {
        await api(`/monitors/${id}`, { method: "DELETE" });
        if (inlineCreated?.id === id) setInlineCreated(null);
        setDeleteId(null);
        setToast("Monitor excluído.");
      }
      const data = await api<{ monitors: MonitorSummary[] }>("/monitors");
      setMonitors(data.monitors);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  async function viewHistory(id: string) {
    setHistoryId(id);
    setHistoryLoading(true);
    setObservations([]);
    setError("");
    try {
      const data = await api<{ observations: Observation[] }>(
        `/history?monitorId=${encodeURIComponent(id)}`,
      );
      setObservations(data.observations);
    } catch (e) {
      setError((e as Error).message);
      setHistoryId(null);
    } finally {
      setHistoryLoading(false);
    }
  }
  async function login(event: FormEvent) {
    event.preventDefault();
    setLoginBusy(true);
    setError("");
    try {
      await api("/session", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoginBusy(false);
    }
  }
  const visibleOffers = sortOffers(uniqueOffers(results?.offers ?? []), offerSort);
  const activeCount = monitors.filter((item) => item.monitor.enabled).length;
  const filteredMonitors = monitors.filter(
    (item) => monitorFilter === "all" || item.monitor.kind === monitorFilter,
  ).sort((a,b) => monitorSort === "name" ? a.monitor.name.localeCompare(b.monitor.name, 'pt-BR') : monitorSort === "price" ? (a.latest?.price ?? Infinity) - (b.latest?.price ?? Infinity) : b.monitor.createdAt.localeCompare(a.monitor.createdAt));
  const queryProps = {
    kind,
    flight,
    setFlight: (value: FlightDraft) => {
      setFlight(value);
      setResults(null);
    },
    hotel,
    setHotel: (value: HotelDraft) => {
      setHotel(value);
      setResults(null);
    },
  };

  const alertFields = <AlertFields value={{ name: monitorName, email, telegram, dropPercent, windowDays }} onChange={value => { setMonitorName(value.name); setEmail(value.email); setTelegram(value.telegram); setDropPercent(value.dropPercent); setWindowDays(value.windowDays); }} emailAvailable={Boolean(status?.notifications.email)} telegramAvailable={Boolean(status?.notifications.telegram)} automatic={Boolean(status?.collection?.enabled)} />;

  if (status?.authConfigured && !status.authenticated)
    return (
      <div className="login-page">
        <div className="login-brand">
          <Plane size={25} />
          <span>
            partiu<span>.</span>
          </span>
        </div>
        <div className="login-card">
          <span className="login-icon">
            <ShieldCheck size={30} />
          </span>
          <span className="eyebrow">SEU RADAR PESSOAL DE VIAGENS</span>
          <h1>
            Boas oportunidades
            <br />
            começam por aqui.
          </h1>
          <p>Entre para explorar preços e acompanhar suas próximas viagens.</p>
          <form onSubmit={login}>
            <Field label="Senha do painel">
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha de acesso"
              />
            </Field>
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
            <button className="button button-primary" disabled={loginBusy}>
              {loginBusy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <ArrowRight size={18} />
              )}
              Entrar no painel
            </button>
          </form>
          {status.development && (
            <p className="development-note">
              Ambiente local · senha de desenvolvimento:{" "}
              <code>viagem-local</code>
            </p>
          )}
        </div>
        <p className="login-footer">
          Menos tempo pesquisando. Mais motivos para partir.
        </p>
      </div>
    );

  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
          aria-label="Partiu, visão geral"
        >
          <span className="brand-mark">
            <Plane size={25} />
          </span>
          <span>
            partiu<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="sidebar-label">SEU RADAR DE VIAGENS</div>
        <nav aria-label="Menu principal">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`nav-link ${tab === id ? "active" : ""}`}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon size={19} />
              {label}
              {id === "monitors" && monitors.length > 0 && (
                <span className="nav-count">{monitors.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-insight">
          <span className="insight-icon">
            <Sparkles size={21} />
          </span>
          <strong>
            Seu próximo destino
            <br />
            pode ser uma surpresa.
          </strong>
          <p>
            Deixe o preço abrir
            <br />
            novas possibilidades.
          </p>
          <span className="sidebar-dashed-route">
            <span />
            <Plane size={17} />
            <span />
          </span>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">R</span>
          <div>
            <strong>Meu espaço</strong>
            <span>Viagens no seu ritmo</span>
          </div>
          {status?.authConfigured && (
            <button
              aria-label="Sair do painel"
              title="Sair"
              onClick={async () => {
                try {
                  await api("/session", { method: "DELETE" });
                  setMonitors([]);
                  await reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu-button"
              aria-label="Abrir menu"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              Meu espaço <ChevronRight size={14} />
              <strong>{tabs.find((item) => item.id === tab)?.label}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="personal-badge">
              <ShieldCheck size={14} />
              Uso pessoal
            </span>
            <span className="topbar-avatar">R</span>
          </div>
        </header>
        <main id="main-content">
          {error && !pendingAlert && (
            <div className="error-message global-error" role="alert">
              <Info size={17} />
              <span>{error}</span>
              <button aria-label="Fechar erro" onClick={() => setError("")}>
                <X size={17} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="initial-loading" role="status">
              <LoaderCircle className="spin" size={28} />
              <h2>Preparando seu radar de viagens</h2>
              <p>Carregando seus monitores e conexões.</p>
            </div>
          ) : !status ? (
            <div className="panel unavailable">
              <Info size={35} />
              <h1>Não conseguimos conectar ao painel.</h1>
              <p>Verifique se o servidor está disponível e tente novamente.</p>
              <button
                className="button button-primary"
                onClick={() => void reload()}
              >
                <RefreshCw size={17} />
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              {!status.authConfigured && <div className="setup-required-notice" role="status"><Info size={18} /><p>{status.authConfiguration === 'too-short' ? 'A senha chegou ao servidor, mas tem menos de 12 caracteres. Ajuste DASHBOARD_PASSWORD em Production no Netlify e publique novamente.' : 'O acesso ainda precisa de uma senha válida no servidor. Você pode experimentar o planejador; consultas e alertas ficam disponíveis após configurar o acesso.'}</p><button type="button" onClick={() => navigate('settings')}>Configurar acesso<ArrowRight size={14} /></button></div>}
              {tab === "overview" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        MAIS VIAGENS, MELHORES ESCOLHAS
                      </span>
                      <h1>
                        Seu próximo destino,
                        <br className="mobile-break" /> pelo melhor preço
                        <span className="heading-dot">.</span>
                      </h1>
                      <p>Oportunidades para viajar mais. E gastar menos.</p>
                    </div>
                    <button
                      className="button button-primary"
                      onClick={() => openCreate()}
                    >
                      <Plus size={18} />
                      Buscar viagem
                    </button>
                  </div>
                  <section className="hero-card">
                    <div className="hero-copy">
                      <span className="hero-badge">
                        <span />
                        FLEXIBILIDADE É SEU MELHOR DESTINO
                      </span>
                      <h2>
                        Deixe o preço
                        <br />
                        inspirar a próxima viagem.
                      </h2>
                      <p>
                        Explore datas, descubra novas rotas e receba um aviso
                        <br className="desktop-break" /> quando aparecer uma
                        oportunidade de verdade.
                      </p>
                      <button
                        className="button button-cream"
                        onClick={() => navigate("explore")}
                      >
                        Buscar passagens
                        <ArrowRight size={17} />
                      </button>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <span className="art-star star-one">✦</span>
                      <span className="art-star star-two">✦</span>
                      <div className="art-ticket">
                        <div className="ticket-header">
                          <Plane size={19} />
                          <span>SEU PRÓXIMO EMBARQUE</span>
                        </div>
                        <div className="ticket-route">
                          <span>
                            VOCÊ<small>De onde estiver</small>
                          </span>
                          <div className="ticket-plane">
                            <span />
                            <Plane size={22} />
                            <span />
                          </div>
                          <span>
                            MUNDO<small>Novas possibilidades</small>
                          </span>
                        </div>
                        <div className="ticket-perforation" />
                        <div className="ticket-bottom">
                          <div>
                            <small>PRIORIDADE</small>
                            <strong>Viajar por menos</strong>
                          </div>
                          <span>
                            <TrendingDown size={23} />
                          </span>
                        </div>
                      </div>
                      <div className="art-note">
                        <span>
                          <Check size={15} />
                        </span>
                        Mais liberdade. Melhores preços.
                      </div>
                    </div>
                  </section>
                  <div className="overview-columns">
                    <section className="panel monitors-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            Oportunidades no seu radar{" "}
                            <span className="number-badge">
                              {monitors.length}
                            </span>
                          </h2>
                          <p>Suas viagens e os últimos preços consultados.</p>
                        </div>
                        {monitors.length > 0 && (
                          <button
                            className="text-button"
                            onClick={() => { navigate("monitors"); setCreateMonitor(false); }}
                          >
                            Ver todos
                            <ArrowRight size={15} />
                          </button>
                        )}
                      </div>
                      {monitors.length === 0 ? (
                        <div className="empty-radar">
                          <div
                            className="radar-illustration"
                            aria-hidden="true"
                          >
                            <div />
                            <span className="radar-plane">
                              <Plane size={25} />
                            </span>
                            <span className="radar-pin">
                              <MapPin size={16} />
                            </span>
                          </div>
                          <h3>Uma boa viagem começa com um radar.</h3>
                          <p>
                            Escolha para onde quer ir. A gente acompanha o preço
                            <br className="desktop-break" /> e avisa quando
                            valer a pena fazer as malas.
                          </p>
                          <div className="empty-actions">
                            <button
                              className="button button-primary"
                              onClick={() => openCreate("flight")}
                            >
                              <Plane size={17} />
                              Monitorar passagens
                            </button>
                            <button
                              className="button button-secondary"
                              onClick={() => openCreate("hotel")}
                            >
                              <Hotel size={17} />
                              Monitorar hotel
                            </button>
                          </div>
                          <span className="empty-footnote">
                            Sem preço máximo obrigatório. A oportunidade vem do
                            histórico.
                          </span>
                        </div>
                      ) : (
                        <div className="compact-monitor-list">
                          {monitors.slice(0, 3).map((item) => (
                            <button
                              key={item.monitor.id}
                              className="compact-monitor"
                              onClick={() => {
                                setTab("monitors");
                                setCreateMonitor(false);
                                void viewHistory(item.monitor.id);
                              }}
                            >
                              <span className="compact-monitor-icon">
                                {item.monitor.kind === "flight" ? (
                                  <Plane size={19} />
                                ) : (
                                  <Hotel size={19} />
                                )}
                              </span>
                              <span>
                                <strong>{item.monitor.name}</strong>
                                <small>{queryDescription(item)}</small>
                              </span>
                              <div>
                                <strong>
                                  {item.latest
                                    ? needsPassengerRecheck(item.latest, item.monitor.query.adults) ? 'Reconsultar passageiros' : money(item.latest.price)
                                    : "Sem consultas"}
                                </strong>
                                <small>
                                  {item.latest ? presentFare(item.latest, (item.monitor.query as FlightQuery).adults).context : 'Faça a primeira consulta'}
                                </small>
                              </div>
                              <ChevronRight size={17} />
                            </button>
                          ))}
                        </div>
                      )}
                    </section>

                  </div>

                </>
              )}
              {tab === "explore" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        O PREÇO PODE ESCOLHER A DATA
                      </span>
                      <h1>
                        Encontre sua próxima viagem
                        <span className="heading-dot">.</span>
                      </h1>
                      <p>
                        Busque passagens e, se quiser acompanhar os preços, salve um alerta.
                      </p>
                    </div>
                  </div>
                  <div className="explore-layout">
                    <section className="panel search-panel">
                      {results && searchContext ? <div className="search-recap"><div><strong>{searchContext.kind === 'flight' ? `${airportSetLabel((searchContext.query as FlightQuery).origin, (searchContext.query as FlightQuery).originAirports)} → ${(searchContext.query as FlightQuery).arrivalAirport ? airportSetLabel((searchContext.query as FlightQuery).arrivalAirport!, (searchContext.query as FlightQuery).arrivalAirports) : (searchContext.query as FlightQuery).destination}` : (searchContext.query as HotelQuery).property}</strong><p>{searchContext.query.adults} {searchContext.query.adults === 1 ? 'adulto' : 'adultos'}{searchContext.kind === 'flight' ? ` · ${flightPeriodLabel(searchContext.query as FlightQuery)}` : ''}</p></div><button className="button button-secondary" onClick={() => { setResults(null); setPendingAlert(null); setExploreError(""); }}>Alterar busca</button></div> : <QueryWizard hotelAvailable={status.providers.hotels.configured} mode="explore" searchAlertEnabled={createWhileSearching} onSearchAlertEnabledChange={setCreateWhileSearching} searchAlertFields={alertFields} alertSummary={`${dropPercent}% abaixo da média dos últimos ${windowDays} dias${email ? ` · ${email}` : " · acompanhamento no painel"}`} {...queryProps} submitting={submitting} onSubmit={explore} onKindChange={(value) => { setKind(value); setResults(null); setExploreError(""); }} />}
                    </section>

                  </div>
                  {exploreError && (
                    <div className="error-message" role="alert">
                      <Info size={18} />
                      <span>{exploreError}</span>
                    </div>
                  )}
                  {submitting && (
                    <div className="panel searching-state" role="status">
                      <LoaderCircle size={30} className="spin" />
                      <h3>Procurando novas possibilidades</h3>
                      <p>
                        Consultando as combinações disponíveis na fonte de
                        preços.
                      </p>
                    </div>
                  )}
                  {results && (
                    <section className="results-section" id="search-results">
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">
                            RESULTADO DA SUA PESQUISA
                          </span>
                          <h2>
                            {visibleOffers.length ? `${visibleOffers.length} ${visibleOffers.length === 1 ? 'opção encontrada' : 'opções encontradas'}` : 'Não encontramos preços nesta busca'}
                          </h2>
                        </div>
                        <button
                          className="button button-primary alert-cta" disabled={Boolean(pendingAlert)}
                          onClick={() => searchContext?.monitorId ? navigate("monitors") : openAlert()}
                        >
                          <Bell size={16} />
                          {searchContext?.monitorId ? "Ver meu alerta" : "Criar alerta desta busca"}
                        </button>
                      </div>
                      {pendingAlert && <section className="panel save-alert-panel" aria-labelledby="save-alert-title">
                        <div className="section-heading"><div><h2 id="save-alert-title">Acompanhar esta busca</h2><p>Destino, datas e {pendingAlert.query.adults} {pendingAlert.query.adults === 1 ? 'adulto já selecionado' : 'adultos já selecionados'}.</p></div><button className="icon-button" aria-label="Fechar criação do alerta" onClick={() => { setPendingAlert(null); setError(""); }}><X size={18} /></button></div>
                        <form onSubmit={saveMonitor}>{alertFields}{error && <p className="error-message" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button button-secondary" onClick={() => { setPendingAlert(null); setError(""); }}>Cancelar</button><button className="button button-primary" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={17} /> : <Bell size={17} />}{submitting ? 'Salvando…' : 'Salvar alerta'}</button></div></form>
                      </section>}
                      {results.offers.length > 0 && <p className="search-results-note">{results.search?.message || 'Preços encontrados para as datas consultadas.'} Confira o valor final, bagagem e condições antes de comprar.</p>}
                      <details className="search-explanation"><summary>Sobre esta busca</summary><p>{results.coverage.description}</p>{results.warnings.length > 0 && <ul>{results.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}</details>
                      {visibleOffers.length > 0 && <div className="results-toolbar"><span>Compare horários, escalas e condições.</span><label>Ordenar por<select aria-label="Ordenar passagens" value={offerSort} onChange={event => setOfferSort(event.target.value as OfferSort)}><option value="price-asc">Menor preço</option><option value="price-desc">Maior preço</option><option value="duration">Menor duração da ida</option><option value="departure">Data de ida</option></select></label></div>}
                      {visibleOffers.length ? (
                        <div className="offers-grid">
                          {visibleOffers.map((offer) => (
                            <OfferCard key={offer.id} offer={offer} adults={searchContext?.query.adults} />
                          ))}
                        </div>
                      ) : (
                        <div className="panel result-empty">
                          <Search size={28} />
                          <h3>
                            Vamos tentar outras combinações?
                          </h3>
                          <p>
                            {results.search?.message || 'Não recebemos preços compatíveis nesta consulta. Isso não significa que não existam passagens para esse destino.'}
                          </p><button className="button button-primary" onClick={() => setResults(null)}>Ajustar destino e datas</button>
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}
              {tab === "monitors" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        SUA PRÓXIMA VIAGEM, NO RADAR
                      </span>
                      <h1>
                        {createMonitor
                          ? editingId ? "Editar alerta" : "Criar alerta"
                          : "Alertas salvos"}
                        <span className="heading-dot">.</span>
                      </h1>
                      <p>
                        {createMonitor
                          ? "Escolha a viagem que você quer acompanhar."
                          : "Consulte e acompanhe suas viagens."}
                      </p>
                    </div>

                  </div>
                  {!createMonitor && <div className="alert-view-tabs"><button onClick={() => openCreate("flight")}><Plus size={16} />Buscar outra viagem</button></div>}
                  {!status.collection?.enabled && !createMonitor && <p className="manual-update-note"><Info size={15} />Atualização manual. <button className="text-button" onClick={() => navigate("settings")}>Ativar avisos automáticos</button></p>}
                  {runReport && !createMonitor && (
                    <div className="run-report" role="status">
                      {runReport.warnings.length > 0 && <details className="search-explanation"><summary>Sobre esta atualização</summary><p>{runReport.coverage.description}</p><ul>{runReport.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
                      {runReport.notifications?.map((notification, i) => (
                        <p className="notification-note" key={i}>
                          {notification.channel === "email"
                            ? "E-mail"
                            : "Telegram"}
                          :{" "}
                          {notification.status === "sent"
                            ? "alerta enviado"
                            : notification.status === "duplicate"
                              ? "oferta já notificada"
                              : notification.status === "not-configured"
                                ? "canal não configurado"
                                : "envio falhou"}
                        </p>
                      ))}
                    </div>
                  )}
                  {createMonitor ? (
                    <section className="panel monitor-form">
                      <QueryWizard key={editingId || "create"} editing={Boolean(editingId)} hotelAvailable={status.providers.hotels.configured} mode="monitor" {...queryProps} onKindChange={setKind} submitting={submitting} onSubmit={saveMonitor} onCancel={() => { setCreateMonitor(false); setEditingId(null); setError(""); }} alertSummary={`${dropPercent}% abaixo da média dos últimos ${windowDays} dias · ${[email ? "e-mail" : "", telegram ? "Telegram" : ""].filter(Boolean).join(" e ") || "acompanhamento no painel"}`} alertFields={alertFields} />
                    </section>
                  ) : (
                    <>
                      <div className="monitor-toolbar">
                        <div
                          className="filter-tabs"
                          role="group"
                          aria-label="Filtrar monitores"
                        >
                          {(
                            [
                              { id: "all", label: "Todos" },
                              { id: "flight", label: "Passagens" },
                              { id: "hotel", label: "Hotéis" },
                            ] as const
                          ).map((filter) => (
                            <button
                              key={filter.id}
                              aria-pressed={monitorFilter === filter.id}
                              className={
                                monitorFilter === filter.id ? "selected" : ""
                              }
                              onClick={() => setMonitorFilter(filter.id)}
                            >
                              {filter.label}
                              <span>
                                {filter.id === "all"
                                  ? monitors.length
                                  : monitors.filter(
                                      (item) => item.monitor.kind === filter.id,
                                    ).length}
                              </span>
                            </button>
                          ))}
                        </div>
                        <label className="monitor-sort">Ordenar<select aria-label="Ordenar alertas" value={monitorSort} onChange={event => setMonitorSort(event.target.value)}><option value="recent">Mais recentes</option><option value="price">Menor preço</option><option value="name">Nome</option></select></label>
                        <span className="muted-small">
                          {activeCount}{" "}
                          {status.collection?.enabled ? activeCount === 1 ? 'alerta habilitado' : 'alertas habilitados' : activeCount === 1 ? 'busca salva' : 'buscas salvas'}
                        </span>
                      </div>
                      {filteredMonitors.length === 0 ? (
                        <div className="panel monitor-empty">
                          <span className="empty-large-icon">
                            <Bell size={29} />
                          </span>
                          <h2>
                            {monitors.length
                              ? "Nenhum alerta nesta categoria."
                              : "Seu radar está esperando a primeira viagem."}
                          </h2>
                          <p>
Escolha uma viagem no mapa para começar.
                          </p>
                          <button
                            className="button button-primary"
                            onClick={() =>
                              openCreate(
                                monitorFilter === "all"
                                  ? undefined
                                  : monitorFilter,
                              )
                            }
                          >
                            <Plus size={18} />
                            Criar meu primeiro alerta
                          </button>
                        </div>
                      ) : (
                        <div className="monitor-grid">
                          {filteredMonitors.map((item) => (
                            <article
                              className="panel monitor-card" id={`monitor-${item.monitor.id}`}
                              key={item.monitor.id}
                            >
                              <div className="monitor-card-top">
                                <span className="monitor-kind-icon">
                                  {item.monitor.kind === "flight" ? (
                                    <Plane size={22} />
                                  ) : (
                                    <Hotel size={22} />
                                  )}
                                </span>
                                <StatusPill
                                  configured={item.monitor.enabled && Boolean(status.collection?.enabled)}
                                  text={!item.monitor.enabled ? 'Pausado' : status.collection?.enabled ? 'Aguardando histórico' : 'Atualização manual'}
                                />
                                <button
                                  className="icon-button danger-button"
                                  title="Excluir alerta"
                                  aria-label={`Excluir ${item.monitor.name}`}
                                  disabled={busyId === item.monitor.id}
                                  onClick={() => setDeleteId(item.monitor.id)}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                              <h2>{item.monitor.name}</h2>
                              <p className="monitor-description">
                                {queryDescription(item)}
                              </p>
                              {item.latest ? <>
                                <div className="monitor-price"><FareAmount offer={item.latest} adults={(item.monitor.query as FlightQuery | HotelQuery).adults} />{item.baseline.dropPercent !== null && item.baseline.dropPercent > 0 && <span className="drop-badge"><ArrowDownRight size={15} />{item.baseline.dropPercent.toFixed(1)}%</span>}</div>
                                <FlightFacts offer={item.latest} />
                                {!needsPassengerRecheck(item.latest, item.monitor.query.adults) && item.latest.url && /^https:\/\//i.test(item.latest.url) && <a className="text-button saved-offer-link" href={item.latest.url} target="_blank" rel="noopener noreferrer">Conferir no vendedor<ExternalLink size={14} /></a>}
                                <span className="last-query">Consultado em {dateTime(item.latest.observedAt)}</span>
                              </> : <div className="monitor-price"><div><strong>{busyId === item.monitor.id ? 'Consultando preços…' : 'Faça a primeira consulta'}</strong><small>{busyId === item.monitor.id ? 'Você pode continuar usando o painel.' : 'Use Consultar preços abaixo para ver as opções.'}</small></div></div>}
                              {item.monitor.creationEmail && item.monitor.creationEmail.status !== 'no-recipient' && <p className="creation-receipt">{confirmationMessage(item.monitor)}{(item.monitor.creationEmail.status === 'failed' || item.monitor.creationEmail.status === 'not-configured') && status.notifications.email && <button className="text-button" onClick={async () => { try { await api(`/monitors/${item.monitor.id}/confirmation`, { method: 'POST' }); setMonitors((await api<{ monitors: MonitorSummary[] }>("/monitors")).monitors); } catch (error) { setError((error as Error).message); } }}>Tentar enviar confirmação</button>}</p>}
                              <details className="monitor-secondary"><summary>Regra e histórico</summary>
                                <div className="baseline-row"><span>Média de referência</span><strong>{item.baseline.mean !== null ? money(item.baseline.mean) : "Aguardando preços confirmados"}</strong></div>
                                <p>Avisar com queda de {item.monitor.rule.dropPercent}% em {item.monitor.rule.windowDays} dias.</p>
                                <p>{item.baseline.validDays} dias válidos para comparação · {[item.monitor.channels.email, item.monitor.channels.telegram ? 'Telegram' : ''].filter(Boolean).join(' e ') || 'Sem canal de envio'}</p>
                              </details>
                              {item.monitor.kind === 'flight' && <details className="saved-search-map"><summary>Ver busca no mapa</summary><Suspense fallback={<p>Carregando mapa…</p>}><SavedSearchMap query={item.monitor.query as FlightQuery} /></Suspense></details>}
                              <div className="monitor-card-actions">
                                <button
                                  className="button button-secondary button-small"
                                  disabled={busyId === item.monitor.id}
                                  onClick={() =>
                                    void monitorAction(item.monitor.id, "run")
                                  }
                                >
                                  {busyId === item.monitor.id ? (
                                    <LoaderCircle size={14} className="spin" />
                                  ) : (
                                    <RefreshCw size={14} />
                                  )}
                                  Consultar preços
                                </button>
                                <button className="text-button" onClick={() => openEdit(item)}><Pencil size={14} />Editar</button>
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    void viewHistory(item.monitor.id)
                                  }
                                >
                                  Histórico
                                </button>
                                <button
                                  className="text-button pause-button"
                                  disabled={busyId === item.monitor.id}
                                  onClick={() =>
                                    void monitorAction(
                                      item.monitor.id,
                                      "toggle",
                                      !item.monitor.enabled,
                                    )
                                  }
                                >
                                  {item.monitor.enabled ? "Pausar" : "Ativar"}
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
              {tab === "settings" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">DO SEU JEITO</span>
                      <h1>
                        Configurações
                        <span className="heading-dot">.</span>
                      </h1>
                      <p>
                        Acompanhe seus avisos e veja o que já está disponível.
                      </p>
                    </div>
                    <button
                      className="button button-secondary"
                      onClick={() => void reload()}
                    >
                      <RefreshCw size={16} />
                      Atualizar status
                    </button>
                  </div>
                  <SettingsPanel status={status} onSearch={() => openCreate("flight")} onAlerts={() => setTab("monitors")} />
                </>
              )}
              <footer className="main-footer">
                <span className="footer-brand">
                  partiu<span>.</span>
                </span>
                <span>Viaje por menos.</span>
                <span>
                  Feito para a sua próxima viagem <Plane size={13} />
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          <span>{toast}</span>
          <button aria-label="Fechar notificação" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {deleteId && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setDeleteId(null)}
        >
          <section
            className="modal confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="delete-icon">
              <Trash2 size={24} />
            </span>
            <h2 id="delete-title">Excluir este alerta?</h2>
            <p>
              A busca e seu histórico serão removidos. Você pode criar outro
              monitor quando quiser.
            </p>
            <div className="modal-actions">
              <button
                className="button button-secondary"
                onClick={() => setDeleteId(null)}
              >
                Manter alerta
              </button>
              <button
                className="button button-danger"
                disabled={busyId === deleteId}
                onClick={() => void monitorAction(deleteId, "delete")}
              >
                {busyId === deleteId && (
                  <LoaderCircle size={16} className="spin" />
                )}
                Excluir alerta
              </button>
            </div>
          </section>
        </div>
      )}
      {historyId && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setHistoryId(null)}
        >
          <section
            className="modal history-modal" ref={historyDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">
              <div>
                <span className="eyebrow">PREÇOS OBSERVADOS</span>
                <h2 id="history-title">Histórico do alerta</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Fechar janela do histórico"
                onClick={() => setHistoryId(null)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="history-subtitle">
              {
                monitors.find((item) => item.monitor.id === historyId)?.monitor
                  .name
              }
            </p>
            {historyLoading ? (
              <div className="history-empty">
                <LoaderCircle className="spin" size={25} />
                <p>Carregando consultas…</p>
              </div>
            ) : observations.length === 0 ? (
              <div className="history-empty">
                <CalendarDays size={30} />
                <h3>A referência começa na primeira consulta.</h3>
                <p>Ainda não há observações de preço para este alerta.</p>
              </div>
            ) : (
              <div className="history-list">
                {!observations.some(observation => (observation.criteriaVersion ?? 0) === (monitors.find(item => item.monitor.id === historyId)?.monitor.criteriaVersion ?? 0)) && <p className="history-empty">Ainda não há consultas para os critérios atuais.</p>}
                {observations.filter(observation => (observation.criteriaVersion ?? 0) === (monitors.find(item => item.monitor.id === historyId)?.monitor.criteriaVersion ?? 0)).map((observation, index) => (
                  <HistoryItem key={index} observation={observation} adults={(monitors.find(item => item.monitor.id === historyId)?.monitor.query as FlightQuery | undefined)?.adults} />
                ))}
                {observations.some(observation => (observation.criteriaVersion ?? 0) !== (monitors.find(item => item.monitor.id === historyId)?.monitor.criteriaVersion ?? 0)) && <details className="search-explanation"><summary>Consultas anteriores à edição</summary><p>Estas consultas ficam fora da referência atual.</p>{observations.filter(observation => (observation.criteriaVersion ?? 0) !== (monitors.find(item => item.monitor.id === historyId)?.monitor.criteriaVersion ?? 0)).map(observation => <HistoryItem key={observation.id} observation={observation} />)}</details>}
              </div>
            )}
            <div className="inline-note">
              <Info size={15} />
              <span>
                Os preços refletem o momento da consulta e podem mudar até a
                reserva.
              </span>
            </div>
            <div className="modal-actions history-actions"><button className="button button-secondary" onClick={() => setHistoryId(null)}>Fechar histórico</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
function HistoryItem({ observation, adults }: { observation: Observation; adults?: number }) {
  // Observation details are supplied by the server; only actual recorded values are rendered.
  const value = observation as unknown as {
    observedAt?: string;
    createdAt?: string;
    date?: string;
    price?: number;
    lowestPrice?: number;
    offer?: Offer;
    offers?: Offer[];
  };
  const offer = value.offer || value.offers?.[0];
  const price = value.price ?? value.lowestPrice ?? offer?.price;
  const timestamp =
    value.observedAt || value.createdAt || value.date || offer?.observedAt;
  return (
    <article className="history-row">
      <span className="history-dot" />
      <div>
        <strong>
          {timestamp ? dateTime(timestamp) : "Consulta registrada"}
        </strong>
        <small>{offer?.title || "Preço observado na consulta"}</small>
        {offer?.kind === 'flight' && <FlightFacts offer={offer} />}
        {offer?.url && /^https:\/\//i.test(offer.url) && !needsPassengerRecheck(offer, adults) && <a className="text-button" href={offer.url} target="_blank" rel="noopener noreferrer">Ver passagem<ExternalLink size={14} /></a>}
      </div>
      <div className="history-fare"><strong>{offer && needsPassengerRecheck(offer, adults) ? "Reconsultar passageiros" : typeof price === "number" ? money(price) : "Sem oferta disponível"}</strong><small>{offer ? presentFare(offer, adults).context : 'Total não confirmado'}</small></div>
    </article>
  );
}
