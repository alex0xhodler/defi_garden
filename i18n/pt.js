'use strict';

/**
 * i18n/pt.js — Portuguese (Brazil, pt-BR) strings for the STATIC SEO pages (tokens/, chains/,
 * pools/ pages, hubs and sitemaps under /pt/). Node-only: read by the
 * generators through i18n/index.js, never shipped to a browser.
 *
 * Shape: { key: string | function } — the same keys, parameters and
 * semantics as the EN entries in translations.js / i18n/static-en-ko.js.
 * Missing keys fall back to EN per key.
 * `node scripts/i18n-key-inventory.js` is the done-check.
 *
 * Audience: retail stablecoin savers in Brazil. Plain, calm, honest tone
 * ("honest numbers beat exciting numbers"). Register: "você".
 *
 * GLOSSARY (applied consistently; the native-review sheet in
 * docs/i18n-review-pt-es.md repeats it)
 *   yield ................ rendimento   (never "rentabilidade"; titles lead with it)
 *   rate (APY, rates) .... taxa
 *   fees (trading fees) .. tarifas      ("taxa" is reserved for rates)
 *   lending .............. empréstimo
 *   liquidity ............ liquidez     (exit liquidity = liquidez de saída)
 *   chain ................ rede / redes
 *   pool, stablecoin, staking, vault, token, wallet, smart contract,
 *   exploit, depeg ....... kept as the loanwords BR users type
 *   TVL floor ............ "TVL mínimo de $100K" (the floor is always a param)
 *   honest ............... honesto
 *   anomalous ............ anômalo
 *   forecast ............. previsão
 *   capital stickiness ... permanência do capital
 *   impermanent loss ..... perda impermanente
 *   live (data / rates) .. ao vivo; live (pool) -> ativo
 *   education, not advice  educação, não aconselhamento financeiro
 *
 * Rules for translators
 *  - Parameters arrive already formatted (en-US numbers, "$1.2M", "12.34%").
 *    Print each one exactly as received: never reformat, round or localise it,
 *    and never use toLocaleString / Intl in here. Number formatting stays en-US
 *    (dot decimals) on purpose — CLAUDE.md hard rule.
 *  - Keep every number that is written into a string (35%, 25%, 15%, "5" ...).
 *  - Entries that contain HTML or Markdown syntax keep it intact.
 *  - Brand/ticker/technical terms (DeFi Garden, DefiLlama, DeFi Score, APY,
 *    TVL, USDC ...) stay as they are.
 *  - 'landing.*' and 'planner.*' keys are the nested namespaces of
 *    translations.js, flattened.
 */

// Counts arrive as en-US strings ("1", "1,573"); only a literal 1 is singular.
const one = (n) => String(n) === '1';
const poolWord = (n) => (one(n) ? 'pool' : 'pools');
const livePoolWord = (n) => (one(n) ? 'pool ativo' : 'pools ativos');
const chainWord = (n) => (one(n) ? 'rede' : 'redes');
const tokenWord = (n) => (one(n) ? 'token' : 'tokens');
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

module.exports = {
  "aiAgents": "Agentes de IA e MCP",
  "apiLink": "API",
  "apyMean30d": "APY médio de 30d",
  "browseChains": "Explorar redes",
  "browseTokens": "Explorar tokens",
  "defillamaApi": "DefiLlama API",
  "footerSignOff": "Educação, não aconselhamento.",
  "landing.navAgents": "Agentes de IA e MCP",
  "landing.navApi": "API",
  "landing.navClose": "Fechar menu",
  "landing.navMenu": "Abrir menu",
  "landing.navMethodology": "Metodologia",
  "landing.navMobile": "Navegação no celular",
  "landing.navPlanner": "Planejador de poupança",
  "landing.navPrimary": "Navegação principal",
  "landing.navSearch": "Buscar rendimentos",
  "landing.themeDark": "Mudar para o modo escuro",
  "landing.themeLight": "Mudar para o modo claro",
  "methodologyLink": "Metodologia",
  "planner.ladderClaude": "Claude Pro",
  "poweredBy": "Com dados da",
  "pspAccessHeading": "Quem pode acessar",
  "pspAccessOpen": "Sem permissão: qualquer pessoa com uma wallet",
  "pspAccessOpenNote": "Este projeto não está na lista do DeFi Garden de projetos restritos (acesso só com KYC ou só para investidores credenciados). Os termos do próprio protocolo e restrições regionais ainda podem se aplicar.",
  "pspAccessRestricted": "Com permissão / somente KYC",
  "pspAccessRestrictedNote": "Este projeto está na lista do DeFi Garden de projetos restritos (acesso com KYC, para investidores credenciados ou compradores qualificados). A maioria dos usuários individuais não consegue depositar diretamente.",
  "pspAccuracyLink": "Veja como foram as previsões passadas",
  "pspBaseApy": "APY base",
  "pspBreadcrumbPools": "Pools",
  "pspChartCaption": "Linha contínua: APY diário da DefiLlama. Área sombreada: faixa de p10 a p90 do modelo, desenhada como um leque reto da taxa de hoje até o fim do horizonte de previsão (não são quantis diários). Linha tracejada: trajetória mediana do modelo.",
  "pspChartHeading": "Histórico e previsão do APY",
  "pspChartHorizon": (days) => `+${days}d`,
  "pspChartTitle": (name, sym, chain, histDays, horizon, p10, p90) =>
      `${name} ${sym} em ${chain}: APY nos últimos ${histDays} dias e, depois, uma faixa de previsão de ${horizon} dias, de ${p10} a ${p90}`,
  "pspChartToday": "hoje",
  "pspCrashRisk": (level) => ({ LOW: "Risco baixo de queda brusca", MEDIUM: "Risco médio de queda brusca", HIGH: "Risco alto de queda brusca" }[level] || `Risco de queda brusca: ${level}`),
  "pspCta": "Abrir no Decision Terminal →",
  "pspDataAsOf": (date) => `Data dos dados: ${date}. Fonte: dados de pools da DefiLlama; pontuação e previsão calculadas pelo DeFi Garden.`,
  "pspDatasetDescription": (name, sym, chain) => `Dados de rendimento ao vivo da DefiLlama para ${name} ${sym} em ${chain}, com o detalhamento do DeFi Score do DeFi Garden e uma faixa de previsão do modelo para 14 dias.`,
  "pspDatasetName": (name, sym, chain) => `${name} ${sym} em ${chain}: APY, DeFi Score e previsão de 14 dias`,
  "pspDescription": (name, sym, chain, apy, mean30, tvl, score, p10, p90, date) =>
      `${name} ${sym} em ${chain}: APY ${apy} ao vivo, média de 30d ${mean30}, TVL ${tvl}, DeFi Score ${score}/100, previsão do modelo a 14 dias ${p10} a ${p90}. Data: ${date}.`,
  "pspExposureMulti": "Exposição: vários ativos.",
  "pspExposureSingle": "Exposição: um único ativo.",
  "pspForecastDisclaimer": (totalRuns, noBetter, evaluated) => {
      if (!totalRuns || Number(totalRuns) <= 0) return "Modelo experimental: ainda não foi demonstrado que ele seja mais preciso do que supor que a taxa de hoje se mantém. A avaliação passada está documentada publicamente.";
      let s = `Modelo experimental: em ${totalRuns} execuções de teste com desfecho já conhecido`;
      if (noBetter != null && evaluated != null) s += `, em ${noBetter} de ${evaluated} supor que a taxa de hoje se mantém foi pelo menos tão preciso quanto o modelo`;
      return s + '. A avaliação passada, com várias execuções, está documentada publicamente.';
    },
  "pspForecastFlat": (cur, p50) => `Leitura: o modelo espera que a taxa fique mais ou menos estável, de ${cur} hoje para cerca de ${p50}.`,
  "pspForecastHeading": "Faixa de previsão de 14 dias (experimental)",
  "pspForecastHigher": (cur, p50) => `Leitura: o modelo espera que a taxa tenda a subir, de ${cur} hoje para cerca de ${p50}.`,
  "pspForecastLead": (days, p50, p10, p90) => `Previsão do modelo para os próximos ${days} dias: mediana de ${p50}, faixa de ${p10} a ${p90} (p10 a p90).`,
  "pspForecastLower": (cur, p50) => `Leitura: o modelo espera que a taxa tenda a cair, de ${cur} hoje para cerca de ${p50}.`,
  "pspH1": (name, sym, chain) => `${name} ${sym} em ${chain}: APY, DeFi Score e previsão de 14 dias`,
  "pspHubDescription": (count) => `${count} pools DeFi grandes com APY ao vivo, detalhamento do DeFi Score e faixa de previsão de 14 dias.`,
  "pspHubHeading": "Pools DeFi avaliados",
  "pspHubIntro": "Cada página mostra a taxa ao vivo, os pilares do DeFi Score, uma faixa de previsão do modelo para 14 dias, quem pode acessar o pool e os principais riscos. Os números vêm da DefiLlama; scores e previsões são resultados de um modelo.",
  "pspHubLink": "Ver pools avaliados →",
  "pspHubSub": (count, tvlFloor) => `${count} pools com pelo menos ${tvlFloor} de TVL e 30 dias de histórico.`,
  "pspHubTitle": "Pools DeFi avaliados: APY, DeFi Score e previsão | DeFi Garden",
  "pspIlNo": "A DefiLlama não indica risco de perda impermanente para este pool.",
  "pspIlYes": "A DefiLlama indica risco de perda impermanente neste pool.",
  "pspLegendBand": "Previsão p10 a p90",
  "pspLegendHistory": "APY observado",
  "pspLegendMedian": "Mediana da previsão",
  "pspLiveApy": "APY ao vivo",
  "pspMean30": "APY médio de 30 dias",
  "pspMethodologyLink": "Detalhes do score e da previsão (servidor MCP)",
  "pspNotAdvice": "Educação, não aconselhamento financeiro. O DeFi envolve risco de smart contract, de mercado e regulatório, e você pode perder dinheiro.",
  "pspP10": "Cenário baixo (p10)",
  "pspP50": "Mediana (p50)",
  "pspP90": "Cenário alto (p90)",
  "pspPillarLiquidity": "Liquidez de saída",
  "pspPillarStability": "Estabilidade do rendimento",
  "pspPillarStickiness": "Permanência do capital",
  "pspPillarSustainability": "Sustentabilidade",
  "pspPoolMeta": (meta) => `Variante do pool: ${meta}.`,
  "pspRewardApy": "APY de recompensa",
  "pspRiskContract": "Risco de smart contract: um bug ou exploit no protocolo ou em suas dependências pode causar a perda dos fundos depositados.",
  "pspRiskCrash": (label) => `Alerta do modelo: ${label} para os próximos 14 dias.`,
  "pspRiskIl": "Perda impermanente: o valor deste pool pode ficar abaixo do que você teria apenas mantendo os ativos, se os preços deles se afastarem.",
  "pspRiskNone": "Nenhum alerta específico deste pool nos dados, além dos riscos permanentes acima.",
  "pspRiskReward": (pct) => `Queda das recompensas: ${pct} do APY divulgado é pago em tokens emitidos, e isso pode diminuir ou acabar.`,
  "pspRiskTvlDown": (pct) => `Depósitos diminuindo: o TVL variou ${pct} no período acompanhado, ou seja, há capital saindo.`,
  "pspRiskTvlUp": (pct) => `Depósitos crescendo: o TVL variou ${pct} no período acompanhado. É um sinal de demanda, não uma garantia, e um TVL em alta pode diluir as recompensas.`,
  "pspRiskVol": (stdev, apy) => `Taxa volátil: o desvio padrão de 30 dias é ${stdev}, contra uma taxa atual de ${apy}.`,
  "pspRisksHeading": "Riscos",
  "pspScoreHeading": "DeFi Score: qualidade do rendimento",
  "pspScoreNote": "A nota avalia a qualidade do rendimento em quatro pilares (estabilidade, sustentabilidade das tarifas, permanência dos depositantes, liquidez de saída). Observação: a permanência do capital usa estimativas-padrão quando a distribuição de wallets on-chain não está indexada.",
  "pspScoreValue": (score) => `Nota ${score} / 100`,
  "pspSecondaryChain": (chain) => `Mais pools em ${chain} →`,
  "pspSecondaryProtocol": (name) => `Ir para ${name} →`,
  "pspSimilarHeading": "Pools semelhantes",
  "pspSimilarItem": (name, sym, chain, tvl) => `${name} ${sym} em ${chain} (${tvl} de TVL)`,
  "pspSourceBase": (apy, pct) => `${apy} (${pct} do total) é rendimento base: tarifas de negociação ou juros pagos pelos usuários do protocolo.`,
  "pspSourceHeading": "O que gera este rendimento",
  "pspSourceNone": "A DefiLlama não informa APY base nem APY de recompensa para este pool no momento.",
  "pspSourceReward": (apy, pct) => `${apy} (${pct} do total) vem de tokens de recompensa que o protocolo emite para atrair depósitos. As emissões podem ser reduzidas ou acabar.`,
  "pspSummaryHeading": "Resumo",
  "pspTitleBare": (name, sym, chain) => `APY de ${name} ${sym} em ${chain}`,
  "pspTitleDated": (name, sym, chain, date) => `APY de ${name} ${sym} em ${chain} (${date}) | DeFi Garden`,
  "pspTitleUndated": (name, sym, chain) => `APY de ${name} ${sym} em ${chain} | DeFi Garden`,
  "pspTvl": "TVL",
  "pspWithdrawGeneric": "Períodos de bloqueio, carência e filas de saque são definidos pelos contratos do protocolo e não constam no feed da DefiLlama. Consulte a documentação do protocolo antes de depositar.",
  "pspWithdrawHeading": "Notas sobre saques",
  "pspWithdrawLiquidity": (tvl, score, max) => `Pilar de liquidez de saída: ${score} / ${max}, com ${tvl} no pool.`,
  "pspWithdrawTvlForecast": (pred, delta) => `O modelo projeta um TVL de ${pred} em 14 dias (${delta}).`,
  "tcpAllChainsHeading": "Todas as redes",
  "tcpAnswer": (label, apyStr, project, chain, count, floorStr) =>
      `O maior rendimento honesto de ${label} agora é ${apyStr} em ${project} (${chain}), entre ${count} ${poolWord(count)} acima do TVL mínimo de ${floorStr}. As taxas são ao vivo da DefiLlama e excluem pools anômalos (APY >1000%).`,
  "tcpAvailableOnHeading": "Disponível em",
  "tcpAzBackCta": "← Todos os tokens",
  "tcpAzDescription": (letter, count) => `${count} tokens DeFi que começam com "${letter}", com dados de rendimento ao vivo e filtrados por confiança no DeFi Garden.`,
  "tcpAzHeading": (letter) => `Tokens que começam com ${letter}`,
  "tcpAzSub": (count) => `${count} tokens`,
  "tcpAzTitle": (letter) => `Tokens que começam com ${letter} | DeFi Garden 🌱`,
  "tcpBreadcrumbChains": "Redes",
  "tcpBreadcrumbHome": "Início",
  "tcpBreadcrumbTokens": "Tokens",
  "tcpBrowseAZHeading": "Explorar todos os tokens de A a Z",
  "tcpByCategoryHeading": "Por categoria",
  "tcpChainCta": (chain) => `Ver pools ativos em ${chain} →`,
  "tcpChainDescription": (chain, count, apy, tokenCount, floorStr) =>
      `${count} ${livePoolWord(count)} em ${chain} acima do TVL mínimo de ${floorStr}, com até ${apy} APY, em ${tokenCount} ${tokenWord(tokenCount)}. Rendimentos honestos com dados da DefiLlama, sem taxas anômalas.`,
  "tcpChainHeading": (chain) => `Rendimentos DeFi em ${chain}`,
  "tcpChainHubDescription": (count) => `${count} redes com dados de rendimento DeFi ao vivo e filtrados por confiança, ordenadas por TVL. Rendimentos honestos da DefiLlama, sem taxas anômalas.`,
  "tcpChainHubHeading": "Rendimentos de todas as redes",
  "tcpChainHubIntro": (floorStr) => `Todas as páginas de redes do DeFi Garden em um só lugar: pools ao vivo ordenados por TVL, filtrados por um TVL mínimo de ${floorStr} e por filtros de anomalias.`,
  "tcpChainHubSub": (count) => `${count} redes com dados de rendimento ao vivo e filtrados por confiança`,
  "tcpChainHubTitle": "Rendimentos DeFi ao vivo de todas as redes | DeFi Garden 🌱",
  "tcpChainIntro": (chain, project, symbol, apy, tvl, count, tokenCount, totalTvl, floorStr) =>
      `O maior pool ativo em ${chain} é ${project} (${symbol}), com ${apy} (${tvl} de TVL). ${count} ${poolWord(count)} em ${tokenCount} ${tokenWord(tokenCount)} ${one(count) ? 'atinge' : 'atingem'} o TVL mínimo de ${floorStr} desta página, somando ${totalTvl}.`,
  "tcpChainTitle": (chain, dateStr) => dateStr
      ? `Rendimento em ${chain} (${dateStr}) — pools comparados | DeFi Garden`
      : `Rendimento DeFi em ${chain} — pools por TVL | DeFi Garden`,
  "tcpChainsAriaLabel": "Redes",
  "tcpColApy": "APY",
  "tcpColChain": "Rede",
  "tcpColProtocol": "Protocolo",
  "tcpColToken": "Token",
  "tcpColTvl": "TVL",
  "tcpDatasetChainDescription": (chain, floorStr) => `Dados de rendimento ao vivo da DefiLlama para pools em ${chain} no DeFi Garden, filtrados por um TVL mínimo de ${floorStr} e pela exclusão de APY anômalo.`,
  "tcpDatasetChainName": (chain) => `Dataset de rendimentos DeFi em ${chain}`,
  "tcpDatasetTokenDescription": (sym, floorStr) => `Dados de rendimento ao vivo da DefiLlama para pools de ${sym} no DeFi Garden, filtrados por um TVL mínimo de ${floorStr} e pela exclusão de APY anômalo.`,
  "tcpDatasetTokenName": (sym) => `Dataset de rendimentos DeFi de ${sym}`,
  "tcpDepthColMix": "Composição do rendimento",
  "tcpDepthHeading": "Como esta taxa se comportou",
  "tcpDepthIlExposure": (ilCount, poolCount) =>
      `${ilCount} de ${poolCount} ${poolWord(poolCount)} ${one(ilCount) ? 'tem' : 'têm'} risco de perda impermanente, ou seja, uma posição com dois ativos pode perder valor em comparação a simplesmente manter os ativos, mesmo enquanto rende.`,
  "tcpDepthMean": (meanCount, poolCount, medianMeanStr) =>
      `${meanCount} de ${poolCount} ${poolWord(poolCount)} ${one(meanCount) ? 'tem' : 'têm'} uma média de 30 dias confiável registrada, com mediana de ${medianMeanStr} — uma boa referência para comparar com o número de hoje e ver se a taxa é estável ou se hoje é só um bom dia.`,
  "tcpDepthMixAllBase": (poolCount) =>
      one(poolCount)
        ? 'O único pool paga uma taxa base simples agora, sem APY de incentivo ou de recompensa misturado.'
        : `Todos os ${poolCount} pools pagam uma taxa base simples agora, sem APY de incentivo ou de recompensa misturado.`,
  "tcpDepthMixBaseCell": "Taxa base",
  "tcpDepthMixIncentiveCell": (shareStr) => `${shareStr} de incentivos`,
  "tcpDepthMixIncentives": (rewardCount, poolCount) =>
      `${rewardCount} de ${poolCount} ${poolWord(poolCount)} ${one(rewardCount) ? 'combina' : 'combinam'} APY de incentivo ou de recompensa além da taxa base. O rendimento de incentivo diminui com o tempo, à medida que os programas de recompensa se esgotam; a taxa base é o número mais durável.`,
  "tcpDepthNote": (floorStr) =>
      `A média de 30 dias vem direto da DefiLlama e só aparece quando passa pelo mesmo filtro de sanidade de todos os outros números desta página. Um traço significa que ela não passou nesse critério, não que está sendo escondida. Todo pool aqui já tem um TVL mínimo de ${floorStr}. As taxas mudam todo dia, então trate isto como um retrato do momento, não como uma promessa.`,
  "tcpDepthSpread": (symbol, poolCount, lowApyStr, highApyStr, chainCount) =>
      `${symbol} aparece em ${poolCount} ${poolWord(poolCount)} aqui, com taxas de ${lowApyStr} a ${highApyStr} APY em ${chainCount} ${chainWord(chainCount)} — a taxa depende do protocolo e da rede que você escolher, não só do token.`,
  "tcpFaqA1": (apyStr, project, chain) => `${apyStr} de APY em ${project} (${chain}), com base em dados ao vivo da DefiLlama.`,
  "tcpFaqA2": (count, tvlStr, floorStr) => `${count} ${livePoolWord(count)} ${one(count) ? 'atinge' : 'atingem'} o TVL mínimo de ${floorStr} desta página, ${tvlStr} no total.`,
  "tcpFaqA3": (floorStr) => `Os pools listados nesta página atingem um TVL mínimo de ${floorStr} e excluem taxas anômalas (APY >1000%). Esse é o critério de listagem desta página, não uma garantia de segurança. Isto é educação, não aconselhamento financeiro; o DeFi envolve risco de smart contract e de mercado, seja qual for a taxa exibida.`,
  "tcpFaqHeading": "Perguntas frequentes",
  "tcpFaqQ1": (label) => `Qual é o maior rendimento de ${label} hoje?`,
  "tcpFaqQ2": (label) => `Quantos pools de ${label} atingem o TVL mínimo?`,
  "tcpFaqQ3": "Essas taxas são seguras?",
  "tcpFooterTagline": "planeje sua poupança em DeFi por objetivo.",
  "tcpHubBackCta": "← Voltar ao DeFi Garden",
  "tcpItemListName": (project, chain) => `${project} em ${chain}`,
  "tcpLanguageLabel": "Idioma",
  "tcpLastUpdated": (date) => `Última atualização: ${date}`,
  "tcpMonthYear": (monthShortEn, month, year) => `${MONTHS[Number(month) - 1] || monthShortEn} ${year}`,
  "tcpPoolCategoriesAriaLabel": "Categorias de pools",
  "tcpPoolTypeLabel": (type) => ({ 'Lending': 'Empréstimos', 'Yield Derivatives': 'Derivativos de rendimento', 'Yield Farming': 'Yield farming', 'LP/DEX': 'LP/DEX', 'Staking': 'Staking', 'RWA': 'RWA' }[type] || type),
  "tcpRateStabilityCandidate": (project, chain, apyStr, tvlStr, href) =>
      `${project} (${chain}), APY de ${apyStr}, TVL de ${tvlStr}, ${href}`,
  "tcpRateStabilityColRank": "Posição",
  "tcpRateStabilityFaqQ": (symbol) => `Quais pools de ${symbol} têm o histórico de APY mais estável?`,
  "tcpRateStabilityHeading": "Estabilidade da taxa pelo histórico de APY",
  "tcpRateStabilityInsufficientAnswer": (symbol) =>
      `Não há histórico de APY qualificado suficiente para classificar os pools de ${symbol}. Esta visão cobre apenas o histórico de APY e não mede risco de protocolo, de exploit, de depeg, de liquidez, de governança nem de perda de capital.`,
  "tcpRateStabilityRankedAnswer": (symbol, candidates) =>
      `Com base apenas no histórico de APY, os candidatos de ${symbol} com menor variabilidade são ${candidates}. Esta comparação não mede risco de protocolo, de exploit, de depeg, de liquidez, de governança nem de perda de capital.`,
  "tcpRelatedChainsHeading": "Redes relacionadas",
  "tcpRelatedTokensHeading": "Tokens relacionados",
  "tcpRestrictedAccessTitle": "Acesso restrito (KYC/investidores credenciados)",
  "tcpSubLine": (count, floorStr) => `${count} ${livePoolWord(count)} acima do TVL mínimo de ${floorStr} · ordenados por TVL`,
  "tcpTokenCta": (sym) => `Ver pools ativos de ${sym} →`,
  "tcpTokenDescription": (sym, count, apy, chainCount, floorStr) =>
      `${count} ${livePoolWord(count)} de ${sym} acima do TVL mínimo de ${floorStr}, com até ${apy} APY, em ${chainCount} ${chainWord(chainCount)}. Rendimentos honestos com dados da DefiLlama, sem taxas anômalas.`,
  "tcpTokenHeading": (sym) => `Rendimentos DeFi de ${sym}`,
  "tcpTokenHubDescription": (count) => `${count} tokens com dados de rendimento DeFi ao vivo e filtrados por confiança: os principais pools por TVL, com navegação por nome. Rendimentos honestos da DefiLlama, sem taxas anômalas.`,
  "tcpTokenHubHeading": "Rendimentos de todos os tokens",
  "tcpTokenHubIntro": (floorStr) => `Todas as páginas de tokens do DeFi Garden em um só lugar: pools ao vivo ordenados por TVL, filtrados por um TVL mínimo de ${floorStr} e por filtros de anomalias. Comece pelos principais tokens por TVL ou vá direto para uma letra.`,
  "tcpTokenHubSub": (count) => `${count} tokens com dados de rendimento ao vivo e filtrados por confiança`,
  "tcpTokenHubTitle": "Rendimentos ao vivo de todos os tokens DeFi | DeFi Garden 🌱",
  "tcpTokenIntro": (sym, project, chain, apy, tvl, count, chainCount, totalTvl, floorStr) =>
      `O maior pool ativo de ${sym} é ${project} em ${chain}, com ${apy} (${tvl} de TVL). ${count} ${poolWord(count)} de ${sym} em ${chainCount} ${chainWord(chainCount)} ${one(count) ? 'atinge' : 'atingem'} o TVL mínimo de ${floorStr} desta página, somando ${totalTvl}.`,
  "tcpTokenTitle": (sym) => `Rendimento DeFi de ${sym} — pools por TVL | DeFi Garden 🌱`,
  "tcpTopScoredHeading": (subject) => `Principais rendimentos de ${subject} por DeFi Score (menor risco)`,
  "tcpTopScoredSub": "Os 5 principais pools acessíveis a investidores individuais, classificados por estabilidade quantitativa (35%), sustentabilidade das tarifas (25%), permanência do capital (25%) e profundidade de liquidez (15%). Sem vaults com permissão ou restritos a investidores credenciados.",
  "tcpTopTokensByTvlHeading": "Principais tokens por TVL",
  "tcpTopTokensOnHeading": (chain) => `Principais tokens em ${chain}`,
  "tcpTrustNote": (floorStr) => `Os rendimentos são ao vivo da DefiLlama. Os pools desta página atingem um TVL mínimo de ${floorStr} e excluem taxas anômalas — esse é o critério de listagem desta página, não uma garantia de segurança. Apenas educação, não aconselhamento financeiro.`,
  "tcpWaitlistCta": "Entrar na lista de espera →",
  "tcpWaitlistHeading": "Acesso antecipado ao cartão",
  "tcpWaitlistMicro": "Entrar é grátis • O cartão ainda não existe • Avisaremos por e-mail quando existir",
  "tcpWaitlistPitchChain": (chain) => `Um cartão que gasta o rendimento das suas posições em ${chain}, nunca o capital. Entre na lista de espera e seja o primeiro a saber quando estiver pronto.`,
  "tcpWaitlistPitchHub": "Um cartão que gasta o seu rendimento DeFi, nunca o seu capital. Entre na lista de espera e seja o primeiro a saber quando estiver pronto.",
  "tcpWaitlistPitchToken": (sym) => `Um cartão que gasta o rendimento do seu ${sym}, nunca o ${sym} em si. Entre na lista de espera e seja o primeiro a saber quando estiver pronto.`,
  "tcpYieldHeadline": (sym, apyStr, foreverAmtStr, monthly, subLabel) =>
      `Seu ${sym} parado poderia render ~${apyStr} — deixe ${foreverAmtStr} aplicados e ele poderia pagar uma assinatura de ${subLabel} de $${monthly}/mês, para sempre.`,
  "tcpYieldHeadlineChain": (chain, apyStr, foreverAmtStr, monthly, subLabel) =>
      `Ativos parados em ${chain} poderiam render ~${apyStr} — deixe ${foreverAmtStr} aplicados e eles poderiam pagar uma assinatura de ${subLabel} de $${monthly}/mês, para sempre.`,
  "tokenHeadTitle": (sym, count, dateStr) => dateStr
      ? `Rendimento de ${sym} (${dateStr}) — ${count} pools comparados | DeFi Garden`
      : `Rendimento de ${sym} hoje — ${count} pools comparados | DeFi Garden`,
  "tokenHowBaseReward": "O APY total reflete dois componentes distintos: o APY base (apyBase), obtido diretamente dos juros pagos por quem toma empréstimos ou das tarifas de negociação, no ativo subjacente, e o APY de recompensa (apyReward), distribuído em tokens secundários de governança ou de incentivo, que oscilam de forma independente.",
  "tokenHowRisk": "Todo rendimento em DeFi traz risco. Falhas em smart contracts, exploits econômicos do protocolo, eventos de depeg de stablecoins e cascatas de liquidação podem resultar em perda do capital. Produtos DeFi não são depósitos bancários e não são segurados pelo FDIC, pela SIPC nem por qualquer entidade governamental. As informações são apenas educativas e não constituem aconselhamento financeiro.",
  "tokenHowSources": (sym) => `O rendimento de ${sym} vem de quatro mecanismos principais on-chain: o diferencial de juros de empréstimos pago por quem toma crédito nos mercados monetários, as tarifas de negociação distribuídas a quem fornece liquidez a formadores de mercado automatizados (AMMs), recompensas nativas de consenso ou de liquid staking, quando aplicável, e incentivos do protocolo criados para atrair liquidez.`,
  "tokenHowTitle": (sym) => `Como o rendimento de ${sym} é gerado`,
  "tokenUpdated": (date) => `Dados dos pools verificados na DefiLlama no momento da geração: ${date}. As taxas mudam o tempo todo.`,
};
