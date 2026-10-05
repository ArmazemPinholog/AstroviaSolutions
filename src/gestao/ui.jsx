import React, { createContext, useContext, useEffect } from "react";
import { X } from "lucide-react";

/* ============================================================
   Kit visual da Sala de Gestão (mesma linguagem do site:
   Deep Void, ciano + magenta, Space Grotesk / Inter)
   ============================================================ */

export const Ctx = createContext(null);
export const useG = () => useContext(Ctx);

/* ---------- formatação ---------- */
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const money = (v) => brl.format(Number(v) || 0);
/* datas no fuso local (evita "virar o dia" às 21h por causa do UTC) */
const isoLocal = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
export const today = () => isoLocal(new Date());
export const fmtDate = (d) => (d ? new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR") : "—");
export const monthKey = (d) => (d || "").slice(0, 7);
export const addMonths = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1 + n, 1);
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  dt.setDate(Math.min(d, last));
  return isoLocal(dt);
};
export const isLate = (d) => d && d < today();
export const onlyDigits = (s) => (s || "").replace(/\D/g, "");
export const waLink = (n) => {
  const d = onlyDigits(n);
  return d ? `https://wa.me/${d.length <= 11 ? "55" + d : d}` : null;
};
/* telefone fixo (DDD + 8 dígitos começando em 2 a 5): quase nunca tem WhatsApp */
export const ehFixo = (n) => {
  let d = onlyDigits(n);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d.length === 10 && /[2-5]/.test(d[2]);
};
export const initials = (s) =>
  (s || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

/* ---------- peças ---------- */
export function Card({ children, className = "", ...p }) {
  return (
    <div className={`rounded-2xl border border-white/[0.07] bg-[#0a0a11] ${className}`} {...p}>
      {children}
    </div>
  );
}

export function Btn({ children, variant = "primary", size = "md", className = "", ...p }) {
  const v = {
    primary: "bg-white text-[#030305] hover:bg-[#dff9ff]",
    ghost: "border border-white/10 bg-white/[0.03] text-titanium-bright hover:border-white/25 hover:text-white",
    danger: "border border-[#ff2fd0]/30 bg-[#ff2fd0]/10 text-[#ff9be9] hover:bg-[#ff2fd0]/20",
    neon: "bg-[#22d3ee] text-[#030305] hover:bg-[#67e8f9]",
  }[variant];
  const s = { sm: "h-8 px-3 text-[0.7rem]", md: "h-10 px-4 text-[0.78rem]", icon: "h-9 w-9 justify-center" }[size];
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center gap-2 rounded-xl font-display font-medium tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 ${v} ${s} ${className}`}
      {...p}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, className = "", hint }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-titanium">{label}</span>
      {children}
      {hint && <span className="text-[0.7rem] text-titanium-dim">{hint}</span>}
    </label>
  );
}

const inputCls =
  // 16px no celular: abaixo disso o navegador (principalmente o iPhone) dá zoom sozinho ao tocar no campo
  "h-10 w-full rounded-xl border border-white/10 bg-[#05050a] px-3 text-base sm:text-sm text-white outline-none transition placeholder:text-titanium-dim focus:border-[#22d3ee]/60 focus:ring-2 focus:ring-[#22d3ee]/15";

export function Input(p) {
  return <input className={inputCls} {...p} value={p.value ?? ""} />;
}
export function Textarea(p) {
  return <textarea rows={3} className={inputCls + " h-auto py-2.5"} {...p} value={p.value ?? ""} />;
}
export function Select({ options, placeholder, ...p }) {
  return (
    <select className={inputCls + " cursor-pointer"} {...p} value={p.value ?? ""}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) =>
        typeof o === "string" ? (
          <option key={o} value={o}>
            {o}
          </option>
        ) : (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        )
      )}
    </select>
  );
}

export function Badge({ children, color = "#8a8f98" }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.12em]"
      style={{ borderColor: color + "55", color, background: color + "14" }}
    >
      {children}
    </span>
  );
}

export function Avatar({ perfil, size = 32 }) {
  const cor = perfil?.cor || "#22d3ee";
  return perfil?.avatar_url ? (
    <img
      src={perfil.avatar_url}
      alt={perfil.nome || ""}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${cor}55` }}
    />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-[#030305]"
      style={{ width: size, height: size, background: cor, fontSize: size * 0.38 }}
    >
      {initials(perfil?.nome || perfil?.email)}
    </span>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-white/10 bg-[#08080e] shadow-2xl sm:rounded-3xl ${wide ? "sm:max-w-4xl" : "sm:max-w-xl"}`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
          <h3 className="font-display text-lg text-white">{title}</h3>
          <Btn variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </Btn>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ children }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-titanium">
      {children}
    </div>
  );
}

export function PageHead({ kicker, title, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-[#22d3ee]">{kicker}</p>
        <h1 className="mt-1 font-display text-[clamp(1.6rem,3vw,2.2rem)] font-medium tracking-[-0.03em] text-white">{title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, color = "#22d3ee", icon: Icon }) {
  return (
    <Card className="relative overflow-hidden p-4">
      <span className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div className="flex items-center justify-between">
        <p className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-titanium">{label}</p>
        {Icon && <Icon size={15} style={{ color }} />}
      </div>
      <p className="mt-2 font-display text-2xl tabular-nums text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-titanium">{sub}</p>}
    </Card>
  );
}

/* confirmação simples (sem window.confirm, que trava automações) */
export function useConfirm() {
  const [state, setState] = React.useState(null);
  const ask = (msg) => new Promise((res) => setState({ msg, res }));
  const node = (
    <Modal
      open={!!state}
      onClose={() => { state?.res(false); setState(null); }}
      title="Confirmar"
      footer={
        <>
          <Btn variant="ghost" onClick={() => { state.res(false); setState(null); }}>Cancelar</Btn>
          <Btn variant="danger" onClick={() => { state.res(true); setState(null); }}>Sim, apagar</Btn>
        </>
      }
    >
      <p className="text-sm text-titanium-bright">{state?.msg}</p>
    </Modal>
  );
  return [ask, node];
}

/* ---------- dicionários ---------- */
export const ETAPAS = [
  { id: "lead", label: "Lead", color: "#8a8f98" },
  { id: "contato", label: "Em contato", color: "#60a5fa" },
  { id: "proposta", label: "Proposta enviada", color: "#22d3ee" },
  { id: "negociacao", label: "Negociação", color: "#a78bfa" },
  { id: "fechado", label: "Fechado", color: "#34d399" },
  { id: "perdido", label: "Perdido", color: "#ff2fd0" },
];
export const STATUS_PROJETO = [
  { id: "briefing", label: "Briefing", color: "#8a8f98" },
  { id: "design", label: "Design", color: "#a78bfa" },
  { id: "desenvolvimento", label: "Desenvolvimento", color: "#22d3ee" },
  { id: "revisao", label: "Revisão", color: "#fbbf24" },
  { id: "entregue", label: "Entregue", color: "#34d399" },
  { id: "manutencao", label: "Manutenção", color: "#60a5fa" },
  { id: "pausado", label: "Pausado", color: "#ff2fd0" },
];
export const STATUS_CLIENTE = [
  { id: "prospect", label: "Prospect", color: "#a78bfa" },
  { id: "ativo", label: "Ativo", color: "#34d399" },
  { id: "inativo", label: "Inativo", color: "#8a8f98" },
];
export const PRIORIDADES = [
  { id: "alta", label: "Alta", color: "#ff2fd0" },
  { id: "media", label: "Média", color: "#fbbf24" },
  { id: "baixa", label: "Baixa", color: "#8a8f98" },
];
export const find = (list, id) => list.find((x) => x.id === id);
