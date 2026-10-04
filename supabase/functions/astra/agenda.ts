// Agenda: horários livres e marcação de reunião.
// Modo interno (padrão): regras de disponibilidade do cliente + reuniões já marcadas no banco.
// Modo Google: além disso consulta o Google Agenda (ocupado/livre) e cria o evento com link do Meet.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

type Config = {
  fuso: string;
  dias: number[];
  inicio: string;
  fim: string;
  duracao_min: number;
  antecedencia_h: number;
  janela_dias: number;
  google?: { segredo: string; calendar_id?: string };
};

export function configAgenda(t: any): Config {
  const a = t.config?.agenda ?? {};
  return {
    fuso: a.fuso ?? "America/Sao_Paulo",
    dias: Array.isArray(a.dias) ? a.dias : [1, 2, 3, 4, 5],
    inicio: a.inicio ?? "10:00",
    fim: a.fim ?? "18:00",
    duracao_min: a.duracao_min ?? 45,
    antecedencia_h: a.antecedencia_h ?? 20,
    janela_dias: a.janela_dias ?? 14,
    google: a.google,
  };
}

// ---------- fuso horário sem bibliotecas ----------
function partes(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  return p;
}
function offsetMin(d: Date, tz: string) {
  const p = partes(d, tz);
  const comoUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((comoUTC - d.getTime()) / 60000);
}
function localParaUTC(y: number, m: number, d: number, h: number, mi: number, tz: string) {
  const palpite = Date.UTC(y, m - 1, d, h, mi);
  let r = new Date(palpite - offsetMin(new Date(palpite), tz) * 60000);
  r = new Date(palpite - offsetMin(r, tz) * 60000); // corrige virada de horário de verão
  return r;
}
const DIAS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>;

export function rotulo(iso: string, fuso: string, idioma = "pt") {
  const loc = idioma === "en" ? "en-US" : idioma === "es" ? "es-ES" : "pt-BR";
  try {
    return new Intl.DateTimeFormat(loc, { timeZone: fuso, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(
      new Date(iso),
    );
  } catch {
    return new Intl.DateTimeFormat(loc, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(
      new Date(iso),
    ) + " UTC";
  }
}

// ---------- Google ----------
async function tokenGoogle(sb: SupabaseClient, nomeSegredo: string) {
  const { data: refresh } = await sb.rpc("astra_segredo", { nome: nomeSegredo });
  const id = Deno.env.get("GOOGLE_CLIENT_ID"), secret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!refresh || !id || !secret) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh as string, grant_type: "refresh_token" }),
  });
  if (!r.ok) {
    console.error("google token", r.status);
    return null;
  }
  return (await r.json()).access_token as string;
}

async function ocupadosGoogle(token: string, cal: string, de: Date, ate: Date) {
  const r = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: de.toISOString(), timeMax: ate.toISOString(), items: [{ id: cal }] }),
  });
  if (!r.ok) return [];
  const d = await r.json();
  return (d.calendars?.[cal]?.busy ?? []).map((b: any) => [Date.parse(b.start), Date.parse(b.end)] as [number, number]);
}

// ---------- horários livres ----------
export async function horariosLivres(sb: SupabaseClient, t: any, maximo = 40) {
  const cfg = configAgenda(t);
  const agora = Date.now();
  const de = new Date(agora + cfg.antecedencia_h * 3600e3);
  const ate = new Date(agora + cfg.janela_dias * 86400e3);

  const { data: marcadas } = await sb.from("astra_reunioes").select("inicio, fim")
    .eq("tenant_id", t.id).eq("status", "marcada").gte("fim", de.toISOString()).lte("inicio", ate.toISOString());
  const ocupado: [number, number][] = (marcadas ?? []).map((m) => [Date.parse(m.inicio), Date.parse(m.fim)]);

  let token: string | null = null;
  if (cfg.google?.segredo) {
    token = await tokenGoogle(sb, cfg.google.segredo);
    if (token) ocupado.push(...await ocupadosGoogle(token, cfg.google.calendar_id ?? "primary", de, ate));
  }

  const [hi, mi] = cfg.inicio.split(":").map(Number), [hf, mf] = cfg.fim.split(":").map(Number);
  const livres: string[] = [];
  for (let d = 0; d <= cfg.janela_dias && livres.length < maximo; d++) {
    const p = partes(new Date(agora + d * 86400e3), cfg.fuso);
    if (!cfg.dias.includes(DIAS[p.weekday])) continue;
    for (let min = hi * 60 + mi; min + cfg.duracao_min <= hf * 60 + mf; min += cfg.duracao_min) {
      const ini = localParaUTC(+p.year, +p.month, +p.day, Math.floor(min / 60), min % 60, cfg.fuso);
      const fim = ini.getTime() + cfg.duracao_min * 60e3;
      if (ini < de || ini > ate) continue;
      if (ocupado.some(([a, b]) => ini.getTime() < b && fim > a)) continue;
      livres.push(ini.toISOString());
      if (livres.length >= maximo) break;
    }
  }
  return { livres, token, cfg };
}

/** sugere poucos horários, espalhados em dias diferentes */
export async function sugerir(sb: SupabaseClient, t: any, fusoCliente: string, idioma: string) {
  const { livres, cfg } = await horariosLivres(sb, t);
  const porDia = new Map<string, string>();
  for (const iso of livres) {
    const dia = iso.slice(0, 10);
    if (!porDia.has(dia)) porDia.set(dia, iso);
    if (porDia.size >= 3) break;
  }
  const fuso = validarFuso(fusoCliente) ?? cfg.fuso;
  return [...porDia.values()].map((iso) => ({ inicio: iso, para_o_cliente: rotulo(iso, fuso, idioma), fuso_cliente: fuso }));
}

export function validarFuso(tz: unknown) {
  const s = String(tz ?? "");
  if (!s) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: s });
    return s;
  } catch {
    return null;
  }
}

/** marca a reunião — só aceita um horário que esteja livre AGORA (a IA não consegue inventar horário) */
export async function agendar(sb: SupabaseClient, t: any, c: any, inicioIso: string, email: string | null) {
  const pedido = Date.parse(inicioIso);
  if (!Number.isFinite(pedido)) return { ok: false, erro: "Horário inválido. Use ver_horarios e escolha um dos horários sugeridos." };
  const { livres, token, cfg } = await horariosLivres(sb, t, 400);
  const iso = livres.find((x) => Math.abs(Date.parse(x) - pedido) < 60e3);
  if (!iso) return { ok: false, erro: "Esse horário não está mais disponível. Chame ver_horarios de novo e ofereça novas opções." };

  const fim = new Date(Date.parse(iso) + cfg.duracao_min * 60e3).toISOString();
  let link: string | null = null, eventId: string | null = null;

  if (token) {
    const r = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${
        encodeURIComponent(cfg.google?.calendar_id ?? "primary")
      }/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: `Conversa inicial — ${c.nome ?? "novo cliente"}`,
          description: [c.resumo, c.escopo, c.pais].filter(Boolean).join("\n"),
          start: { dateTime: iso },
          end: { dateTime: fim },
          attendees: email ? [{ email }] : [],
          conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
        }),
      },
    );
    if (r.ok) {
      const ev = await r.json();
      link = ev.hangoutLink ?? null;
      eventId = ev.id ?? null;
    } else console.error("google evento", r.status);
  }

  const { error } = await sb.from("astra_reunioes").insert({
    tenant_id: t.id,
    contato_id: c.id,
    inicio: iso,
    fim,
    email_cliente: email,
    link,
    google_event_id: eventId,
  });
  if (error) return { ok: false, erro: "Não consegui registrar a reunião. Chame a equipe." };
  return { ok: true, inicio: iso, link, convite_enviado: !!(token && email) };
}
