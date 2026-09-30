import React, { useRef, useState } from "react";
import { Camera, KeyRound, Save } from "lucide-react";
import { sb } from "../supabase";
import { useG, Card, Btn, Field, Input, Textarea, PageHead, Avatar } from "../ui";

const CORES = ["#22d3ee", "#ff2fd0", "#a78bfa", "#34d399", "#fbbf24", "#60a5fa", "#f97316"];

export default function Perfil() {
  const { me, uid, email, save } = useG();
  const [f, setF] = useState(() => ({ ...(me || { id: uid, email }) }));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [senha, setSenha] = useState({ a: "", b: "" });
  const [msgSenha, setMsgSenha] = useState("");
  const file = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const salvar = async () => {
    setBusy(true);
    setMsg("");
    try {
      const p = Math.max(0, Math.min(100, +f.participacao || 0));
      await save("perfis", { ...f, id: uid, email, participacao: p, atualizado_em: new Date().toISOString() });
      setMsg("Perfil salvo ✓");
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  const enviarFoto = async (e) => {
    const arq = e.target.files?.[0];
    if (!arq) return;
    if (arq.size > 2 * 1024 * 1024) return setMsg("Foto muito grande (máx. 2 MB).");
    const ext = (arq.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${uid}/avatar-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from("gestao-avatars").upload(path, arq, { upsert: true, contentType: arq.type });
    if (error) return setMsg(error.message);
    const url = sb.storage.from("gestao-avatars").getPublicUrl(path).data.publicUrl;
    const novo = { ...f, avatar_url: url };
    setF(novo);
    await save("perfis", { ...novo, id: uid, email });
    setMsg("Foto atualizada ✓");
  };

  const trocarSenha = async (e) => {
    e.preventDefault();
    setMsgSenha("");
    if (senha.a.length < 8) return setMsgSenha("Use pelo menos 8 caracteres.");
    if (senha.a !== senha.b) return setMsgSenha("As senhas não conferem.");
    const { error } = await sb.auth.updateUser({ password: senha.a });
    setMsgSenha(error ? error.message : "Senha alterada ✓");
    if (!error) setSenha({ a: "", b: "" });
  };

  return (
    <>
      <PageHead kicker="Conta" title="Meu perfil">
        {msg && <span className="text-sm text-[#22d3ee]">{msg}</span>}
        <Btn variant="neon" onClick={salvar} disabled={busy}><Save size={15} /> {busy ? "Salvando…" : "Salvar perfil"}</Btn>
      </PageHead>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* CARTÃO */}
        <Card className="flex flex-col items-center p-6 text-center">
          <button className="group relative" onClick={() => file.current?.click()} title="Trocar foto">
            <Avatar perfil={f} size={112} />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 transition group-hover:opacity-100">
              <Camera size={22} />
            </span>
          </button>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={enviarFoto} />
          <p className="mt-4 font-display text-xl text-white">{f.nome || "Seu nome"}</p>
          <p className="text-sm text-titanium">{f.cargo || "Seu cargo"}</p>
          <p className="mt-1 font-mono text-[0.62rem] text-titanium-dim">{email}</p>

          <div className="mt-6 w-full text-left">
            <p className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-titanium">Sua cor</p>
            <div className="flex flex-wrap gap-2">
              {CORES.map((c) => (
                <button key={c} onClick={() => setF({ ...f, cor: c })} aria-label={`Cor ${c}`} className="h-7 w-7 rounded-full" style={{ background: c, boxShadow: f.cor === c ? `0 0 0 2px #030305, 0 0 0 4px ${c}` : "none" }} />
              ))}
            </div>
          </div>

          <form onSubmit={trocarSenha} className="mt-6 flex w-full flex-col gap-3 border-t border-white/[0.06] pt-5 text-left">
            <p className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-titanium"><KeyRound size={12} /> Trocar senha</p>
            <Input type="password" placeholder="Nova senha" autoComplete="new-password" value={senha.a} onChange={(e) => setSenha({ ...senha, a: e.target.value })} />
            <Input type="password" placeholder="Repita a nova senha" autoComplete="new-password" value={senha.b} onChange={(e) => setSenha({ ...senha, b: e.target.value })} />
            {msgSenha && <p className="text-xs text-[#22d3ee]">{msgSenha}</p>}
            <Btn type="submit" variant="ghost" className="justify-center">Alterar senha</Btn>
          </form>
        </Card>

        {/* DADOS */}
        <Card className="p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo"><Input value={f.nome} onChange={set("nome")} /></Field>
            <Field label="Cargo / função"><Input value={f.cargo} onChange={set("cargo")} placeholder="Ex.: Sócio · Desenvolvimento" /></Field>
            <Field label="WhatsApp"><Input value={f.whatsapp} onChange={set("whatsapp")} placeholder="(41) 99999-9999" /></Field>
            <Field label="Telefone"><Input value={f.telefone} onChange={set("telefone")} /></Field>
            <Field label="E-mail de acesso"><Input value={email} disabled /></Field>
            <Field label="Cidade"><Input value={f.cidade} onChange={set("cidade")} /></Field>
            <Field label="CPF / CNPJ"><Input value={f.documento} onChange={set("documento")} /></Field>
            <Field label="Chave Pix" hint="Aparece no Financeiro, na divisão entre sócios"><Input value={f.pix} onChange={set("pix")} /></Field>
            <Field label="Aniversário"><Input type="date" value={f.aniversario} onChange={set("aniversario")} /></Field>
            <Field label="Participação na sociedade (%)" hint="Usada para dividir o lucro do mês"><Input type="number" min="0" max="100" step="0.5" value={f.participacao} onChange={set("participacao")} /></Field>
            <Field label="Instagram"><Input value={f.instagram} onChange={set("instagram")} placeholder="@" /></Field>
            <Field label="LinkedIn"><Input value={f.linkedin} onChange={set("linkedin")} /></Field>
            <Field label="Sobre você" className="sm:col-span-2"><Textarea rows={4} value={f.bio} onChange={set("bio")} placeholder="Especialidades, o que você cuida na Astrovia…" /></Field>
          </div>
        </Card>
      </div>
    </>
  );
}
