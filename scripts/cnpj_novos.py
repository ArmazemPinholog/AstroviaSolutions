#!/usr/bin/env python3
"""
CNPJs recém-abertos em Curitiba → leads da Astra.

Lê os dados abertos do CNPJ da Receita Federal (arquivos Estabelecimentos e Empresas,
publicados todo mês), filtra:
  • município Curitiba (código 7535 na tabela da Receita)
  • situação cadastral ATIVA
  • atividade principal (CNAE) de clínicas, salões, barbearias e oficinas
  • aberto nos últimos DIAS dias (padrão 90)
e manda para a função gestao-agente (ação importar_cnpj) com a chave interna ASTRA_CHAVE_CNPJ.

Proteção de dados: o nome empresarial de MEI traz o CPF do dono no fim; o CPF é removido aqui
(e de novo na função) e só o primeiro nome vira "dono". Nada é impresso no log além de contagens.

Uso: python3 scripts/cnpj_novos.py            (baixa, filtra e envia)
     python3 scripts/cnpj_novos.py --teste    (só conta, não envia)
"""
import csv
import io
import json
import os
import re
import sys
import time
import urllib.request
import zipfile
from datetime import date, datetime, timedelta

BASE = os.environ.get("RECEITA_BASE", "https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj").rstrip("/")
MUNICIPIO = os.environ.get("MUNICIPIO_RECEITA", "7535")  # Curitiba
DIAS = int(os.environ.get("DIAS", "90"))
FUNCAO = os.environ.get("ASTRA_URL", "https://jfariprplbmuorzdhhav.supabase.co/functions/v1/gestao-agente")
CHAVE = os.environ.get("ASTRA_CHAVE_CNPJ", "")
PASTA = os.environ.get("PASTA_TMP", "/tmp/cnpj")

# CNAE principal → nicho do lead
CNAES = {
    "9602501": "salão de beleza",       # cabeleireiros, manicure e pedicure (barbearias também; o nome decide)
    "9602502": "clínica de estética",   # estética e outros serviços de beleza
    "8630504": "clínica odontológica",
    "8630503": "clínica médica",        # consultas médicas
    "8650004": "fisioterapia",
    "4520001": "oficina mecânica",      # manutenção e reparação mecânica de veículos
    "4520002": "oficina mecânica",      # lanternagem e pintura
    "4520003": "oficina mecânica",      # elétrica de veículos
    "4543900": "oficina de motos",      # manutenção de motocicletas
}
extra = os.environ.get("CNAES_EXTRA", "").strip()
if extra:  # ex.: "9609208:pet shop" (só nichos aceitos pela função entram)
    for par in extra.split(","):
        c, _, n = par.partition(":")
        if c.strip().isdigit():
            CNAES[c.strip()] = n.strip()

CPF = re.compile(r"\d{11}")


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


def existe(url):
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0 Astrovia"})
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status == 200
    except Exception:
        return False


def mes_mais_recente():
    ano, mes = date.today().year, date.today().month
    for _ in range(4):
        m = f"{ano}-{mes:02d}"
        if existe(f"{BASE}/{m}/Estabelecimentos0.zip"):
            return m
        ano, mes = (ano, mes - 1) if mes > 1 else (ano - 1, 12)
    raise SystemExit(f"Não achei os arquivos da Receita em {BASE}/AAAA-MM/. Confira o endereço (variável RECEITA_BASE).")


def baixar(url, destino):
    for tentativa in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 Astrovia"})
            with urllib.request.urlopen(req, timeout=300) as r, open(destino, "wb") as f:
                while True:
                    bloco = r.read(1 << 20)
                    if not bloco:
                        break
                    f.write(bloco)
            return
        except Exception as e:
            log(f"falha ao baixar ({e}); tentando de novo")
            time.sleep(10 * (tentativa + 1))
    raise SystemExit(f"Não consegui baixar {url}")


def linhas(zip_path, contem=None):
    """lê o CSV de dentro do zip; com `contem`, só interpreta as linhas que têm esse trecho (muito mais rápido)"""
    with zipfile.ZipFile(zip_path) as z:
        for nome in z.namelist():
            with z.open(nome) as f:
                for bruta in io.TextIOWrapper(f, encoding="latin-1", newline=""):
                    if contem and contem not in bruta:
                        continue
                    yield from csv.reader([bruta], delimiter=";", quotechar='"')


def filtrar_estabelecimentos(linhas_iter, corte):
    """layout: 0 cnpj_basico, 1 ordem, 2 dv, 3 matriz/filial, 4 nome fantasia, 5 situação, 10 início atividade,
    11 CNAE principal, 13 tipo logradouro, 14 logradouro, 15 número, 16 complemento, 17 bairro, 18 CEP, 19 UF,
    20 município, 21 DDD1, 22 telefone1, 23 DDD2, 24 telefone2, 27 e-mail"""
    for c in linhas_iter:
        if len(c) < 28 or c[20] != MUNICIPIO or c[5] != "02" or c[11] not in CNAES or c[10] < corte:
            continue
        yield c


def montar(c, empresa):
    razao = CPF.sub("", empresa.get("razao", "")).strip()
    fantasia = c[4].strip()
    nome = fantasia or razao
    nicho = CNAES[c[11]]
    if nicho == "salão de beleza" and re.search(r"barb", nome, re.I):
        nicho = "barbearia"
    dono = ""
    if empresa.get("mei") and razao:  # MEI: o nome empresarial é o nome do dono
        dono = razao.split()[0]
    tel = (c[21] + c[22]).strip() or (c[23] + c[24]).strip()
    endereco = " ".join(x for x in [c[13], c[14], c[15]] if x.strip()).strip()
    if c[17].strip():
        endereco += f" - {c[17].strip()}"
    return {
        "cnpj": c[0] + c[1] + c[2],
        "nome": nome,
        "nicho": nicho,
        "cnae": c[11],
        "aberto_em": f"{c[10][:4]}-{c[10][4:6]}-{c[10][6:8]}",
        "telefone": re.sub(r"\D", "", tel),
        "email": c[27].strip().lower(),
        "endereco": f"{endereco}, Curitiba - PR",
        "bairro": c[17].strip(),
        "dono": dono,
        "mei": bool(empresa.get("mei")),
    }


def enviar(leads):
    total = {"novos": 0, "ja_existiam": 0, "validos": 0}
    for i in range(0, len(leads), 200):
        corpo = json.dumps({"acao": "importar_cnpj", "leads": leads[i:i + 200]}).encode()
        req = urllib.request.Request(FUNCAO, data=corpo, method="POST", headers={"Content-Type": "application/json", "x-astra-chave": CHAVE})
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.loads(r.read())
        for k in total:
            total[k] += int(d.get(k, 0))
    return total


def main():
    teste = "--teste" in sys.argv
    if not teste and len(CHAVE) < 32:
        raise SystemExit("Falta o secret ASTRA_CHAVE_CNPJ no GitHub (Settings → Secrets and variables → Actions).")
    os.makedirs(PASTA, exist_ok=True)
    mes = os.environ.get("MES") or mes_mais_recente()
    corte = (date.today() - timedelta(days=DIAS)).strftime("%Y%m%d")
    log(f"dados de {mes}; abertos desde {corte}; {len(CNAES)} atividades")

    achados = {}
    for n in range(10):
        caminho = f"{PASTA}/Estabelecimentos{n}.zip"
        baixar(f"{BASE}/{mes}/Estabelecimentos{n}.zip", caminho)
        antes = len(achados)
        for c in filtrar_estabelecimentos(linhas(caminho, f'"{MUNICIPIO}"'), corte):
            achados[c[0] + c[1] + c[2]] = c
        os.remove(caminho)
        log(f"Estabelecimentos{n}: +{len(achados) - antes}")

    basicos = {c[0] for c in achados.values()}
    empresas = {}
    for n in range(10):
        if not basicos - empresas.keys():
            break
        caminho = f"{PASTA}/Empresas{n}.zip"
        baixar(f"{BASE}/{mes}/Empresas{n}.zip", caminho)
        # layout: 0 cnpj_basico, 1 razão social, 2 natureza jurídica, 3 qualificação, 4 capital, 5 porte
        for c in linhas(caminho):
            if c and c[0] in basicos and len(c) > 2:
                empresas[c[0]] = {"razao": c[1], "mei": c[2] == "2135"}  # 213-5 = empresário individual
        os.remove(caminho)
        log(f"Empresas{n}: {len(empresas)}/{len(basicos)}")

    leads = [montar(c, empresas.get(c[0], {})) for c in achados.values()]
    por_nicho = {}
    for l in leads:
        por_nicho[l["nicho"]] = por_nicho.get(l["nicho"], 0) + 1
    log(f"{len(leads)} negócios novos no perfil: {por_nicho}")
    if teste:
        return
    log(f"enviado para a Astra: {enviar(leads)}")


if __name__ == "__main__":
    main()
