'use strict';

/**
 * i18n/es.js — Spanish (neutral Latin American) strings for the STATIC SEO pages (tokens/, chains/,
 * pools/ pages, hubs and sitemaps under /es/). Node-only: read by the
 * generators through i18n/index.js, never shipped to a browser.
 *
 * Shape: { key: string | function } — the same keys, parameters and
 * semantics as the EN entries in translations.js / i18n/static-en-ko.js.
 * Missing keys fall back to EN per key.
 * `node scripts/i18n-key-inventory.js` is the done-check.
 *
 * Audience: retail stablecoin savers in Mexico, Argentina, Colombia and the
 * rest of Latin America. Plain, calm, honest tone ("honest numbers beat
 * exciting numbers"). Register: "tú" (no voseo, no "vosotros", no Spain-only
 * vocabulary such as "ordenador").
 *
 * GLOSSARY (applied consistently; the native-review sheet in
 * docs/i18n-review-pt-es.md repeats it)
 *   yield ................ rendimiento  (titles lead with it)
 *   rate (APY, rates) .... tasa
 *   fees (trading fees) .. comisiones
 *   lending .............. préstamo
 *   liquidity ............ liquidez     (exit liquidity = liquidez de salida)
 *   chain ................ red / redes
 *   smart contract ....... contrato inteligente
 *   pool, stablecoin, staking, vault, token, wallet, exploit, depeg
 *                          kept as the loanwords LatAm users type
 *   TVL floor ............ "TVL mínimo de $100K" (the floor is always a param)
 *   honest ............... honesto
 *   anomalous ............ anómalo
 *   forecast ............. pronóstico
 *   capital stickiness ... permanencia del capital
 *   impermanent loss ..... pérdida impermanente
 *   live (data / rates) .. en vivo; live (pool) -> activo
 *   education, not advice  educación, no asesoría financiera
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
const livePoolWord = (n) => (one(n) ? 'pool activo' : 'pools activos');
const chainWord = (n) => (one(n) ? 'red' : 'redes');
const tokenWord = (n) => (one(n) ? 'token' : 'tokens');
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

module.exports = {
  "aiAgents": "Agentes de IA y MCP",
  "apiLink": "API",
  "apyMean30d": "APY promedio de 30d",
  "browseChains": "Explorar redes",
  "browseTokens": "Explorar tokens",
  "defillamaApi": "DefiLlama API",
  "footerSignOff": "Educación, no asesoría.",
  "landing.navAgents": "Agentes de IA y MCP",
  "landing.navApi": "API",
  "landing.navClose": "Cerrar menú",
  "landing.navMenu": "Abrir menú",
  "landing.navMethodology": "Metodología",
  "landing.navMobile": "Navegación en el celular",
  "landing.navPlanner": "Planificador de ahorro",
  "landing.navPrimary": "Navegación principal",
  "landing.navSearch": "Buscar rendimientos",
  "landing.themeDark": "Cambiar a modo oscuro",
  "landing.themeLight": "Cambiar a modo claro",
  "methodologyLink": "Metodología",
  "planner.ladderClaude": "Claude Pro",
  "poweredBy": "Con datos de",
  "pspAccessHeading": "Quién puede acceder",
  "pspAccessOpen": "Sin permisos: cualquier persona con una wallet",
  "pspAccessOpenNote": "Este proyecto no está en la lista de DeFi Garden de proyectos restringidos (acceso solo con KYC o solo para inversionistas acreditados). Los términos del propio protocolo y las restricciones regionales aún pueden aplicar.",
  "pspAccessRestricted": "Con permisos / solo KYC",
  "pspAccessRestrictedNote": "Este proyecto está en la lista de DeFi Garden de proyectos restringidos (acceso con KYC, para inversionistas acreditados o compradores calificados). La mayoría de los usuarios individuales no puede depositar directamente.",
  "pspAccuracyLink": "Mira cómo les fue a los pronósticos pasados",
  "pspBaseApy": "APY base",
  "pspBreadcrumbPools": "Pools",
  "pspChartCaption": "Línea continua: APY diario de DefiLlama. Área sombreada: rango de pronóstico del modelo, dibujado como un abanico recto desde la tasa de hoy hasta el final del horizonte de pronóstico (no son cuantiles diarios). Línea punteada: trayectoria mediana del modelo.",
  "pspChartHeading": "Historial y pronóstico del APY",
  "pspChartHorizon": (days) => `+${days}d`,
  "pspChartTitle": (name, sym, chain, histDays, horizon, p10, p90) =>
      `${name} ${sym} en ${chain}: APY de los últimos ${histDays} días y, después, una banda de pronóstico de ${horizon} días, de ${p10} a ${p90}`,
  "pspChartToday": "hoy",
  "pspCrashRisk": (level) => ({ LOW: "Riesgo bajo de caída brusca", MEDIUM: "Riesgo medio de caída brusca", HIGH: "Riesgo alto de caída brusca" }[level] || `Riesgo de caída brusca: ${level}`),
  "pspCta": "Abrir en el Decision Terminal →",
  "pspDataAsOf": (date) => `Fecha de los datos: ${date}. Fuente: datos de pools de DefiLlama; la puntuación y el pronóstico los calcula DeFi Garden.`,
  "pspDatasetDescription": (name, sym, chain) => `Datos de rendimiento en vivo de DefiLlama para ${name} ${sym} en ${chain}, con el desglose del DeFi Score de DeFi Garden y una banda de pronóstico del modelo a 14 días.`,
  "pspDatasetName": (name, sym, chain) => `${name} ${sym} en ${chain}: APY, DeFi Score y pronóstico a 14 días`,
  "pspDescription": (name, sym, chain, apy, mean30, tvl, score, p10, p90, date) =>
      `${name} ${sym} en ${chain}: APY ${apy} en vivo, promedio de 30d ${mean30}, TVL ${tvl}, DeFi Score ${score}/100, pronóstico del modelo a 14 días ${p10} a ${p90}. Fecha: ${date}.`,
  "pspExposureMulti": "Exposición: varios activos.",
  "pspExposureSingle": "Exposición: un solo activo.",
  "pspForecastDisclaimer": "Modelo experimental: aún no se ha demostrado que sea más preciso que suponer que la tasa de hoy se mantiene. La evaluación pasada está documentada públicamente.",
  "pspForecastFlat": (cur, p50) => `Lectura: el modelo espera que la tasa se mantenga más o menos estable, de ${cur} hoy a cerca de ${p50}.`,
  "pspForecastHeading": "Banda de pronóstico a 14 días (experimental)",
  "pspForecastHigher": (cur, p50) => `Lectura: el modelo espera que la tasa tienda a subir, de ${cur} hoy a cerca de ${p50}.`,
  "pspForecastLead": (days, p50, p10, p90) => `Pronóstico del modelo para los próximos ${days} días: mediana de ${p50}, rango de ${p10} a ${p90}.`,
  "pspForecastLower": (cur, p50) => `Lectura: el modelo espera que la tasa tienda a bajar, de ${cur} hoy a cerca de ${p50}.`,
  "pspH1": (name, sym, chain) => `${name} ${sym} en ${chain}: APY, DeFi Score y pronóstico a 14 días`,
  "pspHubDescription": (count) => `${count} pools DeFi grandes con APY en vivo, desglose del DeFi Score y banda de pronóstico a 14 días.`,
  "pspHubHeading": "Pools DeFi evaluados",
  "pspHubIntro": "Cada página muestra la tasa en vivo, los pilares del DeFi Score, una banda de pronóstico del modelo a 14 días, quién puede acceder al pool y los principales riesgos. Los números vienen de DefiLlama; los scores y los pronósticos son resultados de un modelo.",
  "pspHubLink": "Ver pools evaluados →",
  "pspHubSub": (count, tvlFloor) => `${count} pools con al menos ${tvlFloor} de TVL y 30 días de historial.`,
  "pspHubTitle": "Pools DeFi evaluados: APY, DeFi Score y pronóstico | DeFi Garden",
  "pspIlNo": "DefiLlama no señala riesgo de pérdida impermanente en este pool.",
  "pspIlYes": "DefiLlama señala riesgo de pérdida impermanente en este pool.",
  "pspLegendBand": "Rango de pronóstico (bajo a alto)",
  "pspLegendHistory": "APY observado",
  "pspLegendMedian": "Mediana del pronóstico",
  "pspLiveApy": "APY en vivo",
  "pspMean30": "APY promedio de 30 días",
  "pspMethodologyLink": "Detalles del score y del pronóstico (servidor MCP)",
  "pspNotAdvice": "Educación, no asesoría financiera. DeFi implica riesgo de contrato inteligente, de mercado y regulatorio, y puedes perder dinero.",
  "pspP10": "Escenario bajo",
  "pspP50": "Mediana",
  "pspP90": "Escenario alto",
  "pspPillarLiquidity": "Liquidez de salida",
  "pspPillarStability": "Estabilidad del rendimiento",
  "pspPillarStickiness": "Permanencia del capital",
  "pspPillarSustainability": "Sostenibilidad",
  "pspPoolMeta": (meta) => `Variante del pool: ${meta}.`,
  "pspRewardApy": "APY de recompensas",
  "pspRiskContract": "Riesgo de contrato inteligente: un error o exploit en el protocolo o en sus dependencias puede hacer perder los fondos depositados.",
  "pspRiskCrash": (label) => `Alerta del modelo: ${label} para los próximos 14 días.`,
  "pspRiskIl": "Pérdida impermanente: el valor de este pool puede quedar por debajo de lo que tendrías con solo mantener los activos, si sus precios se separan.",
  "pspRiskNone": "No hay alertas específicas de este pool en los datos, más allá de los riesgos permanentes de arriba.",
  "pspRiskReward": (pct) => `Caída de las recompensas: ${pct} del APY publicado se paga en tokens emitidos, que pueden reducirse o dejar de pagarse.`,
  "pspRiskTvlDown": (pct) => `Depósitos a la baja: el TVL cambió ${pct} en el periodo analizado, es decir, está saliendo capital.`,
  "pspRiskTvlUp": (pct) => `Depósitos al alza: el TVL cambió ${pct} en el periodo analizado. Es una señal de demanda, no una garantía, y un TVL en aumento puede diluir las recompensas.`,
  "pspRiskVol": (stdev, apy) => `Tasa volátil: la desviación estándar de 30 días es ${stdev}, frente a una tasa actual de ${apy}.`,
  "pspRisksHeading": "Riesgos",
  "pspScoreHeading": "DeFi Score: calidad del rendimiento",
  "pspScoreNote": "La puntuación evalúa la calidad del rendimiento en cuatro pilares (estabilidad, sostenibilidad de las comisiones, permanencia de los depositantes, liquidez de salida).",
  "pspScoreValue": (score) => `Puntuación ${score} / 100`,
  "pspSecondaryChain": (chain) => `Más pools en ${chain} →`,
  "pspSecondaryProtocol": (name) => `Ir a ${name} →`,
  "pspSimilarHeading": "Pools similares",
  "pspSimilarItem": (name, sym, chain, tvl) => `${name} ${sym} en ${chain} (${tvl} de TVL)`,
  "pspSourceBase": (apy, pct) => `${apy} (${pct} del total) es rendimiento base: comisiones de trading o intereses que pagan los usuarios del protocolo.`,
  "pspSourceHeading": "Qué genera este rendimiento",
  "pspSourceNone": "DefiLlama no reporta APY base ni APY de recompensas para este pool por ahora.",
  "pspSourceReward": (apy, pct) => `${apy} (${pct} del total) viene de tokens de recompensa que el protocolo emite para atraer depósitos. Las emisiones pueden recortarse o terminar.`,
  "pspSummaryHeading": "Resumen",
  "pspTitleBare": (name, sym, chain) => `APY de ${name} ${sym} en ${chain}`,
  "pspTitleDated": (name, sym, chain, date) => `APY de ${name} ${sym} en ${chain} (${date}) | DeFi Garden`,
  "pspTitleUndated": (name, sym, chain) => `APY de ${name} ${sym} en ${chain} | DeFi Garden`,
  "pspTvl": "TVL",
  "pspWithdrawGeneric": "Los periodos de bloqueo, las esperas y las colas de retiro los definen los contratos del protocolo y no están en el feed de DefiLlama. Revisa la documentación del protocolo antes de depositar.",
  "pspWithdrawHeading": "Notas sobre retiros",
  "pspWithdrawLiquidity": (tvl) => `Liquidez de salida: ${tvl} en el pool.`,
  "pspWithdrawTvlForecast": (pred, delta) => `El modelo proyecta un TVL de ${pred} en 14 días (${delta}).`,
  "tcpAllChainsHeading": "Todas las redes",
  "tcpAnswer": (label, apyStr, project, chain, count, floorStr) =>
      `El mayor rendimiento honesto de ${label} ahora es ${apyStr} en ${project} (${chain}), entre ${count} ${poolWord(count)} por encima del TVL mínimo de ${floorStr}. Las tasas son en vivo de DefiLlama y excluyen pools anómalos (APY >1000%).`,
  "tcpAvailableOnHeading": "Disponible en",
  "tcpAzBackCta": "← Todos los tokens",
  "tcpAzDescription": (letter, count) => `${count} tokens DeFi que empiezan con "${letter}", con datos de rendimiento en vivo y filtrados por confianza en DeFi Garden.`,
  "tcpAzHeading": (letter) => `Tokens que empiezan con ${letter}`,
  "tcpAzSub": (count) => `${count} tokens`,
  "tcpAzTitle": (letter) => `Tokens que empiezan con ${letter} | DeFi Garden 🌱`,
  "tcpBreadcrumbChains": "Redes",
  "tcpBreadcrumbHome": "Inicio",
  "tcpBreadcrumbTokens": "Tokens",
  "tcpBrowseAZHeading": "Explorar todos los tokens de la A a la Z",
  "tcpByCategoryHeading": "Por categoría",
  "tcpChainCta": (chain) => `Ver pools activos en ${chain} →`,
  "tcpChainDescription": (chain, count, apy, tokenCount, floorStr) =>
      `${count} ${livePoolWord(count)} en ${chain} sobre el TVL mínimo de ${floorStr}, hasta ${apy} APY, en ${tokenCount} ${tokenWord(tokenCount)}. Rendimientos honestos con datos de DefiLlama, sin tasas anómalas.`,
  "tcpChainHeading": (chain) => `Rendimientos DeFi en ${chain}`,
  "tcpChainHubDescription": (count) => `${count} redes con datos de rendimiento DeFi en vivo y filtrados por confianza, ordenadas por TVL. Rendimientos honestos de DefiLlama, sin tasas anómalas.`,
  "tcpChainHubHeading": "Rendimientos de todas las redes",
  "tcpChainHubIntro": (floorStr) => `Todas las páginas de redes de DeFi Garden en un solo lugar: pools en vivo ordenados por TVL, filtrados con un TVL mínimo de ${floorStr} y con filtros de anomalías.`,
  "tcpChainHubSub": (count) => `${count} redes con datos de rendimiento en vivo y filtrados por confianza`,
  "tcpChainHubTitle": "Rendimientos DeFi en vivo de todas las redes | DeFi Garden 🌱",
  "tcpChainIntro": (chain, project, symbol, apy, tvl, count, tokenCount, totalTvl, floorStr) =>
      `El mayor pool activo en ${chain} es ${project} (${symbol}), con ${apy} (${tvl} de TVL). ${count} ${poolWord(count)} en ${tokenCount} ${tokenWord(tokenCount)} ${one(count) ? 'alcanza' : 'alcanzan'} el TVL mínimo de ${floorStr} de esta página, ${totalTvl} en total.`,
  "tcpChainTitle": (chain, dateStr) => dateStr
      ? `Rendimiento en ${chain} (${dateStr}) — pools comparados | DeFi Garden`
      : `Rendimiento DeFi en ${chain} — pools por TVL | DeFi Garden`,
  "tcpChainsAriaLabel": "Redes",
  "tcpColApy": "APY",
  "tcpColChain": "Red",
  "tcpColProtocol": "Protocolo",
  "tcpColToken": "Token",
  "tcpColTvl": "TVL",
  "tcpDatasetChainDescription": (chain, floorStr) => `Datos de rendimiento en vivo de DefiLlama para pools en ${chain} en DeFi Garden, filtrados con un TVL mínimo de ${floorStr} y con exclusión de APY anómalo.`,
  "tcpDatasetChainName": (chain) => `Dataset de rendimientos DeFi en ${chain}`,
  "tcpDatasetTokenDescription": (sym, floorStr) => `Datos de rendimiento en vivo de DefiLlama para pools de ${sym} en DeFi Garden, filtrados con un TVL mínimo de ${floorStr} y con exclusión de APY anómalo.`,
  "tcpDatasetTokenName": (sym) => `Dataset de rendimientos DeFi de ${sym}`,
  "tcpDepthColMix": "Composición del rendimiento",
  "tcpDepthHeading": "Cómo se ha comportado esta tasa",
  "tcpDepthIlExposure": (ilCount, poolCount) =>
      `${ilCount} de ${poolCount} ${poolWord(poolCount)} ${one(ilCount) ? 'tiene' : 'tienen'} riesgo de pérdida impermanente, es decir, una posición con dos activos puede perder valor frente a simplemente mantener los activos, incluso mientras genera rendimiento.`,
  "tcpDepthMean": (meanCount, poolCount, medianMeanStr) =>
      `${meanCount} de ${poolCount} ${poolWord(poolCount)} ${one(meanCount) ? 'tiene' : 'tienen'} un promedio de 30 días confiable registrado, con una mediana de ${medianMeanStr} — una buena referencia frente al número de hoy para saber si la tasa es estable o si hoy es solo un buen día.`,
  "tcpDepthMixAllBase": (poolCount) =>
      one(poolCount)
        ? 'El único pool paga una tasa base simple por ahora, sin APY de incentivos ni de recompensas mezclado.'
        : `Los ${poolCount} pools pagan una tasa base simple por ahora, sin APY de incentivos ni de recompensas mezclado.`,
  "tcpDepthMixBaseCell": "Tasa base",
  "tcpDepthMixIncentiveCell": (shareStr) => `${shareStr} de incentivos`,
  "tcpDepthMixIncentives": (rewardCount, poolCount) =>
      `${rewardCount} de ${poolCount} ${poolWord(poolCount)} ${one(rewardCount) ? 'combina' : 'combinan'} APY de incentivos o de recompensas además de la tasa base. El rendimiento por incentivos se reduce con el tiempo, a medida que se agotan los programas de recompensas; la tasa base es el número más duradero.`,
  "tcpDepthNote": (floorStr) =>
      `El promedio de 30 días viene directo de DefiLlama y solo aparece cuando pasa el mismo filtro de sensatez que todos los demás números de esta página. Un guion significa que no pasó ese filtro, no que se esté ocultando. Todos los pools de aquí ya cumplen un TVL mínimo de ${floorStr}. Las tasas cambian a diario, así que tómalo como una foto del momento, no como una promesa.`,
  "tcpDepthSpread": (symbol, poolCount, lowApyStr, highApyStr, chainCount) =>
      `${symbol} aparece en ${poolCount} ${poolWord(poolCount)} aquí, con tasas de ${lowApyStr} a ${highApyStr} APY en ${chainCount} ${chainWord(chainCount)} — la tasa depende del protocolo y de la red que elijas, no solo del token.`,
  "tcpFaqA1": (apyStr, project, chain) => `${apyStr} de APY en ${project} (${chain}), según datos en vivo de DefiLlama.`,
  "tcpFaqA2": (count, tvlStr, floorStr) => `${count} ${livePoolWord(count)} ${one(count) ? 'alcanza' : 'alcanzan'} el TVL mínimo de ${floorStr} de esta página, ${tvlStr} en total.`,
  "tcpFaqA3": (floorStr) => `Los pools de esta página alcanzan un TVL mínimo de ${floorStr} y excluyen tasas anómalas (APY >1000%). Ese es el criterio de listado de esta página, no una garantía de seguridad. Esto es educación, no asesoría financiera; DeFi implica riesgo de contrato inteligente y de mercado, sin importar la tasa que se muestre.`,
  "tcpFaqHeading": "Preguntas frecuentes",
  "tcpFaqQ1": (label) => `¿Cuál es el mayor rendimiento de ${label} hoy?`,
  "tcpFaqQ2": (label) => `¿Cuántos pools de ${label} alcanzan el TVL mínimo?`,
  "tcpFaqQ3": "¿Son seguras estas tasas?",
  "tcpFooterTagline": "planifica tu ahorro en DeFi por objetivo.",
  "tcpHubBackCta": "← Volver a DeFi Garden",
  "tcpItemListName": (project, chain) => `${project} en ${chain}`,
  "tcpLanguageLabel": "Idioma",
  "tcpLastUpdated": (date) => `Última actualización: ${date}`,
  "tcpMonthYear": (monthShortEn, month, year) => `${MONTHS[Number(month) - 1] || monthShortEn} ${year}`,
  "tcpPoolCategoriesAriaLabel": "Categorías de pools",
  "tcpPoolTypeLabel": (type) => ({ 'Lending': 'Préstamos', 'Yield Derivatives': 'Derivados de rendimiento', 'Yield Farming': 'Yield farming', 'LP/DEX': 'LP/DEX', 'Staking': 'Staking', 'RWA': 'RWA' }[type] || type),
  "tcpRateStabilityCandidate": (project, chain, apyStr, tvlStr, href) =>
      `${project} (${chain}), APY de ${apyStr}, TVL de ${tvlStr}, ${href}`,
  "tcpRateStabilityColRank": "Posición",
  "tcpRateStabilityFaqQ": (symbol) => `¿Qué pools de ${symbol} tienen el historial de APY más estable?`,
  "tcpRateStabilityHeading": "Estabilidad de la tasa según el historial de APY",
  "tcpRateStabilityInsufficientAnswer": (symbol) =>
      `No hay suficiente historial de APY válido para clasificar los pools de ${symbol}. Esta vista cubre solo el historial de APY y no mide riesgo de protocolo, de exploit, de depeg, de liquidez, de gobernanza ni de pérdida de capital.`,
  "tcpRateStabilityRankedAnswer": (symbol, candidates) =>
      `Con base solo en el historial de APY, los candidatos de ${symbol} con menor variabilidad son ${candidates}. Esta comparación no mide riesgo de protocolo, de exploit, de depeg, de liquidez, de gobernanza ni de pérdida de capital.`,
  "tcpRelatedChainsHeading": "Redes relacionadas",
  "tcpRelatedTokensHeading": "Tokens relacionados",
  "tcpRestrictedAccessTitle": "Acceso restringido (KYC/inversionistas acreditados)",
  "tcpSubLine": (count, floorStr) => `${count} ${livePoolWord(count)} por encima del TVL mínimo de ${floorStr} · ordenados por TVL`,
  "tcpTokenCta": (sym) => `Ver pools activos de ${sym} →`,
  "tcpTokenDescription": (sym, count, apy, chainCount, floorStr) =>
      `${count} ${livePoolWord(count)} de ${sym} sobre el TVL mínimo de ${floorStr}, hasta ${apy} APY, en ${chainCount} ${chainWord(chainCount)}. Rendimientos honestos con datos de DefiLlama, sin tasas anómalas.`,
  "tcpTokenHeading": (sym) => `Rendimientos DeFi de ${sym}`,
  "tcpTokenHubDescription": (count) => `${count} tokens con datos de rendimiento DeFi en vivo y filtrados por confianza: los principales pools por TVL, con navegación por nombre. Rendimientos honestos de DefiLlama, sin tasas anómalas.`,
  "tcpTokenHubHeading": "Rendimientos de todos los tokens",
  "tcpTokenHubIntro": (floorStr) => `Todas las páginas de tokens de DeFi Garden en un solo lugar: pools en vivo ordenados por TVL, filtrados con un TVL mínimo de ${floorStr} y con filtros de anomalías. Empieza por los principales tokens por TVL o salta directo a una letra.`,
  "tcpTokenHubSub": (count) => `${count} tokens con datos de rendimiento en vivo y filtrados por confianza`,
  "tcpTokenHubTitle": "Rendimientos en vivo de todos los tokens DeFi | DeFi Garden 🌱",
  "tcpTokenIntro": (sym, project, chain, apy, tvl, count, chainCount, totalTvl, floorStr) =>
      `El mayor pool activo de ${sym} es ${project} en ${chain}, con ${apy} (${tvl} de TVL). ${count} ${poolWord(count)} de ${sym} en ${chainCount} ${chainWord(chainCount)} ${one(count) ? 'alcanza' : 'alcanzan'} el TVL mínimo de ${floorStr} de esta página, ${totalTvl} en total.`,
  "tcpTokenTitle": (sym) => `Rendimiento DeFi de ${sym} — pools por TVL | DeFi Garden 🌱`,
  "tcpTopScoredHeading": (subject) => `Principales rendimientos de ${subject} por DeFi Score (menor riesgo)`,
  "tcpTopScoredSub": "Los 5 principales pools accesibles para inversionistas individuales, clasificados por estabilidad cuantitativa, sostenibilidad de las comisiones, permanencia del capital y profundidad de liquidez. Sin vaults con permisos ni restringidos a inversionistas acreditados.",
  "tcpTopTokensByTvlHeading": "Principales tokens por TVL",
  "tcpTopTokensOnHeading": (chain) => `Principales tokens en ${chain}`,
  "tcpTrustNote": (floorStr) => `Los rendimientos son en vivo de DefiLlama. Los pools de esta página alcanzan un TVL mínimo de ${floorStr} y excluyen tasas anómalas — ese es el criterio de listado de esta página, no una garantía de seguridad. Solo educación, no asesoría financiera.`,
  "tcpWaitlistCta": "Unirme a la lista de espera →",
  "tcpWaitlistHeading": "Acceso anticipado a la tarjeta",
  "tcpWaitlistMicro": "Unirse es gratis • La tarjeta aún no existe • Te avisaremos por correo cuando exista",
  "tcpWaitlistPitchChain": (chain) => `Una tarjeta que gasta el rendimiento de tus posiciones en ${chain}, nunca el capital. Súmate a la lista de espera y sé de los primeros en enterarte cuando esté lista.`,
  "tcpWaitlistPitchHub": "Una tarjeta que gasta tu rendimiento DeFi, nunca tu capital. Súmate a la lista de espera y sé de los primeros en enterarte cuando esté lista.",
  "tcpWaitlistPitchToken": (sym) => `Una tarjeta que gasta el rendimiento de tu ${sym}, nunca el ${sym} en sí. Súmate a la lista de espera y sé de los primeros en enterarte cuando esté lista.`,
  "tcpYieldHeadline": (sym, apyStr, foreverAmtStr, monthly, subLabel) =>
      `Tu ${sym} sin usar podría rendir ~${apyStr} — deja ${foreverAmtStr} y podría pagar una suscripción de ${subLabel} de $${monthly}/mes, para siempre.`,
  "tcpYieldHeadlineChain": (chain, apyStr, foreverAmtStr, monthly, subLabel) =>
      `Los fondos sin usar en ${chain} podrían rendir ~${apyStr} — deja ${foreverAmtStr} y podrían pagar una suscripción de ${subLabel} de $${monthly}/mes, para siempre.`,
  "tokenHeadTitle": (sym, count, dateStr) => dateStr
      ? `Rendimiento de ${sym} (${dateStr}) — ${count} pools comparados | DeFi Garden`
      : `Rendimiento de ${sym} hoy — ${count} pools comparados | DeFi Garden`,
  "tokenHowBaseReward": "El APY total refleja dos componentes distintos: el APY base (apyBase), que viene directamente de los intereses que pagan quienes piden préstamos o de las comisiones de trading, en el activo subyacente, y el APY de recompensas (apyReward), que se reparte en tokens secundarios de gobernanza o de incentivo, que fluctúan de forma independiente.",
  "tokenHowRisk": "Todo rendimiento en DeFi conlleva riesgo. Las vulnerabilidades de los contratos inteligentes, los exploits económicos del protocolo, los eventos de depeg de stablecoins y las cascadas de liquidación pueden causar pérdida del capital. Los productos DeFi no son depósitos bancarios y no están asegurados por la FDIC, la SIPC ni ninguna entidad gubernamental. La información es solo educativa y no constituye asesoría financiera.",
  "tokenHowSources": (sym) => `El rendimiento de ${sym} viene de cuatro mecanismos principales on-chain: el diferencial de intereses de los préstamos que pagan quienes piden prestado en los mercados monetarios, las comisiones de trading que se reparten a quienes aportan liquidez a los creadores de mercado automatizados (AMM), las recompensas nativas de consenso o de liquid staking, cuando aplican, y los incentivos del protocolo diseñados para atraer liquidez.`,
  "tokenHowTitle": (sym) => `Cómo se genera el rendimiento de ${sym}`,
  "tokenUpdated": (date) => `Datos de los pools verificados en DefiLlama al momento de la generación: ${date}. Las tasas cambian constantemente.`,
};
