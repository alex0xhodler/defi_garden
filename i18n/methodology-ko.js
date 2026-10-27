'use strict';

/**
 * i18n/methodology-ko.js - the Korean /ko/methodology page copy.
 *
 * Natural Korean (haeyo-che, the register of the static KO hub pages), written
 * for a Korean fintech reader, not translated word by word. It mirrors
 * methodology.html at the same PUBLIC level ("what, not how", CLAUDE.md): the
 * band names, the four pillars (each with one plain line, shown as a tier),
 * the 14-day low / central / high range, the trust rails, the data source, the
 * limitations and the education-not-advice note. No weights, cutoffs, formulas,
 * constants, model names or inputs. "DeFi Score", "TVL", "APY" and the band
 * names (AAA, AA, A, BBB, HIGH RISK) stay in Latin script.
 *
 * Consumed by generate-ko-static.js, which writes ko/methodology.html (a
 * generated output, never committed). The trust-rail figures are injected from
 * trust-rails.js so the page can never drift from the product constants.
 */

const META = {
  title: '방법론: DeFi Score와 14일 전망은 이렇게 만들어져요 | DeFi Garden',
  description: 'DeFi Garden이 0~100점 DeFi Score(수익률 안정성, 지속 가능성, 자본 유지력, 출금 유동성), AAA부터 HIGH RISK까지의 등급, 14일 수익률 전망 범위, 안전장치와 공개 검증 기록을 어떻게 다루는지 설명해요. 교육용이며 투자 조언이 아니에요.',
  ogDescription: 'DeFi Score가 무엇을 반영하는지, AAA부터 HIGH RISK까지의 등급, 14일 전망 범위, 안전장치, 공개 검증 기록이 있는 곳을 안내해요.',
  headline: '방법론: DeFi Score와 14일 수익률 전망은 이렇게 만들어져요',
  ldDescription: '0~100점 DeFi Score가 무엇을 반영하는지, AAA부터 HIGH RISK까지의 등급, 14일 수익률 전망 범위, 안전장치, 공개 검증 기록이 있는 곳을 설명해요.',
  datePublished: '2026-10-24',
  dateModified: '2026-10-27',
  byline: 'DeFi Garden 리서치 · 최종 업데이트 2026년 10월 27일 · 교육용이며 투자 조언이 아니에요.',
  nav: { search: '검색', stocks: '주식', methodology: '방법론', api: 'API', primary: '주요 메뉴', toc: '이 페이지의 목차' },
  breadcrumbHome: '홈',
  breadcrumbMethodology: '방법론',
  langSwitchLabel: '언어'
};

/** Inner HTML of <main>. `rails` = { tvlK: '100', apy: '1,000' } (en-US formatted). */
function mainHtml(rails) {
  return `
        <h1>${META.headline}</h1>
        <p class="meth-byline">${META.byline}</p>

        <p class="meth-lede">DeFi Garden은 점수를 매긴 모든 DeFi 수익률에 <strong>0~100점의 DeFi Score</strong>와 해당 금리의 <strong>14일 전망 범위</strong>를 함께 보여 줘요. 이 페이지에서는 점수가 무엇을 반영하는지, 어떤 안전장치가 있는지, 데이터는 어디서 오는지, 방법의 약점은 무엇인지 설명해요. 이 글은 &lsquo;무엇&rsquo;을 다루고 &lsquo;어떻게 계산하는지&rsquo;는 다루지 않아요. 정확한 가중치, 기준값, 모델 내부는 비공개 자산이에요.</p>

        <div class="meth-notice" role="note">
            <p><strong>신용등급이 아니에요.</strong> AAA, AA, A, BBB, HIGH RISK 등급은 DeFi Garden 자체 모델이 산출한 값이에요. 등록된 신용평가사가 부여한 신용등급이 아니며, 채무불이행 확률이나 프로토콜의 보안 수준을 나타내지도 않아요.</p>
        </div>

        <nav class="meth-toc" aria-label="${META.nav.toc}">
            <strong>${META.nav.toc}</strong>
            <ol>
                <li><a href="#what-it-is">DeFi Score란</a></li>
                <li><a href="#components">무엇을 반영하나요</a></li>
                <li><a href="#bands">등급</a></li>
                <li><a href="#forecast">14일 전망</a></li>
                <li><a href="#data">데이터 출처</a></li>
                <li><a href="#rails">안전장치</a></li>
                <li><a href="#accuracy">정확도는 어떻게 검증하나요</a></li>
                <li><a href="#coverage">대상 범위</a></li>
                <li><a href="#limitations">한계</a></li>
                <li><a href="#advice">교육용이며 투자 조언이 아니에요</a></li>
            </ol>
        </nav>

        <h2 id="what-it-is">1. DeFi Score란</h2>
        <p>DeFi Score는 풀 수익률의 <em>질</em>을 0부터 100까지 하나의 숫자로 요약한 값이에요. 금리가 앞으로 얼마나 안정적일지, 일시적인 인센티브가 아닌 실제 수수료에서 나오는 비중은 얼마인지, 예치금이 계속 머물 가능성이 높은지, 빠져나오기는 쉬운지를 봐요. 점수가 높을수록 좋아요.</p>
        <p><strong>수익률의 질을 보는 점수이지, 안전성 감사가 아니에요.</strong> 스마트 컨트랙트 감사, 해킹 이력, 오라클 설계, 관리자 키, 거버넌스, 담보, 큐레이터 위험에 관한 정보는 점수에 들어가지 않아요. 금리가 꾸준하고 수수료 기반이며 유동성이 깊은 풀도 높은 점수를 받고서 해킹당할 수 있어요. 풀 페이지에도 같은 안내가 있어요.</p>

        <h2 id="components">2. 무엇을 반영하나요</h2>
        <p>점수는 네 가지 지표를 합쳐서 만들어요. 각 지표는 수익률에 대한 서로 다른 질문이고, 숫자가 아니라 높음, 보통, 낮음 세 단계로 보여 줘요.</p>
        <div class="meth-table">
            <table>
                <thead><tr><th>지표</th><th>반영하는 것</th></tr></thead>
                <tbody>
                    <tr><td><strong>수익률 안정성</strong></td><td>전망 기간 동안 금리가 얼마나 꾸준할 것으로 보이는지, 그리고 금리가 떨어질 여지가 얼마나 되는지예요.</td></tr>
                    <tr><td><strong>지속 가능성</strong></td><td>수익률 중 일시적인 보상 인센티브가 아니라 실제 수수료에서 나오는 비중이 얼마인지, 금리가 어느 방향으로 가고 있는지예요.</td></tr>
                    <tr><td><strong>자본 유지력</strong></td><td>예치금이 풀을 떠나지 않고 계속 머물 가능성이 높은지예요.</td></tr>
                    <tr><td><strong>출금 유동성</strong></td><td>풀이 얼마나 깊은지, 그래서 포지션을 얼마나 쉽게 뺄 수 있는지예요.</td></tr>
                </tbody>
            </table>
        </div>
        <p>점수의 상당 부분이 전망에 기대고 있어서 전망의 품질이 곧 점수의 품질과 이어져요. <a href="#limitations">한계</a>를 함께 확인해 주세요.</p>

        <h2 id="bands">3. 등급</h2>
        <p>DeFi Score는 가장 높은 쪽부터 <strong>AAA</strong>, <strong>AA</strong>, <strong>A</strong>, <strong>BBB</strong>, <strong>HIGH RISK</strong> 다섯 등급으로 나뉘어요. 등급은 DeFi Garden 자체 모델의 산출값이에요. 등록된 신용평가사가 부여한 신용등급이 아니고, 채무불이행이나 손실 확률과 맞아떨어진다고 주장하지도 않아요.</p>

        <h2 id="forecast">4. 14일 전망</h2>
        <ul>
            <li><strong>하나의 숫자가 아니라 범위예요.</strong> 전망은 14일 동안의 범위로, 낮은 값, 중앙값, 높은 값 세 가지를 보여 줘요. 이 범위는 모든 경우가 아니라 대부분의 경우를 담도록 만든 거예요.</li>
            <li><strong>기간.</strong> 14일이에요. 그 이후에 어떻게 될지는 말해 주지 않아요.</li>
            <li><strong>실험 단계예요.</strong> 전망에는 실험적이라는 표시를 붙이고, 공개 검증 기록에서 실제로 어땠는지 보여 줘요.</li>
            <li><strong>스냅샷은 고정돼요.</strong> 전망 스냅샷은 하루에 한 번 기록되고 이후 수정하지 않아요. 그래서 전망은 나중에 실제로 일어난 일과만 비교할 수 있어요.</li>
        </ul>

        <h2 id="data">5. 데이터 출처</h2>
        <p>풀, APY, TVL, 기본 수익과 보상 수익의 구분은 <a href="https://api-docs.defillama.com/" target="_blank" rel="noopener noreferrer">DefiLlama</a> 수익률 API에서 가져와요. 이 값을 온체인에서 다시 측정하지는 않아요. DeFi Garden은 풀 금리와 TVL의 일별 이력도 자체적으로 쌓고 있어요.</p>

        <h2 id="rails">6. 안전장치</h2>
        <p>아래 안전장치는 DeFi Garden이 보여 주는 모든 값에 적용되며, 숫자를 좋아 보이게 하려고 완화하는 일은 없어요.</p>
        <ul>
            <li><strong>$${rails.tvlK}K TVL 기준.</strong> TVL이 $${rails.tvlFull} 미만인 풀은 작업 데이터에 넣지 않고, 기본 화면에도 보여 주지 않아요.</li>
            <li><strong>${rails.apy}% APY 이상치 한도.</strong> 총 APY(기본 수익 + 보상)가 ${rails.apy}%를 넘는 풀은 이상치로 봐요. 경고 표시를 붙이고, 정상 풀보다 아래로 정렬하며, 점수 풀 페이지와 검증 기록에서는 제외해요.</li>
            <li><strong>이상 징후 표시.</strong> 비정상적인 금리와 기준 미달 풀은 점수 속에 숨기지 않고 분명하게 표시해요.</li>
            <li><strong>접근 방식 표시.</strong> 풀 페이지에는 누구나 이용할 수 있는 풀인지, 제한된 풀(KYC, 적격 투자자 또는 적격 매수자 전용)인지 표시해요. 제한 프로젝트 목록을 직접 관리해서 반영해요.</li>
            <li><strong>모든 숫자는 데이터에서 나와요.</strong> 보여 주는 점수, 금리, 전망은 모두 데이터 파이프라인에서 계산한 값이고, 손으로 입력한 값은 없어요.</li>
        </ul>

        <h2 id="accuracy">7. 정확도는 어떻게 검증하나요</h2>
        <p>전망은 실제로 일어난 결과와 비교하고, 그 결과를 한 페이지에 공개해요. <a href="/forecast-accuracy">/forecast-accuracy</a>에서 확인할 수 있어요.</p>

        <h2 id="coverage">8. 대상 범위</h2>
        <p>목표는 DefiLlama에서 수익률이 있고 TVL이 $100K 이상인 모든 DeFi 풀에 점수를 매기는 거예요. 대출 시장, 볼트, 스테이킹, 유동성 풀, 토큰화된 실물 자산 등이 포함돼요. TVL 기준을 넘고 이력이 충분한 풀만 점수와 전망을 받아요. 이력이 부족한 풀은 추측해서 보여 주지 않고 점수를 비워 둬요. 대상 목록은 매일 빌드할 때 새로 고쳐져요. 점수는 <a href="/ko/pools">점수 풀 페이지</a>와 <a href="/mcp">API</a>에서 볼 수 있어요.</p>

        <h2 id="limitations">9. 한계</h2>
        <ul>
            <li><strong>안전성을 재는 값이 아니에요.</strong> 보안 관련 입력은 없어요. 감사, 해킹 이력, 오라클 설계, 관리자 키, 거버넌스, 담보 품질은 고려하지 않아요.</li>
            <li><strong>전망이 가장 약한 고리예요.</strong> 점수의 상당 부분이 전망에 달려 있는데, 자체 테스트에서 전망이 &lsquo;금리가 그대로 유지된다&rsquo;는 가정보다 확실히 낫다고 보기는 어려웠어요. 대부분의 DeFi 수익률은 14일 동안 거의 움직이지 않아요. 최신 상황은 검증 기록에서 확인해 주세요.</li>
            <li><strong>범위가 너무 좁을 수 있어요.</strong> 의도보다 적은 경우만 담는 범위는 풀이 실제보다 안정적이라는 인상을 줄 수 있어요.</li>
            <li><strong>일부 입력은 불완전해요.</strong> 어떤 풀에서 특정 신호를 구할 수 없으면 구할 수 있는 신호만으로 점수를 매겨요. 그래서 이런 풀들의 점수는 서로 가깝게 몰릴 수 있어요.</li>
            <li><strong>입력이 틀리면 결과도 틀려요.</strong> 금리와 TVL은 DefiLlama에서 와요. 상위 데이터의 오류, 오래된 데이터, 인센티브 변경이 그대로 반영될 수 있고, 안전장치는 가장 극단적인 경우만 걸러 내요.</li>
            <li><strong>짧은 기간, 특정 시점의 값이에요.</strong> 보상 발행은 끝날 수 있고, 금리는 다시 책정될 수 있고, 풀은 언제든 털릴 수 있어요.</li>
            <li><strong>검증 범위.</strong> 공개 검증 기록은 단일 자산 대출, 볼트, 스테이킹 상품을 대상으로 해요. 유동성 풀과 AMM은 점수는 매기지만 검증 기록에는 포함되지 않아요.</li>
            <li><strong>등급은 손실에 맞춰 보정한 값이 아니에요.</strong> 위의 등급 안내를 참고해 주세요.</li>
        </ul>

        <h2 id="advice">10. 교육용이며 투자 조언이 아니에요</h2>
        <p>DeFi Garden은 교육용 분석 도구예요. 점수, 등급, 전망은 수익률의 질에 대한 모델 산출값이지, 매수, 매도, 예치를 권하는 것이 아니고 미래 금리나 안전을 보장하지도 않아요. DeFi에는 원금 전액을 잃을 위험이 있어요. 직접 조사하시고, 잃어도 괜찮은 금액을 넘겨서 예치하지 마세요. AAA부터 HIGH RISK까지의 등급은 등록된 신용평가사가 부여한 신용등급이 아니에요.</p>
`;
}

/** Footer HTML (inside <footer class="meth-footer">). */
function footerHtml() {
  return `
        <p>데이터 제공: <a href="https://api-docs.defillama.com/" target="_blank" rel="noopener noreferrer">DefiLlama API</a>. 교육용이며 투자 조언이 아니에요.</p>
        <p><a href="/ko/tokens">토큰 둘러보기</a> · <a href="/ko/chains">체인 둘러보기</a> · <a href="/stocks?lang=ko">주식</a> · <a href="/ko/methodology">방법론</a> · <a href="/mcp">API</a></p>
`;
}

module.exports = { META, mainHtml, footerHtml };
