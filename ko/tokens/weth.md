# WETH 디파이 수익률

*DefiLlama 데이터 생성 시점 검증: September 11, 2026. 수익률은 지속적으로 변동합니다.*

현재 WETH의 가장 높은 정직한 수익률은 Base의 uniswap-v3에서 55.83%이며, $100K TVL 기준을 넘는 1,756개 풀 중 최고예요. 수익률은 DefiLlama의 실시간 데이터이며 이상 수치(APY 1000% 초과) 풀은 제외했어요.

| 프로토콜 | 체인 | APY | TVL |
|---|---|---|---|
| [aave-v3 →](https://www.defi.garden/?pool=e880e828-ca59-4ec6-8d4f-27182a4dc23d&src=seo_token) | Ethereum | 1.45% | $736.79M |
| [sparklend →](https://www.defi.garden/?pool=24195b31-d749-445f-bf9e-b65aa025ebdd&src=seo_token) | Ethereum | 1.48% | $268.15M |
| [uniswap-v2 →](https://www.defi.garden/?pool=8ac917c6-12fa-49df-aa0b-ced2ebe54e91&src=seo_token) | Ethereum | 0.01% | $140.37M |
| [uniswap-v3 →](https://www.defi.garden/?pool=b99bcdf5-1350-4269-981e-0e9b5cccb007&src=seo_token) | Base | 55.83% | $117.87M |
| [uniswap-v3 →](https://www.defi.garden/?pool=fc9f488e-8183-416f-a61e-4e5c571d4395&src=seo_token) | Ethereum | 36.98% | $109.21M |
| [uniswap-v3 →](https://www.defi.garden/?pool=665dc8bc-c79d-4800-97f7-304bf368e547&src=seo_token) | Ethereum | 11.45% | $105.68M |
| [euler-v2 →](https://www.defi.garden/?pool=951e4e49-9760-49a3-aea9-bd832384219f&src=seo_token) | Monad | 2.69% | $60.66M |
| [curve-dex →](https://www.defi.garden/?pool=077b47b8-76c9-4081-97f2-9ca43ebdbaa0&src=seo_token) | Ethereum | 1.49% | $56.37M |

## WETH 디파이 수익률 생성 원리

WETH의 수익률은 주로 네 가지 온체인 메커니즘을 통해 발생합니다: 머니마켓에서 대출자가 지불하는 대출 이자 스프레드, 자동화 마켓 메이커(AMM) 유동성 공급자에게 분배되는 거래 수수료, 해당 자산의 합의 또는 리퀴드 스테이킹 보상, 그리고 유동성을 유치하기 위한 프로토콜 인센티브입니다.

총 APY는 두 가지 요소로 나뉩니다: 기초 자산으로 지급되는 대출 이자나 거래 수수료에서 발생하는 기본 수익률(apyBase)과, 기초 자산과 별개로 시세가 변동하는 거버넌스 또는 보상 토큰으로 지급되는 리워드 수익률(apyReward)입니다.

모든 디파이 수익률에는 고유한 위험이 따릅니다. 스마트 컨트랙트 취약점, 프로토콜 경제 모델 공격, 스테이블코인 디페그, 청산 연쇄 반응으로 인해 원금 손실이 발생할 수 있습니다. 디파이 상품은 은행 예금이 아니며 FDIC, SIPC 또는 정부 기관의 예금자 보호를 받지 않습니다. 제공되는 정보는 교육 목적이며 금융 자문이 아닙니다.

<!-- rate-stability:ranked -->
## APY 이력 기반 수익률 안정성

APY 이력만 기준으로 비교한 WETH의 변동성 낮은 후보는 Ethereum의 uniswap-v2, APY 0.01%, TVL $140.37M, https://www.defi.garden/?pool=8ac917c6-12fa-49df-aa0b-ced2ebe54e91&src=seo_token; Ethereum의 aave-v3, APY 1.45%, TVL $736.79M, https://www.defi.garden/?pool=e880e828-ca59-4ec6-8d4f-27182a4dc23d&src=seo_token; Ethereum의 sparklend, APY 1.48%, TVL $268.15M, https://www.defi.garden/?pool=24195b31-d749-445f-bf9e-b65aa025ebdd&src=seo_token; Monad의 euler-v2, APY 2.69%, TVL $60.66M, https://www.defi.garden/?pool=951e4e49-9760-49a3-aea9-bd832384219f&src=seo_token; Ethereum의 curve-dex, APY 1.49%, TVL $56.37M, https://www.defi.garden/?pool=077b47b8-76c9-4081-97f2-9ca43ebdbaa0&src=seo_token; Ethereum의 uniswap-v3, APY 11.45%, TVL $105.68M, https://www.defi.garden/?pool=665dc8bc-c79d-4800-97f7-304bf368e547&src=seo_token; Ethereum의 uniswap-v3, APY 36.98%, TVL $109.21M, https://www.defi.garden/?pool=fc9f488e-8183-416f-a61e-4e5c571d4395&src=seo_token; Base의 uniswap-v3, APY 55.83%, TVL $117.87M, https://www.defi.garden/?pool=b99bcdf5-1350-4269-981e-0e9b5cccb007&src=seo_token예요. 이 비교는 프로토콜, 익스플로잇, 디페그, 유동성, 거버넌스 또는 원금 손실 위험을 측정하지 않아요.

| 순위 | 프로토콜 | 체인 | APY | TVL |
|---|---|---|---|---|
| 1 | [uniswap-v2 →](https://www.defi.garden/?pool=8ac917c6-12fa-49df-aa0b-ced2ebe54e91&src=seo_token) | Ethereum | 0.01% | $140.37M |
| 2 | [aave-v3 →](https://www.defi.garden/?pool=e880e828-ca59-4ec6-8d4f-27182a4dc23d&src=seo_token) | Ethereum | 1.45% | $736.79M |
| 3 | [sparklend →](https://www.defi.garden/?pool=24195b31-d749-445f-bf9e-b65aa025ebdd&src=seo_token) | Ethereum | 1.48% | $268.15M |
| 4 | [euler-v2 →](https://www.defi.garden/?pool=951e4e49-9760-49a3-aea9-bd832384219f&src=seo_token) | Monad | 2.69% | $60.66M |
| 5 | [curve-dex →](https://www.defi.garden/?pool=077b47b8-76c9-4081-97f2-9ca43ebdbaa0&src=seo_token) | Ethereum | 1.49% | $56.37M |
| 6 | [uniswap-v3 →](https://www.defi.garden/?pool=665dc8bc-c79d-4800-97f7-304bf368e547&src=seo_token) | Ethereum | 11.45% | $105.68M |
| 7 | [uniswap-v3 →](https://www.defi.garden/?pool=fc9f488e-8183-416f-a61e-4e5c571d4395&src=seo_token) | Ethereum | 36.98% | $109.21M |
| 8 | [uniswap-v3 →](https://www.defi.garden/?pool=b99bcdf5-1350-4269-981e-0e9b5cccb007&src=seo_token) | Base | 55.83% | $117.87M |

수익률은 DefiLlama의 실시간 데이터예요. 이 페이지의 풀은 최소 TVL $100K 기준을 충족하고 이상 수치는 제외했어요 — 이는 이 페이지의 게재 기준일 뿐, 안전을 보장하는 것은 아니에요. 투자 조언이 아닌 교육 목적의 정보예요.

## 이 수익률은 어떻게 움직였을까요

WETH 풀은 여기 8개가 있고, 3개 체인에서 APY가 0.01%부터 55.83%까지 나타나요 — 같은 토큰이라도 어떤 프로토콜과 체인을 고르느냐에 따라 수익률이 달라져요.

8개 풀 중 8개는 믿을 수 있는 30일 평균값이 있고, 중앙값은 2.43%예요 — 오늘 수익률과 비교하면 꾸준한 편인지 일시적으로 튄 값인지 가늠할 수 있어요.

8개 풀 중 2개는 기본 금리에 인센티브·리워드 APY가 더해져 있어요. 인센티브 수익률은 보상 프로그램이 줄어들면서 시간이 지나면 낮아지는 경향이 있으니, 기본 금리가 더 오래가는 숫자예요.

8개 풀 중 4개는 비영구적 손실(IL) 위험이 있어요 — 두 자산을 맞춰 넣는 포지션은 수익이 나는 중에도 그냥 들고 있는 것보다 가치가 줄어들 수 있어요.

| 프로토콜 | APY | 30일 평균 APY | 수익 구성 |
|---|---|---|---|
| aave-v3 | 1.45% | 1.46% | 기본 금리 |
| sparklend | 1.48% | 1.65% | 기본 금리 |
| uniswap-v2 | 0.01% | 0.01% | 기본 금리 |
| uniswap-v3 | 55.83% | 67.07% | 기본 금리 |
| uniswap-v3 | 36.98% | 42.33% | 기본 금리 |
| uniswap-v3 | 11.45% | 14.40% | 기본 금리 |
| euler-v2 | 2.69% | 2.96% | 인센티브 52.64% |
| curve-dex | 1.49% | 1.89% | 인센티브 100.00% |

30일 평균은 DefiLlama의 데이터를 그대로 가져오며, 이 페이지의 다른 모든 숫자와 같은 안전 기준을 통과했을 때만 표시돼요 — 대시(—)는 숨긴 게 아니라 그 기준을 통과하지 못했다는 뜻이에요. 여기 풀은 모두 최소 TVL $100K 기준을 충족해요. 수익률은 매일 바뀌니 이건 예측이 아니라 지금 이 순간의 스냅샷이에요.

## 자주 묻는 질문

### 오늘 WETH의 가장 높은 수익률은 얼마인가요?

DefiLlama 실시간 데이터 기준, Base의 uniswap-v3에서 APY 55.83%예요.

### WETH 풀 중 TVL 기준을 통과한 풀은 몇 개인가요?

이 페이지의 $100K TVL 기준을 통과한 실시간 풀은 1,756개이며, 합산 TVL은 $5.52B예요.

### 이 수익률은 안전한가요?

이 페이지에 표시된 풀은 최소 TVL $100K 기준을 충족하고 이상 수치(APY 1000% 초과)인 풀을 제외했어요 — 이는 이 페이지의 게재 기준일 뿐, 안전을 보장하는 것은 아니에요. 이는 투자 조언이 아닌 교육 목적의 정보이며, 표시된 수익률과 무관하게 디파이에는 스마트 컨트랙트 및 시장 위험이 따라요.

### WETH 풀 중 APY 이력이 가장 안정적인 후보는 무엇인가요?

APY 이력만 기준으로 비교한 WETH의 변동성 낮은 후보는 Ethereum의 uniswap-v2, APY 0.01%, TVL $140.37M, https://www.defi.garden/?pool=8ac917c6-12fa-49df-aa0b-ced2ebe54e91&src=seo_token; Ethereum의 aave-v3, APY 1.45%, TVL $736.79M, https://www.defi.garden/?pool=e880e828-ca59-4ec6-8d4f-27182a4dc23d&src=seo_token; Ethereum의 sparklend, APY 1.48%, TVL $268.15M, https://www.defi.garden/?pool=24195b31-d749-445f-bf9e-b65aa025ebdd&src=seo_token; Monad의 euler-v2, APY 2.69%, TVL $60.66M, https://www.defi.garden/?pool=951e4e49-9760-49a3-aea9-bd832384219f&src=seo_token; Ethereum의 curve-dex, APY 1.49%, TVL $56.37M, https://www.defi.garden/?pool=077b47b8-76c9-4081-97f2-9ca43ebdbaa0&src=seo_token; Ethereum의 uniswap-v3, APY 11.45%, TVL $105.68M, https://www.defi.garden/?pool=665dc8bc-c79d-4800-97f7-304bf368e547&src=seo_token; Ethereum의 uniswap-v3, APY 36.98%, TVL $109.21M, https://www.defi.garden/?pool=fc9f488e-8183-416f-a61e-4e5c571d4395&src=seo_token; Base의 uniswap-v3, APY 55.83%, TVL $117.87M, https://www.defi.garden/?pool=b99bcdf5-1350-4269-981e-0e9b5cccb007&src=seo_token예요. 이 비교는 프로토콜, 익스플로잇, 디페그, 유동성, 거버넌스 또는 원금 손실 위험을 측정하지 않아요.

## 관련 토큰

- [STETH](https://www.defi.garden/ko/tokens/steth)
- [WEETH](https://www.defi.garden/ko/tokens/weeth)
- [WBETH](https://www.defi.garden/ko/tokens/wbeth)
- [USDC](https://www.defi.garden/ko/tokens/usdc)
- [WSTETH](https://www.defi.garden/ko/tokens/wsteth)
- [CBBTC](https://www.defi.garden/ko/tokens/cbbtc)

## 이용 가능한 체인

- [Ethereum](https://www.defi.garden/ko/chains/ethereum)
- [Base](https://www.defi.garden/ko/chains/base)
- [Monad](https://www.defi.garden/ko/chains/monad)

## 마지막 업데이트: September 11, 2026
