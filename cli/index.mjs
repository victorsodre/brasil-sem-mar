#!/usr/bin/env node
// npx brasil-sem-mar <slug> [opções]
// Lê lugares/<slug>/lugar.json, baixa GMRT (mar e, se pedido, terra) e Copernicus GLO-30 (terra),
// funde na grade de saída e grava terreno.png (Terrain-RGB) e terreno.json (proveniência).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validarBbox, calcularGrade, reamostrarParaGrade, fundirGrade, preencherNaN, minMax, escreverTerrenoPng,
  lonDoNo, latDoNo, fmtBytes, fmtSegundos, fmtNum, agoraIso, arredondar,
} from './terrain.mjs';
import { baixarGmrt, lerGeoTiffLocal, mresolutionPadrao, metrosPorNoDoRaster, GMRT_LICENCA, GMRT_ATRIBUICAO } from './gmrt.mjs';
import { coletarCopernicus } from './copernicus.mjs';
import { PACOTE, escreverJson, TIMEOUT_PADRAO_MS } from './rede.mjs';

const RAIZ_PACOTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const AJUDA = `brasil-sem-mar ${PACOTE.version}: baixa o relevo (Copernicus na terra, GMRT no mar) e grava terreno.png + terreno.json

Uso:
  npx brasil-sem-mar <slug> [opções]
  npx brasil-sem-mar --bbox N,S,O,L --slug <slug> --nome "Nome do lugar" [opções]

Opções:
  --largura N       largura da grade em nós (padrão: largura_max_nos do lugar.json, 2048)
  --so-gmrt         ignora o Copernicus e usa só o GMRT (terra mais grosseira)
  --sem-mascara     não baixa a camada topo-mask (fração medida fica nula)
  --mresolution N   metros por nó pedidos ao GridServer (padrão: largura do bbox em m / largura)
  --saida <pasta>   onde gravar terreno.png e terreno.json (padrão: lugares/<slug>)
  --forcar          ignora o cache e baixa tudo de novo
  --silencioso      só erros
  --timeout <min>   tempo máximo por download (padrão 10 min)
  --ajuda, -h       esta ajuda

Entrada: lugares/<slug>/lugar.json. Cache: lugares/<slug>/cache/ (gitignored).`;

export function parseArgs(argv) {
  const o = { _: [], forcar: false, silencioso: false, soGmrt: false, semMascara: false, ajuda: false };
  const pegaValor = (i, nome) => {
    const v = argv[i + 1];
    if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`opção ${nome} precisa de um valor`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--largura': o.largura = Number(pegaValor(i, a)); i++; break;
      case '--so-gmrt': o.soGmrt = true; break;
      case '--sem-mascara': o.semMascara = true; break;
      case '--mresolution': o.mresolution = Number(pegaValor(i, a)); i++; break;
      case '--saida': o.saida = pegaValor(i, a); i++; break;
      case '--forcar': o.forcar = true; break;
      case '--silencioso': o.silencioso = true; break;
      case '--timeout': o.timeoutMin = Number(pegaValor(i, a)); i++; break;
      case '--bbox': o.bbox = pegaValor(i, a); i++; break;
      case '--slug': o.slug = pegaValor(i, a); i++; break;
      case '--nome': o.nome = pegaValor(i, a); i++; break;
      case '--ajuda': case '-h': case '--help': o.ajuda = true; break;
      default:
        if (a.startsWith('-')) throw new Error(`opção desconhecida: ${a} (veja --ajuda)`);
        o._.push(a);
    }
  }
  if (o.largura !== undefined && (!Number.isInteger(o.largura) || o.largura < 2)) throw new Error(`--largura precisa ser inteiro >= 2 (veio ${o.largura})`);
  if (o.mresolution !== undefined && (!Number.isFinite(o.mresolution) || o.mresolution < 1)) throw new Error(`--mresolution precisa ser número >= 1 (veio ${o.mresolution})`);
  if (o.timeoutMin !== undefined && (!Number.isFinite(o.timeoutMin) || o.timeoutMin <= 0)) throw new Error(`--timeout em minutos, > 0 (veio ${o.timeoutMin})`);
  return o;
}

export function parseBboxTexto(texto) {
  const partes = String(texto).split(',').map((s) => Number(s.trim()));
  if (partes.length !== 4 || partes.some((v) => !Number.isFinite(v))) throw new Error(`--bbox precisa de 4 números N,S,O,L em graus (veio "${texto}")`);
  const [norte, sul, oeste, leste] = partes;
  return validarBbox({ norte, sul, oeste, leste });
}

export function lugarPadrao({ slug, nome, bbox }) {
  return {
    slug,
    nome: nome || slug,
    bbox,
    exagero_vertical: 15,
    largura_max_nos: 2048,
    terra: 'copernicus',
    mar: 'gmrt',
    mascara: true,
    nivel_minimo_m: -5500,
    regua: null,
    clipe_referencia: '',
    frase_de_vida: '',
  };
}

function validarSlug(slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`slug inválido: "${slug}" (use só letras minúsculas, números e hífen, ex.: 002-vitoria-trindade)`);
  return slug;
}

// Onde ficam os lugares: a pasta atual se tiver lugares/, senão a raiz do pacote.
export function raizDosLugares(cwd = process.cwd()) {
  if (fs.existsSync(path.join(cwd, 'lugares'))) return cwd;
  return RAIZ_PACOTE;
}

export function lerLugar(raiz, slug) {
  validarSlug(slug);
  const caminho = path.join(raiz, 'lugares', slug, 'lugar.json');
  if (!fs.existsSync(caminho)) {
    throw new Error(`lugar não encontrado: ${path.relative(process.cwd(), caminho) || caminho}\n  crie com: npx brasil-sem-mar --bbox N,S,O,L --slug ${slug} --nome "Nome"`);
  }
  let lugar;
  try { lugar = JSON.parse(fs.readFileSync(caminho, 'utf8')); } catch (e) { throw new Error(`lugar.json inválido em ${caminho}: ${e.message}`); }
  if (lugar.slug && lugar.slug !== slug) throw new Error(`lugar.json diz slug "${lugar.slug}", mas a pasta é "${slug}"`);
  validarBbox(lugar.bbox);
  if (lugar.terra && !['copernicus', 'gmrt'].includes(lugar.terra)) throw new Error(`terra desconhecida em lugar.json: "${lugar.terra}" (copernicus ou gmrt)`);
  if (lugar.mar && lugar.mar !== 'gmrt') throw new Error(`mar desconhecido em lugar.json: "${lugar.mar}" (a v1 só tem gmrt)`);
  const largura = lugar.largura_max_nos ?? 2048;
  if (!Number.isInteger(largura) || largura < 2) throw new Error(`largura_max_nos inválido em lugar.json: ${largura}`);
  return { ...lugar, slug, largura_max_nos: largura, caminho, pasta: path.dirname(caminho) };
}

export async function gerarTerreno({ lugar, opcoes = {}, log = () => {} }) {
  const t0 = performance.now();
  const bbox = lugar.bbox;
  const largura = opcoes.largura ?? lugar.largura_max_nos;
  const terra = opcoes.soGmrt ? 'gmrt' : (lugar.terra || 'copernicus');
  const mascara = opcoes.semMascara ? false : lugar.mascara !== false;
  const cacheDir = path.join(lugar.pasta, 'cache');
  const saidaDir = opcoes.saida ? path.resolve(opcoes.saida) : lugar.pasta;
  const timeoutMs = opcoes.timeoutMin ? opcoes.timeoutMin * 60 * 1000 : TIMEOUT_PADRAO_MS;
  const forcar = !!opcoes.forcar;
  fs.mkdirSync(cacheDir, { recursive: true });

  const grade = calcularGrade(bbox, largura);
  log(`${lugar.slug} (${lugar.nome}): bbox N ${bbox.norte} S ${bbox.sul} O ${bbox.oeste} L ${bbox.leste}`);
  log(`grade de saída: ${grade.largura}x${grade.altura} nós, ${fmtNum(grade.km.largura)} x ${fmtNum(grade.km.altura)} km, ${Math.round(grade.metros_por_no.x)} x ${Math.round(grade.metros_por_no.y)} m/nó; terra = ${terra}, mar = gmrt, máscara = ${mascara ? 'sim' : 'não'}`);

  // 1) GMRT topo (sempre: mar e, no modo gmrt, também a terra)
  const mresolution = opcoes.mresolution ?? lugar.mresolution ?? mresolutionPadrao(bbox, grade.largura);
  log(`GMRT: pedindo layer=topo com mresolution=${mresolution} m/nó`);
  const gm = await baixarGmrt({ bbox, layer: 'topo', mresolution, cacheDir, forcar, timeoutMs, log });
  const gmrt = await lerGeoTiffLocal(gm.caminho);
  const gmRes = metrosPorNoDoRaster(gmrt);
  log(`GMRT: ${gmrt.largura}x${gmrt.altura} nós, ${Math.round(gmRes.x)} x ${Math.round(gmRes.y)} m/nó devolvidos, ${fmtBytes(gm.bytes)}${gm.cache ? ' (cache)' : ` em ${fmtSegundos(gm.ms || 0)}`}, ${gmrt.nan} NaN`);
  if (Math.round(gmRes.x) > mresolution * 1.5) log(`GMRT: aviso, o GridServer devolveu mais grosseiro que o pedido (${Math.round(gmRes.x)} > ${mresolution} m/nó); limite do servidor por tamanho de arquivo`);
  const fontes = [{
    id: 'gmrt', url: gm.url, camada: 'topo', mresolution_pedido: mresolution,
    largura: gmrt.largura, altura: gmrt.altura, metros_por_no_devolvido: { x: arredondar(gmRes.x, 1), y: arredondar(gmRes.y, 1) },
    bbox_devolvido: { norte: gmrt.bbox.norte, sul: gmrt.bbox.sul, oeste: gmrt.bbox.oeste, leste: gmrt.bbox.leste }, nan: gmrt.nan,
    licenca: GMRT_LICENCA, atribuicao: GMRT_ATRIBUICAO, obtido_em: gm.obtido_em, bytes: gm.bytes, sha256: gm.sha256, cache: gm.cache,
  }];

  // 2) GMRT topo-mask (fração medida de verdade)
  let mascaraRaster = null;
  if (mascara) {
    log('GMRT: pedindo layer=topo-mask (medido x interpolado)');
    const mk = await baixarGmrt({ bbox, layer: 'topo-mask', mresolution, cacheDir, forcar, timeoutMs, log });
    mascaraRaster = await lerGeoTiffLocal(mk.caminho);
    log(`GMRT máscara: ${mascaraRaster.largura}x${mascaraRaster.altura} nós, ${fmtBytes(mk.bytes)}${mk.cache ? ' (cache)' : ` em ${fmtSegundos(mk.ms || 0)}`}, ${mascaraRaster.nan} nós interpolados no raster`);
    fontes.push({
      id: 'gmrt-topo-mask', url: mk.url, camada: 'topo-mask', mresolution_pedido: mresolution, largura: mascaraRaster.largura, altura: mascaraRaster.altura,
      licenca: GMRT_LICENCA, atribuicao: GMRT_ATRIBUICAO, obtido_em: mk.obtido_em, bytes: mk.bytes, sha256: mk.sha256, cache: mk.cache,
    });
  }

  // 3) Copernicus na terra
  let cop = null;
  if (terra === 'copernicus') {
    const alvo = Math.min(grade.graus_por_no.lon, grade.graus_por_no.lat);
    cop = await coletarCopernicus({ bbox, alvoGrausPorNo: alvo, cacheDir, forcar, paralelo: 3, tentativas: 2, log });
    log(`Copernicus: ${cop.resumo.tiles_lidos} tiles lidos (${cop.resumo.tiles_cache} do cache), ${fmtBytes(cop.resumo.bytes_baixados)} baixados em ${cop.resumo.pedidos} pedidos, ${fmtSegundos(cop.resumo.ms)}`);
    fontes.push(cop.fonte);
  }

  // 4) Reamostragem bilinear para a grade de saída
  const tR = performance.now();
  const gmrtGrade = reamostrarParaGrade(gmrt, bbox, grade, 'bilinear');
  let copGrade = null;
  let existe = null;
  if (cop) {
    const n = grade.largura * grade.altura;
    copGrade = new Float32Array(n);
    existe = new Uint8Array(n);
    for (let j = 0; j < grade.altura; j++) {
      const lat = latDoNo(bbox, grade, j);
      for (let i = 0; i < grade.largura; i++) {
        const lon = lonDoNo(bbox, grade, i);
        const k = j * grade.largura + i;
        if (cop.mosaico.existe(lon, lat)) { existe[k] = 1; copGrade[k] = cop.mosaico.bilinear(lon, lat); } else { copGrade[k] = NaN; }
      }
    }
  }

  // 5) Fusão e preenchimento
  const fusao = fundirGrade(copGrade, gmrtGrade, existe);
  const alturas = fusao.alturas;
  const nodataPreenchidos = preencherNaN(alturas, grade.largura, grade.altura);
  const { min, max } = minMax(alturas);
  log(`fusão: ${fmtSegundos(performance.now() - tR)}; ${fusao.nos_copernicus} nós de terra do Copernicus, ${fusao.copernicus_nodata} nodata do Copernicus cobertos pelo GMRT, ${nodataPreenchidos} buracos preenchidos pelo vizinho; elevação ${fmtNum(min)} a ${fmtNum(max)} m`);

  // 6) Máscara: fração dos nós de mar (h <= 0) com medição direta
  let mascaraJson = { pct_medido: null, nos: 0 };
  if (mascaraRaster) {
    const mk = reamostrarParaGrade(mascaraRaster, bbox, grade, 'vizinho');
    let medidos = 0;
    let mar = 0;
    for (let k = 0; k < alturas.length; k++) {
      if (alturas[k] <= 0) { mar++; if (mk[k] === mk[k]) medidos++; }
    }
    mascaraJson = { pct_medido: mar ? arredondar(100 * medidos / mar, 1) : 0, nos: medidos, nos_mar: mar, base: 'nós com elevação <= 0 m' };
    log(`máscara: ${medidos} de ${mar} nós de mar medidos de verdade (${fmtNum(mascaraJson.pct_medido)} %)`);
  }

  // 7) Gravação
  const caminhoPng = path.join(saidaDir, 'terreno.png');
  const caminhoJson = path.join(saidaDir, 'terreno.json');
  const tP = performance.now();
  const bytesPng = escreverTerrenoPng(caminhoPng, alturas, grade.largura, grade.altura);
  const terreno = {
    slug: lugar.slug,
    largura: grade.largura,
    altura: grade.altura,
    bbox: { norte: bbox.norte, sul: bbox.sul, oeste: bbox.oeste, leste: bbox.leste },
    graus_por_no: { lon: grade.graus_por_no.lon, lat: grade.graus_por_no.lat },
    metros_por_no: { x: arredondar(grade.metros_por_no.x, 1), y: arredondar(grade.metros_por_no.y, 1) },
    km: { largura: arredondar(grade.km.largura, 1), altura: arredondar(grade.km.altura, 1) },
    elev_min_m: arredondar(min, 1),
    elev_max_m: arredondar(max, 1),
    fontes,
    mascara: mascaraJson,
    nodata_preenchidos: nodataPreenchidos,
    fixture: false,
    terra,
    mar: 'gmrt',
    convencao: 'nó = centro de célula; linha 0 = norte, coluna 0 = oeste; Terrain-RGB h = -10000 + (R*65536 + G*256 + B) * 0,1',
    png: { bytes: bytesPng },
    gerado_por: `brasil-sem-mar ${PACOTE.version}`,
    gerado_em: agoraIso(),
  };
  escreverJson(caminhoJson, terreno);
  log(`gravado: ${path.relative(process.cwd(), caminhoPng)} (${fmtBytes(bytesPng)}, ${fmtSegundos(performance.now() - tP)}) e terreno.json`);
  log(`pronto em ${fmtSegundos(performance.now() - t0)}`);
  return { terreno, caminhoPng, caminhoJson, ms: performance.now() - t0 };
}

export async function main(argv = process.argv.slice(2)) {
  const opcoes = parseArgs(argv);
  if (opcoes.ajuda || (!opcoes._.length && !opcoes.bbox)) {
    console.log(AJUDA);
    return opcoes.ajuda ? 0 : 2;
  }
  const log = opcoes.silencioso ? () => {} : (m) => console.log(m);
  const raiz = raizDosLugares();
  let slug = opcoes._[0];
  if (opcoes.bbox) {
    if (!opcoes.slug) throw new Error('--bbox precisa de --slug <slug> (e, de preferência, --nome "...")');
    slug = validarSlug(opcoes.slug);
    const bbox = parseBboxTexto(opcoes.bbox);
    const pasta = path.join(raiz, 'lugares', slug);
    const caminho = path.join(pasta, 'lugar.json');
    if (fs.existsSync(caminho)) throw new Error(`${path.relative(process.cwd(), caminho)} já existe; rode sem --bbox para usar o que está lá`);
    fs.mkdirSync(pasta, { recursive: true });
    escreverJson(caminho, lugarPadrao({ slug, nome: opcoes.nome, bbox }));
    log(`criado ${path.relative(process.cwd(), caminho)} com os defaults (exagero 15, 2048 nós, copernicus + gmrt, máscara)`);
  } else if (opcoes._.length > 1) {
    throw new Error(`um lugar por vez (veio ${opcoes._.join(', ')})`);
  }
  const lugar = lerLugar(raiz, slug);
  await gerarTerreno({ lugar, opcoes, log });
  return 0;
}

const ehPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (ehPrincipal) {
  main().then((codigo) => { process.exitCode = codigo; }).catch((e) => {
    console.error(`erro: ${e && e.message ? e.message : e}`);
    process.exitCode = 1;
  });
}
