import React, { useState } from "react";
import { MessageCircle, Mail, Trash2, Shield, Plus } from "lucide-react";
import { useG, Card, Btn, Field, Input, Select, Badge, PageHead, Avatar, waLink, fmtDate, useConfirm } from "../ui";

export default function Equipe() {
  const { db, admin, save, remove, email: meuEmail } = useG();
  const [novo, setNovo] = useState({ email: "", nome: "", papel: "socio" });
  const [erro, setErro] = useState("");
  const [ask, confirmNode] = useConfirm();

  const liberar = async (e) => {
    e.preventDefault();
    setErro("");
    const email = novo.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setErro("E-mail inválido.");
    try {
      await save("equipe", { ...novo, email });
      setNovo({ email: "", nome: "", papel: "socio" });
    } catch (err) {
      setErro(err.message.includes("duplicate") ? "Esse e-mail já está liberado." : err.message);
    }
  };

  const pendentes = db.equipe.filter((m) => !db.perfis.some((p) => p.email?.toLowerCase() === m.email));

  return (
    <>
      {confirmNode}
      <PageHead kicker="Sociedade" title="Equipe" />

      <div className="grid gap-4 md:grid-cols-2">
        {db.perfis.map((p) => {
          const membro = db.equipe.find((m) => m.email === p.email?.toLowerCase());
          const wa = waLink(p.whatsapp || p.telefone);
          return (
            <Card key={p.id} className="relative overflow-hidden p-5">
              <span className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${p.cor || "#22d3ee"}, transparent)` }} />
              <div className="flex items-start gap-4">
                <Avatar perfil={p} size={64} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-lg text-white">{p.nome || p.email}</p>
                    {membro?.papel === "admin" && <Badge color="#22d3ee"><Shield size={10} /> admin</Badge>}
                  </div>
                  <p className="text-sm text-titanium">{p.cargo || "Cargo não informado"}</p>
                  <p className="mt-1 font-mono text-[0.62rem] text-titanium-dim">{p.email}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl text-white">{+p.participacao || 0}%</p>
                  <p className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-titanium">sociedade</p>
                </div>
              </div>
              {p.bio && <p className="mt-4 text-sm leading-relaxed text-titanium-bright">{p.bio}</p>}
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <Info k="WhatsApp" v={p.whatsapp} />
                <Info k="Cidade" v={p.cidade} />
                <Info k="Pix" v={p.pix} />
                <Info k="Aniversário" v={p.aniversario && fmtDate(p.aniversario).slice(0, 5)} />
                <Info k="Instagram" v={p.instagram} />
                <Info k="LinkedIn" v={p.linkedin} />
              </div>
              <div className="mt-4 flex gap-2">
                {wa && <a href={wa} target="_blank" rel="noreferrer"><Btn variant="ghost" size="sm"><MessageCircle size={13} /> WhatsApp</Btn></a>}
                <a href={`mailto:${p.email}`}><Btn variant="ghost" size="sm"><Mail size={13} /> E-mail</Btn></a>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ACESSOS */}
      <Card className="mt-6 p-5">
        <h2 className="font-display text-base text-white">Acessos liberados</h2>
        <p className="mt-1 text-sm text-titanium">
          Só estes e-mails conseguem ver a Sala de Gestão. Depois de liberar, crie a conta da pessoa no Supabase
          (Authentication → Users → <b className="text-titanium-bright">Add user</b>, marcando “Auto Confirm User”).
        </p>

        <div className="mt-4 flex flex-col divide-y divide-white/[0.05] rounded-xl border border-white/[0.06]">
          {db.equipe.map((m) => (
            <div key={m.email} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-titanium-bright">{m.nome ? `${m.nome} · ` : ""}{m.email}</span>
              {pendentes.includes(m) && <Badge color="#fbbf24">ainda não entrou</Badge>}
              <Badge color={m.papel === "admin" ? "#22d3ee" : "#a78bfa"}>{m.papel === "admin" ? "admin" : "sócio(a)"}</Badge>
              {admin && m.email !== meuEmail && (
                <button
                  className="text-titanium hover:text-[#ff9be9]"
                  aria-label="Remover acesso"
                  onClick={async () => { if (await ask(`Remover o acesso de ${m.email}?`)) await remove("equipe", m.email, "email"); }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {admin ? (
          <form onSubmit={liberar} className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_1fr_0.8fr_auto] sm:items-end">
            <Field label="E-mail da pessoa"><Input type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} placeholder="socia@email.com" /></Field>
            <Field label="Nome"><Input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></Field>
            <Field label="Papel"><Select value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value })} options={[{ value: "socio", label: "Sócio(a)" }, { value: "admin", label: "Admin" }]} /></Field>
            <Btn type="submit" variant="neon"><Plus size={14} /> Liberar</Btn>
            {erro && <p className="text-sm text-[#ff9be9] sm:col-span-4">{erro}</p>}
          </form>
        ) : (
          <p className="mt-3 text-xs text-titanium-dim">Somente administradores liberam novos acessos.</p>
        )}
      </Card>
    </>
  );
}

function Info({ k, v }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-titanium-dim">{k}</p>
      <p className="truncate text-titanium-bright">{v || "—"}</p>
    </div>
  );
}
