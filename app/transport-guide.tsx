"use client";

import { Bus, CreditCard, ExternalLink, Info, TrainFront } from "lucide-react";

function wonText(yen: number, rate: number) {
  return `약 ${(Math.round(yen * rate / 10) * 10).toLocaleString()}원`;
}

function wonPrice(yen: number, rate: number | null) {
  if (!rate) return null;
  return <small className="won-equivalent">{wonText(yen, rate)}</small>;
}

export default function TransportGuide({ yenToKrwRate }: { yenToKrwRate: number | null }) {
  return <div className="transport-guide">
    <section className="guide-callout">
      <Info size={18} />
      <div><strong>같은 ‘지하철’처럼 보여도 운영회사가 다르면 별도 요금일 수 있어요.</strong><p>오사카에서는 Osaka Metro, JR, 난카이, 한큐, 한신, 긴테쓰, 게이한 등이 각각 운임을 계산합니다. ICOCA는 결제수단이지 모든 회사의 무료 환승권은 아닙니다.</p></div>
    </section>

    <section className="fare-guide-card">
      <div className="fare-guide-title"><TrainFront size={20} /><div><strong>Osaka Metro</strong><span>성인 일반 운임 · 거리 기준</span></div></div>
      <div className="fare-grid"><span>3km 이하<strong>190엔</strong>{wonPrice(190, yenToKrwRate)}</span><span>3~7km<strong>240엔</strong>{wonPrice(240, yenToKrwRate)}</span><span>7~13km<strong>290엔</strong>{wonPrice(290, yenToKrwRate)}</span><span>13~19km<strong>340엔</strong>{wonPrice(340, yenToKrwRate)}</span><span>19km 초과<strong>390엔</strong>{wonPrice(390, yenToKrwRate)}</span></div>
      <p>최단 경로의 거리 구간을 기준으로 계산됩니다. 다른 철도 회사 노선으로 넘어가면 해당 회사 운임이 추가될 수 있습니다.</p>
      <a href="https://subway.osakametro.co.jp/guide/fare/fare/price.php/1000" target="_blank" rel="noreferrer">공식 운임표 확인 <ExternalLink size={13} /></a>
    </section>

    <section className="fare-guide-card">
      <div className="fare-guide-title"><Bus size={20} /><div><strong>Osaka City Bus</strong><span>일반 노선 성인 균일 운임</span></div></div>
      <div className="single-fare"><div><strong>210엔</strong>{wonPrice(210, yenToKrwRate)}</div><span>하차할 때 결제 · 일부 특수 노선 제외</span></div>
      <p>ICOCA 등 전국 상호 이용 IC 카드를 사용할 수 있습니다. 다른 버스 회사나 공항버스는 요금 체계가 다릅니다.</p>
      <a href="https://bus.osakametro.co.jp/en/guide/usage/cat/how_to_ride_the_bus.php" target="_blank" rel="noreferrer">공식 탑승·요금 안내 <ExternalLink size={13} /></a>
    </section>

    <section className="fare-guide-card">
      <div className="fare-guide-title"><CreditCard size={20} /><div><strong>ICOCA와 환승</strong><span>간편 결제 카드</span></div></div>
      <ul><li>개찰구에서 승차·하차 시 터치하면 해당 운영사 운임이 자동 차감됩니다.</li><li>서울처럼 모든 대중교통 환승이 하나의 통합요금으로 묶이는 구조는 아닙니다.</li><li>같은 역에서 운영회사가 바뀌면 개찰구를 나갔다가 다시 들어가며 운임이 각각 붙을 수 있습니다.</li><li>잔액은 최대 20,000엔까지 충전할 수 있고, JR·사철·지하철·버스에서 폭넓게 사용할 수 있습니다.</li></ul>
      <a href="https://www.westjr.co.jp/global/en/howto/icoca/area/" target="_blank" rel="noreferrer">ICOCA 사용 범위 <ExternalLink size={13} /></a>
    </section>

    <section className="fare-guide-card pass-card">
      <strong>많이 탈 예정이라면 1일권과 비교하세요</strong>
      <div><span>Enjoy Eco Card</span><strong>평일 820엔 · 토/일/공휴일 620엔</strong>{yenToKrwRate && <small className="won-equivalent">평일 {wonText(820, yenToKrwRate)} · 휴일 {wonText(620, yenToKrwRate)}</small>}<small>Osaka Metro·Osaka City Bus 1일 무제한(일부 구간 제외)</small></div>
      <p>예를 들어 평일에 240엔 구간을 4번 타면 960엔이므로 1일권이 더 저렴할 수 있습니다. JR이나 다른 사철은 포함되지 않습니다.</p>
      <a href="https://subway-tr.osakametro.co.jp/en/guide/page/enjoy-eco.php" target="_blank" rel="noreferrer">공식 1일권 안내 <ExternalLink size={13} /></a>
    </section>

    <p className="guide-updated">운임 정보 확인일: 2026년 9월 28일 · 실제 승차 전 공식 경로 검색에서 최종 금액을 확인하세요.</p>
  </div>;
}
