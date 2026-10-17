import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import QueryWizard, { initialFlight, initialHotel, type FlightDraft, type HotelDraft } from "./components/QueryWizard";
import { labelAirport, findAirport } from "./shared/airports";
import SetupGuide from "./components/SetupGuide";
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
  Globe2,
  Hotel,
  Info,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Plane,
  Plus,
  RefreshCw,
  Search,
  Send,
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
  { id: "explore", label: "Explorar agora", icon: Compass },
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
    return `${labelAirport(flight.origin)} → ${flight.destination} · ${flight.minDays} a ${flight.maxDays} dias`;
  }
  const hotel = q as HotelQuery;
  return `${hotel.property} · ${hotel.pattern === "weekend" ? "sexta a domingo" : hotel.pattern === "weekdays" ? "domingo a sexta" : "semana e fins de semana"}`;
}
function OfferCard({ offer }: { offer: Offer }) {
  const Icon = offer.kind === "flight" ? Plane : Hotel;
  const safeUrl =
    offer.url && /^https?:\/\//i.test(offer.url) ? offer.url : undefined;
  return (
    <article className="offer-card">
      <div className="offer-top">
        <span className="offer-icon">
          <Icon size={21} />
        </span>
        <span className="eyebrow">{offer.kind === "flight" ? "Passagem aérea" : "Hospedagem"}</span>
        <span className={`confirmation ${offer.confirmed ? "confirmed" : ""}`}>
          {offer.confirmed ? <CheckCircle2 size={13} /> : <Info size={13} />}
          {offer.confirmed
            ? "Preço verificado"
            : "Confira o valor final no vendedor"}
        </span>
      </div>
      <h3>{offer.title}</h3>
      <div className="offer-dates">
        <CalendarDays size={15} />
        {date(offer.outboundDate)}
        {offer.returnDate && <> — {date(offer.returnDate)}</>}
        {offer.nights && <> · {offer.nights} noites</>}
      </div>
      {(offer.arrivalAirport || offer.departureAirport) && (
        <p className="offer-route">
          {offer.origin ? `${labelAirport(offer.origin)} → ` : ""}
          {offer.arrivalAirport ? labelAirport(offer.arrivalAirport) : ""}
          {offer.departureAirport &&
          offer.departureAirport !== offer.arrivalAirport
            ? ` / volta por ${labelAirport(offer.departureAirport)}`
            : ""}
        </p>
      )}
      <details className="offer-conditions"><summary>Detalhes da passagem</summary><ul className="offer-details">{offer.details.map((detail, i) => <li key={i}>{detail}</li>)}</ul></details>
      {offer.tripPreview && <TripSummary preview={offer.tripPreview} transport={offer.tripPreview.transport} />}
      <div className="offer-bottom">
        <div>
          <span className="price-label">{offer.tripPreview ? 'Somente passagem aérea · deslocamentos internos à parte' : 'Preço informado pela fonte'}</span>
          <strong>{money(offer.price)}</strong>
        </div>
        {safeUrl ? (
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button button-secondary button-small"
          >
            Ver oferta
            <ExternalLink size={14} />
          </a>
        ) : (
          <span className="muted-small">Sem link de reserva</span>
        )}
      </div>
      <p className="offer-observed">
        Consultado em {dateTime(offer.observedAt)} · sujeito à disponibilidade.
      </p>
    </article>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
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
  const [monitorName, setMonitorName] = useState("");
  const [dropPercent, setDropPercent] = useState("20");
  const [windowDays, setWindowDays] = useState("60");
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ExploreResult | null>(null);
  const [exploreError, setExploreError] = useState("");
  const [monitorFilter, setMonitorFilter] = useState<"all" | Kind>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
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
  const navigate = (next: Tab) => {
    setTab(next);
    setMobileMenu(false);
    setError("");
    if (next !== "monitors") setCreateMonitor(false);
  };
  function openCreate(nextKind?: Kind) {
    if (nextKind) setKind(nextKind);
    setTab("monitors");
    setCreateMonitor(true);
    setMobileMenu(false);
    setError("");
  }
  function makeQuery(): FlightQuery | HotelQuery {
    if (kind === "flight") {
      if (!findAirport(flight.origin.trim()))
        throw new Error(
          "Selecione seu aeroporto de origem na lista de cidades.",
        );
      if (!flight.destination.trim())
        throw new Error("Informe um destino ou região.");
      if (Number(flight.maxDays) < Number(flight.minDays))
        throw new Error(
          "A duração máxima deve ser igual ou maior que a mínima.",
        );
      if (Boolean(flight.departureDate) !== Boolean(flight.returnDate))
        throw new Error(
          "Informe as duas datas ou deixe ambas em branco para uma busca flexível.",
        );
      if (flight.departureDate && flight.returnDate <= flight.departureDate)
        throw new Error("A volta precisa ser depois da ida.");
      return {
        origin: flight.origin.trim(),
        destination: flight.destination.trim(),
        ...(flight.area ? { area: flight.area } : {}),
        ...(flight.destinationMode === 'trip' && flight.tripPlan ? { tripPlan: flight.tripPlan } : {}),
        minDays: Number(flight.minDays),
        maxDays: Number(flight.maxDays),
        horizonMonths: Number(flight.horizonMonths),
        adults: Number(flight.adults),
        allowOpenJaw: flight.allowOpenJaw,
        ...(flight.allowOpenJaw && flight.maxAirportDistanceKm.trim()
          ? { maxAirportDistanceKm: Number(flight.maxAirportDistanceKm) }
          : {}),
        ...(flight.arrivalAirport
          ? { arrivalAirport: flight.arrivalAirport.trim() }
          : {}),
        ...(flight.departureAirport
          ? { departureAirport: flight.departureAirport.trim() }
          : {}),
        ...(flight.departureDate
          ? {
              departureDate: flight.departureDate,
              returnDate: flight.returnDate,
            }
          : {}),
      };
    }
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
    event.preventDefault();
    setSubmitting(true);
    setExploreError("");
    setResults(null);
    try {
      const query = makeQuery();
      setResults(
        await api<ExploreResult>("/explore", {
          method: "POST",
          body: JSON.stringify({ kind, query }),
        }),
      );
    } catch (e) {
      setExploreError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  async function saveMonitor(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const query = makeQuery();
      const saved = await api<{ additionalMonitors?: unknown[] }>("/monitors", {
        method: "POST",
        body: JSON.stringify({
          kind,
          name:
            monitorName.trim() ||
            (kind === "flight"
              ? `${findAirport(flight.origin)?.city || flight.origin} → ${flight.arrivalAirport ? findAirport(flight.arrivalAirport)?.city || flight.destination : flight.destination}`.slice(0, 120)
              : hotel.property.slice(0, 120)),
          query,
          rule: {
            dropPercent: Number(dropPercent),
            windowDays: Number(windowDays),
          },
          channels: {
            ...(email.trim() ? { email: email.trim() } : {}),
            telegram,
          },
        }),
      });
      const data = await api<{ monitors: MonitorSummary[] }>("/monitors");
      setMonitors(data.monitors);
      setCreateMonitor(false);
      setMonitorName("");
      setToast(
        saved.additionalMonitors?.length
          ? "Alertas criados com históricos separados para semana e fim de semana."
          : status?.collection?.enabled ? "Busca salva. O histórico começa com as consultas." : "Busca salva. A atualização automática ainda precisa ser ativada.",
      );
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
        const report = await api<{
          summary: MonitorSummary;
          coverage: Coverage;
          warnings: string[];
          found?: number;
          message?: string;
          notifications?: { channel: string; status: string }[];
        }>(`/monitors/${id}/run`, { method: "POST" });
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
  const configuredCount =
    Number(status?.providers.flights.configured || false) +
    Number(status?.providers.hotels.configured || false);
  const activeCount = monitors.filter((item) => item.monitor.enabled).length;
  const validDays = Math.max(
    0,
    ...monitors.map((item) => item.baseline.validDays),
  );
  const filteredMonitors = monitors.filter(
    (item) => monitorFilter === "all" || item.monitor.kind === monitorFilter,
  );
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
          {error && (
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
                      Criar alerta
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
                        Explorar oportunidades
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
                  <div className="stats-grid">
                    <article className="stat-card">
                      <span className="stat-icon">
                        <Bell size={20} />
                      </span>
                      <div>
                        <p>Alertas habilitados</p>
                        <strong>
                          {activeCount}
                          <small> / {monitors.length}</small>
                        </strong>
                        <span>
                          {status.collection?.enabled
                            ? "Coleta automática habilitada"
                            : "Atualização automática ainda não ativada"}
                        </span>
                      </div>
                    </article>
                    <article className="stat-card">
                      <span className="stat-icon blue">
                        <CalendarDays size={20} />
                      </span>
                      <div>
                        <p>Histórico construído</p>
                        <strong>
                          {validDays}
                          <small> {validDays === 1 ? "dia" : "dias"}</small>
                        </strong>
                        <span>Maior histórico entre seus monitores</span>
                      </div>
                    </article>
                    <article className="stat-card">
                      <span className="stat-icon peach">
                        <Globe2 size={20} />
                      </span>
                      <div>
                        <p>Fontes configuradas</p>
                        <strong>
                          {configuredCount}
                          <small> / 2</small>
                        </strong>
                        <span>
                          {configuredCount === 2
                            ? "Credenciais das duas fontes presentes"
                            : "Passagens e hotéis, em um só lugar"}
                        </span>
                      </div>
                    </article>
                  </div>
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
                          <p>
                            Você escolhe a viagem. O radar acompanha os preços.
                          </p>
                        </div>
                        {monitors.length > 0 && (
                          <button
                            className="text-button"
                            onClick={() => navigate("monitors")}
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
                                    ? money(item.latest.price)
                                    : "Sem consultas"}
                                </strong>
                                <small>
                                  {item.baseline.mean
                                    ? `Média ${money(item.baseline.mean)}`
                                    : "Construindo referência"}
                                </small>
                              </div>
                              <ChevronRight size={17} />
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                    <aside className="panel how-panel">
                      <span className="eyebrow">
                        MENOS BUSCA, MAIS DESCOBERTAS
                      </span>
                      <h2>Seu radar trabalha assim</h2>
                      <ol className="steps">
                        <li>
                          <span>01</span>
                          <div>
                            <h3>Você dá a direção</h3>
                            <p>
                              Destino, duração e a liberdade que combina com
                              você.
                            </p>
                          </div>
                        </li>
                        <li>
                          <span>02</span>
                          <div>
                            <h3>O histórico dá a referência</h3>
                            <p>
                              Comparamos os menores preços diários de buscas
                              equivalentes.
                            </p>
                          </div>
                        </li>
                        <li>
                          <span>03</span>
                          <div>
                            <h3>A oportunidade chama</h3>
                            <p>
                              Uma queda relevante? Você recebe um aviso por
                              e-mail ou Telegram.
                            </p>
                          </div>
                        </li>
                      </ol>
                      <div className="how-note">
                        <TrendingDown size={18} />
                        <span>
                          O foco é o preço.
                          <br />
                          <strong>O destino é viajar mais.</strong>
                        </span>
                      </div>
                    </aside>
                  </div>
                  {configuredCount < 2 && (
                    <div className="setup-banner">
                      <span className="setup-banner-icon">
                        <Settings2 size={20} />
                      </span>
                      <div>
                        <strong>Deixe seu radar pronto para buscar.</strong>
                        <p>
                          {configuredCount === 0
                            ? "Configure as credenciais das fontes para habilitar as consultas reais."
                            : "Uma das fontes ainda precisa de credenciais para habilitar todas as buscas."}{" "}
                          Selecione destinos para planejar suas próximas buscas.
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => navigate("settings")}
                      >
                        Ver conexões
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
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
                        Explore preços agora
                        <span className="heading-dot">.</span>
                      </h1>
                      <p>
                        Veja quanto custa comprar hoje para viajar nos próximos meses. Depois, se quiser, crie um alerta.
                      </p>
                    </div>
                  </div>
                  <div className="explore-layout">
                    <section className="panel search-panel">
                      {results ? <div className="search-recap"><div><strong>{kind === 'flight' ? `${findAirport(flight.origin)?.city || flight.origin} → ${flight.destination}` : hotel.property}</strong><p>{kind === 'flight' ? `${flight.minDays} a ${flight.maxDays} dias · próximos ${flight.horizonMonths} meses` : `Próximos ${hotel.horizonMonths} meses`}</p></div><button className="button button-secondary" onClick={() => { setResults(null); setExploreError(""); }}>Alterar busca</button></div> : <QueryWizard mode="explore" {...queryProps} submitting={submitting} onSubmit={explore} onKindChange={(value) => { setKind(value); setResults(null); setExploreError(""); }} />}
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
                            {results.offers.length ? `${results.offers.length} ${results.offers.length === 1 ? 'passagem encontrada' : 'passagens encontradas'}` : 'Não encontramos preços nesta busca'}
                          </h2>
                        </div>
                        <button
                          className="button button-secondary button-small"
                          onClick={() => openCreate()}
                        >
                          <Bell size={16} />
                          Criar alerta desta busca
                        </button>
                      </div>
                      {results.offers.length > 0 && <p className="search-results-note">{results.search?.message || 'Preços encontrados para as datas consultadas.'} Confira o valor final, bagagem e condições antes de comprar.</p>}
                      <details className="search-explanation"><summary>Sobre esta busca</summary><p>{results.coverage.description}</p>{results.warnings.length > 0 && <ul>{results.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}</details>
                      {results.offers.length ? (
                        <div className="offers-grid">
                          {results.offers.map((offer) => (
                            <OfferCard key={offer.id} offer={offer} />
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
                          ? "Criar alerta"
                          : "Meus alertas"}
                        <span className="heading-dot">.</span>
                      </h1>
                      <p>
                        {createMonitor
                          ? "Defina a viagem. O histórico mostra quando o preço fica interessante."
                          : "Acompanhe a evolução dos preços e descubra a hora de partir."}
                      </p>
                    </div>

                  </div>
                  {!createMonitor && <div className="alert-create-entry"><div><strong>Quer acompanhar uma nova viagem?</strong><p>Escolha o destino no mapa e defina quando quer receber um aviso.</p></div><button className="button button-primary" onClick={() => openCreate()}><Plus size={18} />Novo alerta</button></div>}
                  {!status.collection?.enabled && (
                    <div className="collection-banner">
                      <CalendarDays size={19} />
                      <div>
                        <strong>Atualização automática ainda não ativada</strong>
                        <p>
                          Suas buscas estão salvas. Por enquanto, use Consultar preços para atualizá-las manualmente.
                        </p>
                        <button type="button" className="text-button" onClick={() => navigate("settings")}>Ver configurações <ArrowRight size={14} /></button>
                      </div>
                    </div>
                  )}
                  {runReport && !createMonitor && (
                    <div className="run-report" role="status">
                      <div className="coverage-note">
                        <Info size={18} />
                        <div>
                          <strong>
                            {runReport.found ? 'Preços atualizados' : 'Esta consulta não trouxe preços'}
                          </strong>
                          <p>{runReport.message || 'Confira os preços encontrados nas datas consultadas. A busca não representa todas as datas possíveis.'}</p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="Fechar resultado da consulta"
                          onClick={() => setRunReport(null)}
                        >
                          <X size={16} />
                        </button>
                      </div>
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
                      <QueryWizard mode="monitor" {...queryProps} onKindChange={setKind} submitting={submitting} onSubmit={saveMonitor} onCancel={() => { setCreateMonitor(false); setError(""); }} alertSummary={`${dropPercent}% abaixo da média dos últimos ${windowDays} dias · ${[email ? "e-mail" : "", telegram ? "Telegram" : ""].filter(Boolean).join(" e ") || "sem canal selecionado"}`} alertFields={<>
                      <div className="field-grid monitor-name">
                        <Field
                          label="Nome do alerta (opcional)"
                          hint="Um nome para reconhecer essa vontade de viajar."
                          wide
                        >
                          <input
                            maxLength={100}
                            placeholder={
                              kind === "flight"
                                ? "Ex.: Minhas próximas férias na Europa"
                                : "Ex.: Um fim de semana no Fasano"
                            }
                            value={monitorName}
                            onChange={(e) => setMonitorName(e.target.value)}
                          />
                        </Field>
                      </div>
                      <div className="form-section-heading">
                        <span className="section-icon">
                          <TrendingDown size={18} />
                        </span>
                        <div>
                          <h3>Quando uma oportunidade merece um aviso?</h3>
                          <p>
                            Você não precisa saber o preço ideal. A comparação
                            vem do histórico.
                          </p>
                        </div>
                      </div>
                      <div className="rule-fields">
                        <Field label="Avisar quando cair pelo menos">
                          <div className="input-suffix">
                            <input
                              type="number"
                              required
                              min={1}
                              max={90}
                              value={dropPercent}
                              onChange={(e) => setDropPercent(e.target.value)}
                            />
                            <span>%</span>
                          </div>
                        </Field>
                        <span className="rule-connector">
                          abaixo da média dos últimos
                        </span>
                        <Field label="Período de referência">
                          <select
                            value={windowDays}
                            onChange={(e) => setWindowDays(e.target.value)}
                          >
                            <option value="7">7 dias</option>
                            <option value="15">15 dias</option>
                            <option value="30">30 dias</option>
                            <option value="60">60 dias</option>
                            <option value="90">90 dias</option>
                            <option value="180">180 dias</option>
                          </select>
                        </Field>
                      </div>
                      <div className="inline-note">
                        <Info size={17} />
                        <span>
                          Usamos a média dos menores preços diários de consultas
                          equivalentes. O histórico começa com as consultas e
                          não é retroativo. Alertas exigem ao menos{" "}
                          {status.collection?.minimumHistoryDays ?? 7} dias
                          válidos; resultados parciais ou sem confirmação ficam
                          fora da média.
                        </span>
                      </div>
                      <div className="form-divider" />
                      <div className="form-section-heading">
                        <span className="section-icon">
                          <Send size={17} />
                        </span>
                        <div>
                          <h3>Por onde a boa notícia chega?</h3>
                          <p>Escolha e-mail, Telegram ou os dois.</p>
                        </div>
                      </div>
                      <div className="notification-fields">
                        <Field label="E-mail para receber alertas (opcional)">
                          <input
                            type="email"
                            placeholder="voce@email.com"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                          />
                        </Field>
                        <label className="telegram-option">
                          <input
                            type="checkbox"
                            checked={telegram}
                            onChange={(e) => setTelegram(e.target.checked)}
                          />
                          <span className="telegram-icon">
                            <Send size={20} />
                          </span>
                          <span>
                            <strong>Telegram</strong>
                            <small>Usar o chat conectado ao painel</small>
                          </span>
                        </label>
                      </div>
                      {((email && !status.notifications.email) ||
                        (telegram && !status.notifications.telegram)) && (
                        <p className="notification-note">
                          <Info size={14} />
                          Os canais selecionados precisam estar configurados no
                          servidor para enviar alertas.
                        </p>
                      )}
                      </>} />
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
                            Crie uma busca flexível e receba um aviso quando o
                            preço
                            <br className="desktop-break" /> ficar abaixo da
                            média que você acompanha.
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
                              className="panel monitor-card"
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
                              <div className="monitor-price">
                                <div>
                                  <span>Último preço encontrado</span>
                                  <strong>
                                    {item.latest
                                      ? money(item.latest.price)
                                      : "Aguardando consulta"}
                                  </strong>
                                </div>
                                {item.baseline.dropPercent !== null &&
                                  item.baseline.dropPercent > 0 && (
                                    <span className="drop-badge">
                                      <ArrowDownRight size={15} />
                                      {item.baseline.dropPercent.toFixed(1)}%
                                    </span>
                                  )}
                              </div>
                              <div className="baseline-row">
                                <span>Média de referência</span>
                                <strong>
                                  {item.baseline.mean !== null
                                    ? money(item.baseline.mean)
                                    : "Em construção"}
                                </strong>
                              </div>
                              <div className="monitor-rule">
                                <TrendingDown size={16} />
                                <span>
                                  Avisar com queda de{" "}
                                  <strong>
                                    {item.monitor.rule.dropPercent}%
                                  </strong>{" "}
                                  em {item.monitor.rule.windowDays} dias
                                </span>
                              </div>
                              <div className="monitor-meta">
                                <span>
                                  <CalendarDays size={13} />
                                  {item.baseline.validDays}{" "}
                                  {item.baseline.validDays === 1
                                    ? "dia com preço"
                                    : "dias com preço"}
                                </span>
                                <span>
                                  {item.monitor.channels.email && (
                                    <Mail size={14} />
                                  )}
                                  {item.monitor.channels.telegram && (
                                    <Send size={14} />
                                  )}
                                  {!item.monitor.channels.email &&
                                    !item.monitor.channels.telegram &&
                                    "Sem notificações"}
                                </span>
                              </div>
                              {item.latest && (
                                <span className="last-query">
                                  Última consulta:{" "}
                                  {dateTime(item.latest.observedAt)}
                                </span>
                              )}
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
                      <span className="eyebrow">PREPARE SEU PAINEL</span>
                      <h1>
                        Conexões do seu radar
                        <span className="heading-dot">.</span>
                      </h1>
                      <p>
                        Fontes de preços, canais de alerta e acesso ao seu
                        espaço.
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
                  <SetupGuide status={status} />
                  <div className="settings-notice">
                    <ShieldCheck size={21} />
                    <div>
                      <strong>Suas credenciais ficam no servidor.</strong>
                      <p>
                        Configure as variáveis nas configurações do projeto no
                        Netlify e faça um novo deploy. Nenhuma chave é
                        armazenada no navegador.
                      </p>
                    </div>
                  </div>
                  <section className="settings-section">
                    <div className="section-heading">
                      <div>
                        <h2>Fontes de preços</h2>
                        <p>
                          As consultas dependem das credenciais do fornecedor. A
                          presença da chave não comprova acesso válido.
                        </p>
                      </div>
                    </div>
                    <div className="connection-grid">
                      <ConnectionCard
                        icon={<Plane size={22} />}
                        title="Passagens aéreas"
                        provider={status.providers.flights.name}
                        configured={status.providers.flights.configured}
                        variables={["SERPAPI_API_KEY"]}
                        description="Consulta à fonte configurada, com cobertura e condições apresentadas nos resultados. O acesso depende do plano contratado com o fornecedor."
                      />
                      <ConnectionCard
                        icon={<Hotel size={22} />}
                        title="Hotéis"
                        provider={status.providers.hotels.name}
                        configured={status.providers.hotels.configured}
                        variables={[
                          "BOOKING_API_TOKEN",
                          "BOOKING_AFFILIATE_ID",
                        ]}
                        description={
                          status.providers.hotels.configured
                            ? "Credenciais da Booking presentes neste deploy. A disponibilidade do hotel e a validade do acesso são verificadas em uma consulta real."
                            : "Booking foi escolhido como fonte. O catálogo de hotéis e o conector de preços ainda precisam ser conectados; preencher as credenciais sozinho não conclui essa integração."
                        }
                      />
                    </div>
                  </section>
                  <section className="settings-section">
                    <div className="section-heading">
                      <div>
                        <h2>Onde chegam as oportunidades</h2>
                        <p>
                          Use os dois canais ou escolha o que combina com sua
                          rotina.
                        </p>
                      </div>
                    </div>
                    <div className="connection-grid">
                      <ConnectionCard
                        icon={<Mail size={22} />}
                        title="E-mail"
                        provider="Alertas por e-mail"
                        configured={status.notifications.email}
                        variables={["RESEND_API_KEY", "ALERT_FROM_EMAIL"]}
                        description="Cadastre o endereço de destino em cada monitor. O remetente precisa estar autorizado no serviço de envio."
                      />
                      <ConnectionCard
                        icon={<Send size={22} />}
                        title="Telegram"
                        provider="Seu bot, seu chat"
                        configured={status.notifications.telegram}
                        variables={["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]}
                        description="Conecte um bot e o chat de destino. Ative o Telegram nos monitores cujos alertas você deseja receber."
                      />
                    </div>
                  </section>
                  <section className="panel collection-settings">
                    <span className="section-icon">
                      <CalendarDays size={22} />
                    </span>
                    <div>
                      <h2>Consultas agendadas</h2>
                      <p>
                        {status.collection?.enabled
                          ? "Coleta habilitada em duas rodadas por dia, com limite de monitores por rodada para controlar o uso da API."
                          : "A coleta automática está desativada por padrão para controlar custos. Buscas e consultas manuais ficam disponíveis após configurar a fonte."}
                      </p>
                      <div className="env-chips">
                        <code>ENABLE_SCHEDULED_COLLECTION=true</code>
                      </div>
                    </div>
                    <StatusPill
                      configured={Boolean(status.collection?.enabled)}
                      text={
                        status.collection?.enabled
                          ? "Habilitada"
                          : "Aguardando ativação"
                      }
                    />
                  </section>
                  <section className="panel security-panel">
                    <span className="section-icon">
                      <ShieldCheck size={22} />
                    </span>
                    <div>
                      <h2>Acesso ao painel</h2>
                      <p>
                        {status.authConfigured
                          ? "O acesso está protegido por senha. Sessões e credenciais são verificadas no servidor."
                          : "A autenticação precisa ser configurada antes de publicar o painel com acesso externo."}
                      </p>
                      <div className="env-chips">
                        <code>DASHBOARD_PASSWORD</code>
                      </div>
                    </div>
                    <StatusPill
                      configured={status.authConfigured}
                      text={
                        status.authConfigured
                          ? "Protegido"
                          : "Configurar acesso"
                      }
                    />
                  </section>
                  <p className="settings-footnote">
                    <Info size={15} />
                    “Credenciais presentes” indica a presença das variáveis. A
                    primeira consulta confirma se o fornecedor aceita o acesso e
                    retorna ofertas.
                  </p>
                </>
              )}
              <footer className="main-footer">
                <span className="footer-brand">
                  partiu<span>.</span>
                </span>
                <span>O melhor preço abre novos caminhos.</span>
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
            className="modal history-modal"
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
                aria-label="Fechar histórico"
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
                {observations.map((observation, index) => (
                  <HistoryItem key={index} observation={observation} />
                ))}
              </div>
            )}
            <div className="inline-note">
              <Info size={15} />
              <span>
                Os preços refletem o momento da consulta e podem mudar até a
                reserva.
              </span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function ConnectionCard({
  icon,
  title,
  provider,
  configured,
  variables,
  description,
}: {
  icon: ReactNode;
  title: string;
  provider: string;
  configured: boolean;
  variables: string[];
  description: string;
}) {
  return (
    <article className="panel connection-card">
      <div className="connection-card-top">
        <span className="connection-icon">{icon}</span>
        <StatusPill
          configured={configured}
          text={
            configured ? "Credenciais presentes" : "Configuração necessária"
          }
        />
      </div>
      <h3>{title}</h3>
      <span className="connection-provider">{provider}</span>
      <p>{description}</p>
      <div className="connection-env">
        <span>VARIÁVEIS NO SERVIDOR</span>
        <div className="env-chips">
          {variables.map((variable) => (
            <code key={variable}>{variable}</code>
          ))}
        </div>
      </div>
    </article>
  );
}
function HistoryItem({ observation }: { observation: Observation }) {
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
      </div>
      <strong>
        {typeof price === "number" ? money(price) : "Sem oferta disponível"}
      </strong>
    </article>
  );
}
