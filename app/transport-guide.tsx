"use client";

import { Bus, CreditCard, ExternalLink, Info, MapPinned, Plane, Ticket, TrainFront } from "lucide-react";

function wonText(yen: number, rate: number) {
  return `약 ${(Math.round(yen * rate / 10) * 10).toLocaleString()}원`;
}

function wonPrice(yen: number, rate: number | null) {
  if (!rate) return null;
  return <small className="won-equivalent">{wonText(yen, rate)}</small>;
}

const networks = [
  { name: "Osaka Metro", color: "#e5171f", lines: "미도스지 · 다니마치 · 요츠바시 · 주오 · 센니치마에 · 사카이스지 · 나가호리쓰루미료쿠치 · 이마자토스지 · 뉴트램", use: "오사카 시내 이동", href: "https://subway-tr.osakametro.co.jp/en/guide/routemap.php" },
  { name: "JR West", color: "#2876c8", lines: "오사카 순환선 · 유메사키선 · JR 교토/고베선 · 한와선 · 간사이공항선 · 야마토지선", use: "USJ·교토·고베·나라·공항", href: "https://www.westjr.co.jp/travel-information/en/tickets-passes/jrwest-rail-pass/kansai/" },
  { name: "Nankai", color: "#f58220", lines: "난카이 본선 · 공항선 · 고야선 · 라피트 α/β", use: "난바↔간사이공항·고야산", href: "https://www.nankai.co.jp/en_railway/traffic/railmap.html" },
  { name: "Hankyu", color: "#7b1f35", lines: "교토선 · 고베선 · 다카라즈카선", use: "우메다↔교토·고베", href: "https://www.hankyu.co.jp/en/station/index.html" },
  { name: "Hanshin", color: "#ed781d", lines: "본선 · 한신 난바선", use: "난바/우메다↔고베", href: "https://www.hanshin.co.jp/global/en/map/" },
  { name: "Kintetsu", color: "#b5292f", lines: "나라선 · 오사카선 · 미나미오사카선 · 교토선", use: "난바↔나라·이세·나고야", href: "https://www.kintetsu.co.jp/foreign/english/ticket/" },
  { name: "Keihan", color: "#1b8b54", lines: "게이한 본선 · 나카노시마선 · 우지선", use: "요도야바시↔교토 동부", href: "https://www.keihan.co.jp/travel/en/trains/passes-for-visitors-to-japan/kyoto-osaka.html" },
];

export default function TransportGuide({ yenToKrwRate }: { yenToKrwRate: number | null }) {
  return <div className="transport-guide">
    <section className="guide-callout">
      <Info size={18} />
      <div><strong>같은 ‘지하철’처럼 보여도 운영회사가 다르면 별도 요금일 수 있어요.</strong><p>ICOCA는 여러 회사에서 쓰는 결제수단이지 무료 환승권이 아닙니다. 패스도 표시된 운영사와 구간에서만 유효합니다.</p></div>
    </section>

    <section className="fare-guide-card network-card">
      <div className="fare-guide-title"><MapPinned size={20} /><div><strong>오사카·간사이 노선 한눈에 보기</strong><span>여행자가 자주 쓰는 운영사와 주요 노선</span></div></div>
      <a className="network-map-link" href="https://www.hanshin.co.jp/global/en/pdf/rosenmap.pdf" target="_blank" rel="noreferrer">간사이 통합 철도 노선도 열기 (PDF) <ExternalLink size={13} /></a>
      <div className="network-list">
        {networks.map(network => <article key={network.name} className="network-row">
          <i style={{ backgroundColor: network.color }} />
          <div><strong>{network.name}</strong><span>{network.lines}</span><small>{network.use}</small></div>
          <a href={network.href} target="_blank" rel="noreferrer" aria-label={`${network.name} 공식 노선 안내`}>공식 안내 <ExternalLink size={12} /></a>
        </article>)}
      </div>
      <p>색은 운영사 구분용입니다. 실제 노선색·직통운전·정차역은 위 공식 노선도에서 확인하세요.</p>
    </section>

    <section className="fare-guide-card">
      <div className="fare-guide-title"><TrainFront size={20} /><div><strong>Osaka Metro</strong><span>성인 일반 운임 · 거리 기준</span></div></div>
      <div className="fare-grid"><span>3km 이하<strong>190엔</strong>{wonPrice(190, yenToKrwRate)}</span><span>3~7km<strong>240엔</strong>{wonPrice(240, yenToKrwRate)}</span><span>7~13km<strong>290엔</strong>{wonPrice(290, yenToKrwRate)}</span><span>13~19km<strong>340엔</strong>{wonPrice(340, yenToKrwRate)}</span><span>19km 초과<strong>390엔</strong>{wonPrice(390, yenToKrwRate)}</span></div>
      <p>최단 경로의 거리 구간을 기준으로 계산됩니다. 다른 철도 회사 노선으로 넘어가면 해당 회사 운임이 추가될 수 있습니다.</p>
      <a href="https://subway.osakametro.co.jp/guide/fare/fare/price.php" target="_blank" rel="noreferrer">공식 운임표 확인 <ExternalLink size={13} /></a>
    </section>

    <section className="fare-guide-card">
      <div className="fare-guide-title"><Bus size={20} /><div><strong>Osaka City Bus</strong><span>일반 노선 성인 균일 운임</span></div></div>
      <div className="single-fare"><div><strong>210엔</strong>{wonPrice(210, yenToKrwRate)}</div><span>하차할 때 결제 · 일부 특수 노선 제외</span></div>
      <p>ICOCA 등 전국 상호 이용 IC 카드를 사용할 수 있습니다. 다른 버스 회사나 공항버스는 요금 체계가 다릅니다.</p>
      <a href="https://bus.osakametro.co.jp/en/guide/usage/cat/how_to_ride_the_bus.php" target="_blank" rel="noreferrer">공식 탑승·요금 안내 <ExternalLink size={13} /></a>
    </section>

    <section className="fare-guide-card airport-card">
      <div className="fare-guide-title"><Plane size={20} /><div><strong>간사이공항 ↔ 난바: 난카이 라피트</strong><span>Osaka Metro가 아닌 난카이전철의 전 좌석 지정 공항특급</span></div></div>
      <div className="airport-fares">
        <div><span>레귤러 시트 · 편도</span><strong>1,410엔</strong>{wonPrice(1410, yenToKrwRate)}</div>
        <div><span>슈퍼 시트 · 편도</span><strong>1,590엔</strong>{wonPrice(1590, yenToKrwRate)}</div>
      </div>
      <ul><li>라피트 α와 β는 정차역이 다릅니다. 시간표에서 탑승 열차를 확인하세요.</li><li>JR 특급 하루카는 신오사카·교토 방향에 편리하며, JR Kansai Area Pass에 지정석 이용이 포함됩니다.</li><li>난카이 공항급행은 별도 특급권 없이 이용하지만 좌석 지정이 아닙니다.</li></ul>
      <a href="https://www.nankai.co.jp/en_railway/ticket/rapit" target="_blank" rel="noreferrer">라피트 공식 요금·구매 안내 <ExternalLink size={13} /></a>
    </section>

    <section className="fare-guide-card">
      <div className="fare-guide-title"><CreditCard size={20} /><div><strong>ICOCA와 환승</strong><span>간편 결제 카드</span></div></div>
      <ul><li>개찰구에서 승차·하차 시 터치하면 해당 운영사 운임이 자동 차감됩니다.</li><li>서울처럼 모든 대중교통 환승이 하나의 통합요금으로 묶이는 구조는 아닙니다.</li><li>같은 역에서 운영회사가 바뀌면 개찰구를 나갔다가 다시 들어가며 운임이 각각 붙을 수 있습니다.</li><li>잔액은 최대 20,000엔까지 충전할 수 있고, JR·사철·지하철·버스에서 폭넓게 사용할 수 있습니다.</li></ul>
      <a href="https://www.westjr.co.jp/global/en/howto/icoca/area/" target="_blank" rel="noreferrer">ICOCA 사용 범위 <ExternalLink size={13} /></a>
    </section>

    <section className="fare-guide-card pass-comparison">
      <div className="fare-guide-title"><Ticket size={20} /><div><strong>도시권 패스 비교</strong><span>오사카 시내 중심 · 성인 기준</span></div></div>
      <div className="pass-list">
        <article><div><strong>Enjoy Eco Card</strong><span className="status-badge">시내 기본</span></div><b>평일 820엔 · 휴일 620엔</b>{yenToKrwRate && <small>{wonText(820, yenToKrwRate)} / {wonText(620, yenToKrwRate)}</small>}<p>Metro + City Bus 1일. JR·사철 제외.</p></article>
        <article><div><strong>ONE KANSAI Osaka Smart Access</strong><span className="status-badge">JR 포함</span></div><b>1일 1,000엔</b>{wonPrice(1000, yenToKrwRate)}<p>Metro 전선 + 오사카 순환선·유메사키선 등 지정 JR 시내 구간.</p></article>
        <article><div><strong>Metro 26시간 / 48시간권</strong><span className="status-badge expiring">9/30 종료</span></div><b>1,000엔 / 1,700엔</b>{yenToKrwRate && <small>{wonText(1000, yenToKrwRate)} / {wonText(1700, yenToKrwRate)}</small>}<p>Metro 전선. 버스 제외. 2026-09-30까지 사용 가능.</p></article>
        <article><div><strong>Metro + 기타큐코 1일권</strong></div><b>1,500엔</b>{wonPrice(1500, yenToKrwRate)}<p>미노오·센리추오 방면까지. 버스·한큐 제외.</p></article>
        <article><div><strong>게이한 + Osaka Metro 1일권</strong><span className="status-badge">교토 동부</span></div><b>2,160엔</b>{wonPrice(2160, yenToKrwRate)}<p>Metro·City Bus + 게이한 전선(오쓰선 제외).</p></article>
        <article><div><strong>Osaka Amazing Pass</strong><span className="status-badge">관광시설</span></div><b>1일 3,500엔 · 2일 5,000엔</b>{yenToKrwRate && <small>{wonText(3500, yenToKrwRate)} / {wonText(5000, yenToKrwRate)}</small>}<p>시내 지정 철도·버스와 약 40개 관광시설. 전 노선 무제한권은 아님.</p></article>
      </div>
      <a href="https://subway.osakametro.co.jp/en/guide/fare/category_digital_tickets/digital_tickets/digital_joshaken.php" target="_blank" rel="noreferrer">Osaka Metro 공식 패스 조건 확인 <ExternalLink size={13} /></a>
    </section>

    <section className="fare-guide-card pass-comparison">
      <div className="fare-guide-title"><Ticket size={20} /><div><strong>간사이 광역·운영사 패스</strong><span>교토·고베·나라까지 움직일 때</span></div></div>
      <div className="pass-list">
        <article><div><strong>JR West Kansai Area Pass</strong><span className="status-badge">하루카 포함</span></div><b>1/2/3/4일 · 2,800/4,800/5,800/7,000엔</b><p>지정 JR 구간 + 간사이공항 특급 하루카 지정석. 신칸센 제외.</p><a href="https://www.westjr.co.jp/travel-information/en/tickets-passes/jrwest-rail-pass/kansai/" target="_blank" rel="noreferrer">공식 안내 <ExternalLink size={12} /></a></article>
        <article><div><strong>KANSAI RAILWAY PASS LITE</strong><span className="status-badge expiring">기간 한정</span></div><b>2일 5,200엔 · 3일 6,500엔</b><p>주요 사철·지하철. JR·버스·일부 노선 제외. 2026-09-30 판매 종료.</p><a href="https://www.surutto.com/kansai_rwpl/en/krp.html" target="_blank" rel="noreferrer">공식 안내 <ExternalLink size={12} /></a></article>
        <article><div><strong>Kintetsu Rail Pass</strong><span className="status-badge">나라·이세</span></div><b>1/2/5일 · 1,900/3,700/4,900엔</b><p>5일 plus 6,700엔. 특급열차는 별도 특급권 필요.</p><a href="https://www.kintetsu.co.jp/foreign/english/ticket/" target="_blank" rel="noreferrer">공식 안내 <ExternalLink size={12} /></a></article>
        <article><div><strong>Keihan Kyoto-Osaka Pass</strong><span className="status-badge">교토</span></div><b>1일 1,650엔 · 24시간 1,850엔</b><p>게이한 지정 구간. Osaka Metro는 포함되지 않는 상품.</p><a href="https://www.keihan.co.jp/travel/en/trains/passes-for-visitors-to-japan/kyoto-osaka.html" target="_blank" rel="noreferrer">공식 안내 <ExternalLink size={12} /></a></article>
        <article><div><strong>Randen All-Day Pass</strong><span className="status-badge">교토 시내</span></div><b>1일 700엔</b>{wonPrice(700, yenToKrwRate)}<p>아라시야마·기타노 방면 란덴 전차 전선.</p></article>
      </div>
    </section>

    <section className="pass-tip">
      <strong>어떤 걸 사야 할까요?</strong>
      <ol><li>하루 이동 경로를 먼저 만든 뒤 운영사 이름을 확인합니다.</li><li>일반운임 합계와 패스 가격을 비교합니다.</li><li>공항특급 지정석·관광시설 포함 여부와 제외 노선을 확인합니다.</li></ol>
    </section>

    <p className="guide-updated">운임·판매 정보 확인일: 2026년 9월 29일 · 환율은 화면 상단의 현재 환율 기준 예상치입니다. 실제 승차 전 공식 안내에서 가격·판매기간·이용구간을 다시 확인하세요.</p>
  </div>;
}
