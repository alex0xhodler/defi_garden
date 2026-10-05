# pt-BR / es native-review sheet (static SEO pages)

Scope: the static estate under `/pt/` (Brazilian Portuguese) and `/es/` (neutral Latin American Spanish): token, chain and scored-pool pages plus their hubs and A-Z pages. Source of truth: `i18n/pt.js` and `i18n/es.js` (195 keys each). Edit a string there, run `node scripts/i18n-key-inventory.js`, regenerate with the three generators.

Audience: retail stablecoin savers in Brazil, Mexico, Argentina and Colombia. Tone: calm, plain, honest ("honest numbers beat exciting numbers"). Register: "você" (pt-BR), "tú" (es; no voseo, no "vosotros").

Not translated on purpose: DeFi Garden, DefiLlama, DeFi Score, APY, TVL, token tickers, protocol and chain names. Numbers, percentages, dollar amounts and dates are pre-formatted en-US strings (dot decimals, "$1.2M", "October 5, 2026") and are printed as received. Do not localise them.

The tables below are rendered with real sample values (USDC / Base / Ethereum, 1,573 pools, $100K floor) straight from the dictionaries, so they cannot drift from the code.

## Glossary (applied consistently in both files)

| Concept | EN | pt-BR | es | Note |
|---|---|---|---|---|
| yield | yield | rendimento | rendimiento | pt never uses "rentabilidade"; titles lead with this word |
| rate (APY, rates) | rate | taxa | tasa | |
| trading fees | fees | tarifas | comisiones | pt reserves "taxa" for rates, so fees are "tarifas" |
| lending | lending | empréstimo(s) | préstamo(s) | |
| liquidity | liquidity | liquidez | liquidez | "exit liquidity" = liquidez de saída / liquidez de salida |
| chain | chain | rede / redes | red / redes | |
| TVL floor | TVL floor | TVL mínimo de $100K | TVL mínimo de $100K | the amount is always a parameter, never typed |
| honest | honest | honesto | honesto | brand tone, kept |
| anomalous | anomalous | anômalo | anómalo | |
| forecast | forecast | previsão | pronóstico | |
| capital stickiness | capital stickiness | permanência do capital | permanencia del capital | how long depositors stay |
| impermanent loss | impermanent loss | perda impermanente | pérdida impermanente | |
| smart contract | smart contract | smart contract | contrato inteligente | pt keeps the loanword, es translates |
| live data | live | ao vivo / en vivo | en vivo | a live pool = "pool ativo" / "pool activo" |
| not advice | education, not financial advice | educação, não aconselhamento financeiro | educación, no asesoría financiera | |
| kept as loanwords | pool, stablecoin, staking, vault, token, wallet, exploit, depeg, yield farming | same | same | what people actually type in search |
| accredited investor | accredited | investidor credenciado | inversionista acreditado | no exact local equivalent, see checklist |

## Strings to review (63 most visible)

Columns: EN | pt-BR | es | notes for the reviewer. "Key" is the dictionary key to edit.

### Page titles (SEO)

| # | Key | EN | pt-BR | es | Notes |
|---|---|---|---|---|---|
| 1 | `tokenHeadTitle` | Best USDC Yields (Oct 2026) — 1,573 Live Pools Compared \| DeFi Garden | Rendimento de USDC (out 2026) — 1,573 pools comparados \| DeFi Garden | Rendimiento de USDC (oct 2026) — 1,573 pools comparados \| DeFi Garden | EN says "Best ... Yield Rates". The "Best/Melhores/Mejores" claim is dropped on purpose: title leads with the local query form ("Rendimento de ..."/"Rendimiento de ...") and adds no ranking claim. Native: is the dropped "best" a lost keyword, or fine? |
| 2 | `tokenHeadTitle` | Best USDC Yield Rates Today — 1,573 Live Pools Compared \| DeFi Garden | Rendimento de USDC hoje — 1,573 pools comparados \| DeFi Garden | Rendimiento de USDC hoy — 1,573 pools comparados \| DeFi Garden | Undated variant ("hoy"/"hoje" = today). |
| 3 | `tcpTokenTitle` | FXSAVE DeFi Yields — Live Pools by TVL \| DeFi Garden 🌱 | Rendimento DeFi de FXSAVE — pools por TVL \| DeFi Garden 🌱 | Rendimiento DeFi de FXSAVE — pools por TVL \| DeFi Garden 🌱 | Non-head token pages (smaller tokens). "Rendimento DeFi de X" chosen over "X DeFi Yields" word order. |
| 4 | `tcpChainTitle` | Best Base Yield Rates (Oct 2026) — Live Pools Compared \| DeFi Garden | Rendimento em Base (out 2026) — pools comparados \| DeFi Garden | Rendimiento en Base (oct 2026) — pools comparados \| DeFi Garden | "Rendimento em Base": no article before chain names (Ethereum, Base, Solana ...). Check it reads right for all. |
| 5 | `tcpChainTitle` | Base DeFi Yields — Live Pools by TVL \| DeFi Garden | Rendimento DeFi em Base — pools por TVL \| DeFi Garden | Rendimiento DeFi en Base — pools por TVL \| DeFi Garden |  |
| 6 | `tcpTokenHubTitle` | Every DeFi Token's Live Yields \| DeFi Garden 🌱 | Rendimentos ao vivo de todos os tokens DeFi \| DeFi Garden 🌱 | Rendimientos en vivo de todos los tokens DeFi \| DeFi Garden 🌱 |  |
| 7 | `tcpChainHubTitle` | Every Chain's Live DeFi Yields \| DeFi Garden 🌱 | Rendimentos DeFi ao vivo de todas as redes \| DeFi Garden 🌱 | Rendimientos DeFi en vivo de todas las redes \| DeFi Garden 🌱 |  |
| 8 | `pspHubTitle` | Scored DeFi Pools: APY, DeFi Score & Forecast \| DeFi Garden | Pools DeFi avaliados: APY, DeFi Score e previsão \| DeFi Garden | Pools DeFi evaluados: APY, DeFi Score y pronóstico \| DeFi Garden | "Scored" -> "avaliados/evaluados". Alternatives: "com nota", "pontuados". |
| 9 | `tcpAzTitle` | Tokens starting with A \| DeFi Garden 🌱 | Tokens que começam com A \| DeFi Garden 🌱 | Tokens que empiezan con A \| DeFi Garden 🌱 |  |
| 10 | `pspTitleDated` | Aave V3 USDC APY on Ethereum (Oct 2026) \| DeFi Garden | APY de Aave V3 USDC em Ethereum (out 2026) \| DeFi Garden | APY de Aave V3 USDC en Ethereum (oct 2026) \| DeFi Garden | Pool pages keep "APY" as the lead term (same as EN). |

### Meta descriptions (SEO)

| # | Key | EN | pt-BR | es | Notes |
|---|---|---|---|---|---|
| 11 | `tcpTokenDescription` | 1,573 live USDC pools above the $100K TVL floor, up to 40.73% APY, across 42 chains. Honest yields from DefiLlama data — no anomalous rates. | 1,573 pools ativos de USDC acima do TVL mínimo de $100K, com até 40.73% APY, em 42 redes. Rendimentos honestos com dados da DefiLlama, sem taxas anômalas. | 1,573 pools activos de USDC sobre el TVL mínimo de $100K, hasta 40.73% APY, en 42 redes. Rendimientos honestos con datos de DefiLlama, sin tasas anómalas. | "Honest yields" -> "Rendimentos honestos". Is "honestos/honestos" the right register for finance copy in your market? |
| 12 | `tcpChainDescription` | 1,137 live pools on Base above the $100K TVL floor, up to 40.73% APY, across 803 tokens. Honest yields from DefiLlama data — no anomalous rates. | 1,137 pools ativos em Base acima do TVL mínimo de $100K, com até 40.73% APY, em 803 tokens. Rendimentos honestos com dados da DefiLlama, sem taxas anômalas. | 1,137 pools activos en Base sobre el TVL mínimo de $100K, hasta 40.73% APY, en 803 tokens. Rendimientos honestos con datos de DefiLlama, sin tasas anómalas. |  |
| 13 | `pspDescription` | Ondo Yield Assets USDY on Solana: 3.62% APY live, 3.59% 30-day mean, $179.71M TVL, DeFi Score 85.6/100, 14-day model forecast 3.62% to 3.64%. Data as of October 5, 2026. | Ondo Yield Assets USDY em Solana: APY 3.62% ao vivo, média de 30d 3.59%, TVL $179.71M, DeFi Score 85.6/100, previsão do modelo a 14 dias 3.62% a 3.64%. Data: October 5, 2026. | Ondo Yield Assets USDY en Solana: APY 3.62% en vivo, promedio de 30d 3.59%, TVL $179.71M, DeFi Score 85.6/100, pronóstico del modelo a 14 días 3.62% a 3.64%. Fecha: October 5, 2026. | Date stays en-US long form ("October 5, 2026") by design - see Open decisions. |
| 14 | `tcpTokenHubDescription` | 552 tokens with live, trust-filtered DeFi yield data — top pools by TVL, browsable by name. Honest yields from DefiLlama, no anomalous rates. | 552 tokens com dados de rendimento DeFi ao vivo e filtrados por confiança: os principais pools por TVL, com navegação por nome. Rendimentos honestos da DefiLlama, sem taxas anômalas. | 552 tokens con datos de rendimiento DeFi en vivo y filtrados por confianza: los principales pools por TVL, con navegación por nombre. Rendimientos honestos de DefiLlama, sin tasas anómalas. |  |

### Headings (H1 / H2)

| # | Key | EN | pt-BR | es | Notes |
|---|---|---|---|---|---|
| 15 | `tcpTokenHeading` | USDC DeFi Yields | Rendimentos DeFi de USDC | Rendimientos DeFi de USDC |  |
| 16 | `tcpChainHeading` | Base DeFi Yields | Rendimentos DeFi em Base | Rendimientos DeFi en Base |  |
| 17 | `pspH1` | Aave V3 USDC on Ethereum: APY, DeFi Score & 14-day forecast | Aave V3 USDC em Ethereum: APY, DeFi Score e previsão de 14 dias | Aave V3 USDC en Ethereum: APY, DeFi Score y pronóstico a 14 días |  |
| 18 | `tcpTopScoredHeading` | Top USDC Yields by DeFi Score (Lowest Risk) | Principais rendimentos de USDC por DeFi Score (menor risco) | Principales rendimientos de USDC por DeFi Score (menor riesgo) | "Top ... (Lowest Risk)" -> "Principais ... (menor risco)". Check "menor risco" is not too strong a claim in your market; EN says "Lowest Risk". |
| 19 | `tcpBrowseAZHeading` | Browse all tokens A–Z | Explorar todos os tokens de A a Z | Explorar todos los tokens de la A a la Z |  |
| 20 | `tcpFaqHeading` | Frequently asked questions | Perguntas frequentes | Preguntas frecuentes |  |
| 21 | `tokenHowTitle` | How USDC Yield is Generated | Como o rendimento de USDC é gerado | Cómo se genera el rendimiento de USDC |  |
| 22 | `pspSummaryHeading` | Summary | Resumo | Resumen |  |

### Lead answer + intro sentences

| # | Key | EN | pt-BR | es | Notes |
|---|---|---|---|---|---|
| 23 | `tcpAnswer` | The highest honest USDC yield right now is 40.73% on uniswap-v3 (Base), among 1,573 pools above the $100K TVL floor. Rates are live from DefiLlama and exclude anomalous (>1000% APY) pools. | O maior rendimento honesto de USDC agora é 40.73% em uniswap-v3 (Base), entre 1,573 pools acima do TVL mínimo de $100K. As taxas são ao vivo da DefiLlama e excluem pools anômalos (APY >1000%). | El mayor rendimiento honesto de USDC ahora es 40.73% en uniswap-v3 (Base), entre 1,573 pools por encima del TVL mínimo de $100K. Las tasas son en vivo de DefiLlama y excluyen pools anómalos (APY >1000%). | Singular/plural of "pool" switches on a count of exactly 1. "taxa/tasa" = rate; "anômalos/anómalos" = anomalous. |
| 24 | `tcpTokenIntro` | USDC's largest live pool is maple on Ethereum at 5.12% ($2.9B TVL). 1,573 USDC pools across 42 chains clear this page's $100K TVL floor, $8.75B in total. | O maior pool ativo de USDC é maple em Ethereum, com 5.12% ($2.9B de TVL). 1,573 pools de USDC em 42 redes atingem o TVL mínimo de $100K desta página, somando $8.75B. | El mayor pool activo de USDC es maple en Ethereum, con 5.12% ($2.9B de TVL). 1,573 pools de USDC en 42 redes alcanzan el TVL mínimo de $100K de esta página, $8.75B en total. | Verb agreement ("atinge/atingem", "alcanza/alcanzan") follows the pool count. |
| 25 | `tcpYieldHeadline` | Your idle USDC could earn ~5.48% — park $4.4K and it could run a $20/mo Claude Pro subscription, forever. | Seu USDC parado poderia render ~5.48% — deixe $4.4K aplicados e ele poderia pagar uma assinatura de Claude Pro de $20/mês, para sempre. | Tu USDC sin usar podría rendir ~5.48% — deja $4.4K y podría pagar una suscripción de Claude Pro de $20/mes, para siempre. | Conditional ("poderia/podría") kept: it is a could, not a promise. "idle" -> "parado" / "sin usar". |

### FAQ

| # | Key | EN | pt-BR | es | Notes |
|---|---|---|---|---|---|
| 26 | `tcpFaqQ1` | What's the highest USDC yield today? | Qual é o maior rendimento de USDC hoje? | ¿Cuál es el mayor rendimiento de USDC hoy? |  |
| 27 | `tcpFaqA1` | 40.73% APY on uniswap-v3 (Base), based on live DefiLlama data. | 40.73% de APY em uniswap-v3 (Base), com base em dados ao vivo da DefiLlama. | 40.73% de APY en uniswap-v3 (Base), según datos en vivo de DefiLlama. |  |
| 28 | `tcpFaqQ2` | How many USDC pools clear the TVL floor? | Quantos pools de USDC atingem o TVL mínimo? | ¿Cuántos pools de USDC alcanzan el TVL mínimo? |  |
| 29 | `tcpFaqA2` | 1,573 live pools clear this page's $100K TVL floor, $8.75B in total. | 1,573 pools ativos atingem o TVL mínimo de $100K desta página, $8.75B no total. | 1,573 pools activos alcanzan el TVL mínimo de $100K de esta página, $8.75B en total. |  |
| 30 | `tcpFaqQ3` | Are these rates safe? | Essas taxas são seguras? | ¿Son seguras estas tasas? |  |
| 31 | `tcpFaqA3` | Pools listed on this page clear a $100K minimum TVL and exclude anomalous (>1000% APY) rates — that is this page's listing bar, not a safety guarantee. This is education, not financial advice; DeFi carries smart-contract and market risk regardless of the rate shown. | Os pools listados nesta página atingem um TVL mínimo de $100K e excluem taxas anômalas (APY >1000%). Esse é o critério de listagem desta página, não uma garantia de segurança. Isto é educação, não aconselhamento financeiro; o DeFi envolve risco de smart contract e de mercado, seja qual for a taxa exibida. | Los pools de esta página alcanzan un TVL mínimo de $100K y excluyen tasas anómalas (APY >1000%). Ese es el criterio de listado de esta página, no una garantía de seguridad. Esto es educación, no asesoría financiera; DeFi implica riesgo de contrato inteligente y de mercado, sin importar la tasa que se muestre. | Trust rail: $100K floor, ">1000% APY", "listing bar, not a safety guarantee", "education, not financial advice" must all survive. |
| 32 | `tcpRateStabilityFaqQ` | Which USDC pools have the most stable APY history? | Quais pools de USDC têm o histórico de APY mais estável? | ¿Qué pools de USDC tienen el historial de APY más estable? |  |
| 33 | `tcpRateStabilityInsufficientAnswer` | There is not enough qualifying APY history to rank USDC pools. This view covers APY history only and does not measure protocol, exploit, depeg, liquidity, governance, or principal-loss risk. | Não há histórico de APY qualificado suficiente para classificar os pools de USDC. Esta visão cobre apenas o histórico de APY e não mede risco de protocolo, de exploit, de depeg, de liquidez, de governança nem de perda de capital. | No hay suficiente historial de APY válido para clasificar los pools de USDC. Esta vista cubre solo el historial de APY y no mide riesgo de protocolo, de exploit, de depeg, de liquidez, de gobernanza ni de pérdida de capital. | "depeg" and "exploit" kept as loanwords. |

### Trust rails, disclaimers, honesty

| # | Key | EN | pt-BR | es | Notes |
|---|---|---|---|---|---|
| 34 | `tcpTrustNote` | Yields are live from DefiLlama. Pools on this page clear a $100K minimum TVL and exclude anomalous rates — that's this page's listing bar, not a safety guarantee. Education only, not financial advice. | Os rendimentos são ao vivo da DefiLlama. Os pools desta página atingem um TVL mínimo de $100K e excluem taxas anômalas — esse é o critério de listagem desta página, não uma garantia de segurança. Apenas educação, não aconselhamento financeiro. | Los rendimientos son en vivo de DefiLlama. Los pools de esta página alcanzan un TVL mínimo de $100K y excluyen tasas anómalas — ese es el criterio de listado de esta página, no una garantía de seguridad. Solo educación, no asesoría financiera. | Appears at the bottom of every page. |
| 35 | `tokenHowRisk` | All DeFi yields carry inherent risk. Smart contract vulnerabilities, protocol economic exploits, stablecoin depeg events, and liquidation cascades can result in loss of principal. DeFi products are not bank deposits and are not insured by the FDIC, SIPC, or any government entity. Information provided is for educational purposes only and does not constitute financial advice. | Todo rendimento em DeFi traz risco. Falhas em smart contracts, exploits econômicos do protocolo, eventos de depeg de stablecoins e cascatas de liquidação podem resultar em perda do capital. Produtos DeFi não são depósitos bancários e não são segurados pelo FDIC, pela SIPC nem por qualquer entidade governamental. As informações são apenas educativas e não constituem aconselhamento financeiro. | Todo rendimiento en DeFi conlleva riesgo. Las vulnerabilidades de los contratos inteligentes, los exploits económicos del protocolo, los eventos de depeg de stablecoins y las cascadas de liquidación pueden causar pérdida del capital. Los productos DeFi no son depósitos bancarios y no están asegurados por la FDIC, la SIPC ni ninguna entidad gubernamental. La información es solo educativa y no constituye asesoría financiera. | Names the US bodies FDIC/SIPC exactly as EN. Open question: should a local guarantee body (e.g. FGC in Brazil) be named? EN does not, so none was added. |
| 36 | `tcpTopScoredSub` | Top 5 retail-accessible pools ranked by quantitative stability (35%), fee sustainability (25%), capital stickiness (25%), and liquidity depth (15%). No permissioned or accredited-only vaults. | Os 5 principais pools acessíveis a investidores individuais, classificados por estabilidade quantitativa (35%), sustentabilidade das tarifas (25%), permanência do capital (25%) e profundidade de liquidez (15%). Sem vaults com permissão ou restritos a investidores credenciados. | Los 5 principales pools accesibles para inversionistas individuales, clasificados por estabilidad cuantitativa (35%), sostenibilidad de las comisiones (25%), permanencia del capital (25%) y profundidad de liquidez (15%). Sin vaults con permisos ni restringidos a inversionistas acreditados. | Pillar weights 35/25/25/15 and "Top 5" must stay. "retail-accessible" -> "acessíveis a investidores individuais / inversionistas individuales". |
| 37 | `tcpDepthNote` | The 30-day average comes straight from DefiLlama and only appears when it passes the same sanity rail as every other number on this page — a dash means it didn't clear that bar, not that it's being hidden. Every pool here already clears a $100K minimum TVL. Rates move daily, so treat this as a snapshot, not a promise. | A média de 30 dias vem direto da DefiLlama e só aparece quando passa pelo mesmo filtro de sanidade de todos os outros números desta página. Um traço significa que ela não passou nesse critério, não que está sendo escondida. Todo pool aqui já tem um TVL mínimo de $100K. As taxas mudam todo dia, então trate isto como um retrato do momento, não como uma promessa. | El promedio de 30 días viene directo de DefiLlama y solo aparece cuando pasa el mismo filtro de sensatez que todos los demás números de esta página. Un guion significa que no pasó ese filtro, no que se esté ocultando. Todos los pools de aquí ya cumplen un TVL mínimo de $100K. Las tasas cambian a diario, así que tómalo como una foto del momento, no como una promesa. | Says a dash means "did not pass the sanity rail", not "hidden". |
| 38 | `pspNotAdvice` | Education, not financial advice. DeFi carries smart-contract, market and regulatory risk, and you can lose money. | Educação, não aconselhamento financeiro. O DeFi envolve risco de smart contract, de mercado e regulatório, e você pode perder dinheiro. | Educación, no asesoría financiera. DeFi implica riesgo de contrato inteligente, de mercado y regulatorio, y puedes perder dinero. |  |
| 39 | `footerSignOff` | Education, not advice. | Educação, não aconselhamento. | Educación, no asesoría. | Short form of "education, not advice". |

### Forecast + risk wording (pool pages)

| # | Key | EN | pt-BR | es | Notes |
|---|---|---|---|---|---|
| 40 | `pspForecastDisclaimer` | Experimental model: across 10 resolved test runs, in 8 of 10 assuming today's rate holds was at least as accurate. Past multi-run evaluation is publicly documented. | Modelo experimental: em 10 execuções de teste com desfecho já conhecido, em 8 de 10 supor que a taxa de hoje se mantém foi pelo menos tão preciso quanto o modelo. A avaliação passada, com várias execuções, está documentada publicamente. | Modelo experimental: en 10 ejecuciones de prueba con resultado ya conocido, en 8 de 10 suponer que la tasa de hoy se mantiene fue al menos tan preciso como el modelo. La evaluación pasada, con varias ejecuciones, está documentada públicamente. | MOST IMPORTANT STRING: must not be softened. "in 8 of 10 [runs], assuming today's rate holds was at least as accurate" is the honest result; we added "quanto o modelo / como el modelo" to make the comparator explicit. Please confirm the sentence reads naturally and still says the model is NOT proven better. |
| 41 | `pspForecastDisclaimer` | Experimental model: not yet shown to be more accurate than assuming today's rate holds. Past evaluation is publicly documented. | Modelo experimental: ainda não foi demonstrado que ele seja mais preciso do que supor que a taxa de hoje se mantém. A avaliação passada está documentada publicamente. | Modelo experimental: aún no se ha demostrado que sea más preciso que suponer que la tasa de hoy se mantiene. La evaluación pasada está documentada públicamente. | No-runs branch. |
| 42 | `pspForecastHeading` | 14-day forecast band (experimental) | Faixa de previsão de 14 dias (experimental) | Banda de pronóstico a 14 días (experimental) |  |
| 43 | `pspForecastLead` | Model forecast for the next 14 days: median 4.50%, range 4.30% to 4.80% (p10 to p90). | Previsão do modelo para os próximos 14 dias: mediana de 4.50%, faixa de 4.30% a 4.80% (p10 a p90). | Pronóstico del modelo para los próximos 14 días: mediana de 4.50%, rango de 4.30% a 4.80% (p10 a p90). | "p10/p50/p90" kept as is. |
| 44 | `pspForecastHigher` | Read: the model expects the rate to drift higher, from 4.50% today to about 4.80%. | Leitura: o modelo espera que a taxa tenda a subir, de 4.50% hoje para cerca de 4.80%. | Lectura: el modelo espera que la tasa tienda a subir, de 4.50% hoy a cerca de 4.80%. | "drift higher" -> "tenda a subir / tienda a subir". |
| 45 | `pspCrashRisk` | Low crash risk | Risco baixo de queda brusca | Riesgo bajo de caída brusca | "crash risk" = fat lower tail of the APY forecast. Translated as "queda brusca / caída brusca". |
| 46 | `pspRiskReward` | Reward decay: 62.0% of the headline APY is paid in emitted tokens, which can shrink or stop. | Queda das recompensas: 62.0% do APY divulgado é pago em tokens emitidos, e isso pode diminuir ou acabar. | Caída de las recompensas: 62.0% del APY publicado se paga en tokens emitidos, que pueden reducirse o dejar de pagarse. |  |
| 47 | `pspRiskTvlUp` | Growing deposits: TVL changed +12.0% over the tracked window. That is one sign of demand, not a guarantee, and a rising TVL can dilute rewards. | Depósitos crescendo: o TVL variou +12.0% no período acompanhado. É um sinal de demanda, não uma garantia, e um TVL em alta pode diluir as recompensas. | Depósitos al alza: el TVL cambió +12.0% en el periodo analizado. Es una señal de demanda, no una garantía, y un TVL en aumento puede diluir las recompensas. |  |
| 48 | `pspRiskIl` | Impermanent loss: this pool's value can fall behind simply holding the assets if their prices diverge. | Perda impermanente: o valor deste pool pode ficar abaixo do que você teria apenas mantendo os ativos, se os preços deles se afastarem. | Pérdida impermanente: el valor de este pool puede quedar por debajo de lo que tendrías con solo mantener los activos, si sus precios se separan. | "Impermanent loss" -> "perda impermanente / pérdida impermanente". |
| 49 | `pspRiskContract` | Smart-contract risk: a bug or exploit in the protocol or its dependencies can lose deposited funds. | Risco de smart contract: um bug ou exploit no protocolo ou em suas dependências pode causar a perda dos fundos depositados. | Riesgo de contrato inteligente: un error o exploit en el protocolo o en sus dependencias puede hacer perder los fondos depositados. |  |
| 50 | `pspChartCaption` | Solid line: daily APY from DefiLlama. Shaded area: the model's p10 to p90 range, drawn as a straight fan from today's rate to the end of the forecast horizon (not daily quantiles). Dashed line: the model's median path. | Linha contínua: APY diário da DefiLlama. Área sombreada: faixa de p10 a p90 do modelo, desenhada como um leque reto da taxa de hoje até o fim do horizonte de previsão (não são quantis diários). Linha tracejada: trajetória mediana do modelo. | Línea continua: APY diario de DefiLlama. Área sombreada: rango de p10 a p90 del modelo, dibujado como un abanico recto desde la tasa de hoy hasta el final del horizonte de pronóstico (no son cuantiles diarios). Línea punteada: trayectoria mediana del modelo. |  |
| 51 | `pspScoreNote` | The score evaluates yield quality across four pillars (stability, fee sustainability, depositor stickiness, exit liquidity). Note: capital stickiness incorporates default estimates where on-chain wallet distribution is unindexed. | A nota avalia a qualidade do rendimento em quatro pilares (estabilidade, sustentabilidade das tarifas, permanência dos depositantes, liquidez de saída). Observação: a permanência do capital usa estimativas-padrão quando a distribuição de wallets on-chain não está indexada. | La puntuación evalúa la calidad del rendimiento en cuatro pilares (estabilidad, sostenibilidad de las comisiones, permanencia de los depositantes, liquidez de salida). Nota: la permanencia del capital usa estimaciones por defecto cuando la distribución de wallets on-chain no está indexada. | "capital stickiness" -> "permanência do capital / permanencia del capital". Check it communicates "how long depositors stay". |

### Access (who can deposit)

| # | Key | EN | pt-BR | es | Notes |
|---|---|---|---|---|---|
| 52 | `pspAccessOpen` | Permissionless — anyone with a wallet | Sem permissão: qualquer pessoa com uma wallet | Sin permisos: cualquier persona con una wallet | "wallet" kept as loanword. |
| 53 | `pspAccessRestricted` | Permissioned / KYC only | Com permissão / somente KYC | Con permisos / solo KYC |  |
| 54 | `pspAccessRestrictedNote` | This project is on DeFi Garden's list of restricted projects (KYC, accredited or qualified-purchaser access). Most retail users cannot deposit directly. | Este projeto está na lista do DeFi Garden de projetos restritos (acesso com KYC, para investidores credenciados ou compradores qualificados). A maioria dos usuários individuais não consegue depositar diretamente. | Este proyecto está en la lista de DeFi Garden de proyectos restringidos (acceso con KYC, para inversionistas acreditados o compradores calificados). La mayoría de los usuarios individuales no puede depositar directamente. | "accredited" has no exact BR/LatAm equivalent; used "investidores credenciados" / "inversionistas acreditados". Native: pick the term your regulator-aware readers expect. |
| 55 | `tcpRestrictedAccessTitle` | Restricted access (KYC/accredited) | Acesso restrito (KYC/investidores credenciados) | Acceso restringido (KYC/inversionistas acreditados) | Tooltip on the lock icon (was English-only even in KO). |

### Navigation, labels, switcher

| # | Key | EN | pt-BR | es | Notes |
|---|---|---|---|---|---|
| 56 | `tcpLanguageLabel` | Language | Idioma | Idioma | aria-label of the EN / KO / PT / ES switcher. The switcher shows PT / ES with titles "Português" / "Español". |
| 57 | `tcpBreadcrumbHome` | Home | Início | Inicio |  |
| 58 | `tcpColProtocol` | Protocol | Protocolo | Protocolo |  |
| 59 | `tcpRateStabilityColRank` | Rank | Posição | Posición |  |
| 60 | `tcpByCategoryHeading` | By category | Por categoria | Por categoría |  |
| 61 | `tcpPoolTypeLabel` | Lending | Empréstimos | Préstamos | Also: Yield Derivatives -> Derivativos de rendimento / Derivados de rendimiento; "Yield farming", "Staking", "LP/DEX", "RWA" kept. |
| 62 | `tcpMonthYear` | Oct 2026 | out 2026 | oct 2026 | Short month names: pt jan fev mar abr mai jun jul ago set out nov dez; es ene feb mar abr may jun jul ago sep oct nov dic. |
| 63 | `tcpLastUpdated` | Last updated October 5, 2026 | Última atualização: October 5, 2026 | Última actualización: October 5, 2026 | Date stays en-US long form by design. |
## Open decisions (not translation issues, but the reviewer should know)

1. **Dates stay in English.** "Last updated October 5, 2026" and "Data: October 5, 2026" render the en-US long date inside Portuguese / Spanish sentences. This follows the existing KO behaviour (the visible date must equal the `dateModified` in the page's JSON-LD). The wording around the date was chosen to read acceptably with an English month ("Última atualização: October 5, 2026"). Localised dates need a generator change, not a dictionary change.
2. **No card pitch on pt/es pages.** Neither the Laso partner block (token pages) nor the generic card waitlist (hub and A-Z pages) is rendered in pt/es, because the card is not available to Brazil / LatAm audiences. The `tcpWaitlist*` strings stay translated in the dictionaries but no pt/es page uses them; they are not part of this review.
3. **Category links lead to the English app.** The pool-type links ("Empréstimos", "Staking" ...) have translated anchor text, but the query value (`poolTypes=Lending`) and the page they open are the English app.
4. **Rate-stability sections in the committed pt/es pages say "not enough history".** The pages in this commit were generated offline from the committed snapshot, which lacks DefiLlama's raw `sigma`/`count` fields. The daily CI run regenerates every page from the live feed and fills those sections in. The wording being reviewed here is the same either way.
5. **Titles are a little longer than EN** (pt/es average about 57 characters against 54, p90 62-63) and descriptions run about 15-20 characters longer (average 152-153 against 136). If Search Console shows truncation, shorten "pools comparados" / "Rendimentos honestos com dados da DefiLlama".

## Reviewer checklist

Read in this order; stop and mark anything that sounds like machine translation.

- [ ] **Forecast disclaimer** (rows `pspForecastDisclaimer`): says the model is experimental, that "assuming today's rate holds" was at least as accurate in X of Y runs, and that it is not shown to be better. No softening, no marketing tone.
- [ ] **Trust-rail sentences** (`tcpAnswer`, `tcpFaqA3`, `tcpTrustNote`, `tcpDepthNote`, `tcpTopScoredSub`): the $100K floor, ">1000% APY" exclusion, "listing bar, not a safety guarantee", "education, not financial advice", the 35% / 25% / 25% / 15% weights and "Top 5" are all present and mean the same as EN.
- [ ] **Risk wording** (`tokenHowRisk`, `pspRisk*`, `pspNotAdvice`): "you can lose money" is clear and not diluted. Should a local guarantee body (e.g. FGC in Brazil) be mentioned? EN names only the US FDIC/SIPC, so none was added.
- [ ] **Access labels** (`pspAccessOpen`, `pspAccessRestricted`, `tcpRestrictedAccessTitle`): "credenciados / acreditados" is the right term for a retail reader.
- [ ] **Titles and descriptions**: lead with the term people type ("Rendimento de USDC hoje", "Rendimiento de USDC hoy"). Do they read like search results, not translations? Is dropping "Best / Melhores / Mejores" acceptable?
- [ ] **Jargon**: "rendimento vs rentabilidade" (pt), "pronóstico vs previsión" (es), "tarifas vs taxas" (pt), "comisiones vs tarifas" (es), "redes" for chains, "permanência / permanencia do capital". Say which you would change, and we will apply it everywhere at once.
- [ ] **Register**: "você" (pt) and "tú" (es) throughout; no voseo, no Spain-only words. Anything that sounds Argentine, Mexican or Iberian to the wrong ear?
- [ ] **Plural and agreement**: spot-check pages with 1 pool, 1 chain, 1 token ("1 pool ativo atinge", "1 pool activo alcanza", "1 rede" / "1 red").
- [ ] **Numbers**: dots as decimal separators and "$" amounts are intentional (en-US pinned). Flag if you think it will confuse readers, but do not edit them in the dictionaries.
- [ ] **Anything still in English** in the visible content that is not a brand, ticker, protocol or chain name.
