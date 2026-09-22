"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Copy, LogOut, MapPin, Plus, Search, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MapView from "./map-view";

type Place = { id: string; sourceId?: string; name: string; address: string; category: string; lat: number; lon: number; openingHours: string; menuUrl: string; websiteUrl: string; notes: string; day: number | null; position: number };
type SearchPlace = Omit<Place, "id" | "notes" | "day" | "position">;
type Trip = { id: string; title: string; createdAt?: string; placeCount?: number };
type Access = "owner" | "edit" | "view";
type ApiResponse = { error?: string; user?: { id: string; email: string } | null; trips?: Trip[]; trip?: Trip; places?: Place[]; access?: Access; legacy?: boolean; token?: string; role?: string };
const categories: Record<string, string> = { place: "장소", food: "가게", stay: "숙소" };
const dayLabel = (day: number | null) => day ? `${day}일차` : "미정";

async function api(path: string, init?: RequestInit): Promise<ApiResponse> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json() as ApiResponse;
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

export default function TripBoard() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [myTrips, setMyTrips] = useState<Trip[]>([]);
  const [boardId, setBoardId] = useState("");
  const [shareToken, setShareToken] = useState("");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPlace[]>([]);
  const [searchProvider, setSearchProvider] = useState("");
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Place | null>(null);
  const [activeDay, setActiveDay] = useState("all");
  const [manual, setManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null);

  const boardPath = useCallback((id: string, token: string, suffix = "") => {
    const url = new URL(`/api/board${suffix}`, window.location.origin);
    if (id) url.searchParams.set("id", id);
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    return { path: `${url.pathname}${url.search}`, headers };
  }, []);

  const loadBoard = useCallback(async (id: string, token: string) => {
    const target = boardPath(id, token);
    const data = await api(target.path, { headers: target.headers });
    setBoardId(id); setShareToken(token); setTrip(data.trip || null); setPlaces(data.places || []); setAccess(data.access || null); setLegacy(!!data.legacy);
    setDraft(null); setResults([]); setActiveDay("all");
    return data;
  }, [boardPath]);

  const loadTrips = useCallback(async () => {
    const data = await api("/api/board?list=1");
    setMyTrips(data.trips || []);
    return data.trips || [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const auth = await api("/api/auth");
        if (cancelled) return;
        setUser(auth.user || null);
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const id = hash.get("board") || "";
        const token = hash.get("trip") || (!id ? window.localStorage.getItem("osaka-trip-token") || "" : "");
        let opened = false;
        if (token) {
          try { await loadBoard("", token); opened = true; }
          catch (cause) {
            if (hash.get("trip")) throw cause;
            window.localStorage.removeItem("osaka-trip-token");
          }
        }
        if (auth.user) {
          const trips = await loadTrips();
          if (!opened && trips.length) await loadBoard(id && trips.some(item => item.id === id) ? id : trips[0].id, "");
        }
      } catch (cause) { if (!cancelled) setMessage((cause as Error).message); }
      finally { if (!cancelled) setAuthChecked(true); }
    })();
    return () => { cancelled = true; };
  }, [loadBoard, loadTrips]);

  const reload = useCallback(async () => {
    if (!boardId && !shareToken) return null;
    const target = boardPath(boardId, shareToken);
    const data = await api(target.path, { headers: target.headers });
    setTrip(data.trip || null); setPlaces(data.places || []); setAccess(data.access || null); setLegacy(!!data.legacy);
    return data;
  }, [boardId, shareToken, boardPath]);
  const writable = access === "owner" || access === "edit";
  const visiblePlaces = useMemo(() => activeDay === "all" ? places : places.filter(place => activeDay === "none" ? place.day === null : place.day === Number(activeDay)), [places, activeDay]);
  const days = useMemo(() => Array.from(new Set(places.map(place => place.day).filter((day): day is number => day !== null))).sort((a, b) => a - b), [places]);

  async function authenticate(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const data = await api("/api/auth", { method: "POST", body: JSON.stringify({ action: authMode, email, password }) });
      setUser(data.user || null); setPassword("");
      const trips = await loadTrips();
      if (!trip && trips.length) { await loadBoard(trips[0].id, ""); window.location.hash = `board=${trips[0].id}`; }
      setMessage(authMode === "signup" ? "계정을 만들었습니다. 목록은 기본적으로 비공개입니다." : "로그인했습니다.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true); setMessage("");
    try {
      await api("/api/auth", { method: "DELETE" });
      setUser(null); setMyTrips([]); setTrip(null); setPlaces([]); setAccess(null); setLegacy(false); setBoardId(""); setShareToken("");
      window.location.hash = "";
      setMessage("로그아웃했습니다.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function createTrip() {
    setBusy(true); setMessage("");
    try {
      const data = await api("/api/board", { method: "POST", body: JSON.stringify({ action: "create" }) });
      if (!data.trip) throw new Error("목록을 만들지 못했습니다.");
      await loadTrips(); await loadBoard(data.trip.id, "");
      window.location.hash = `board=${data.trip.id}`;
      setMessage("나만 볼 수 있는 새 목록을 만들었습니다.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function selectTrip(id: string) {
    setMessage("");
    try { await loadBoard(id, ""); window.location.hash = `board=${id}`; }
    catch (cause) { setMessage((cause as Error).message); }
  }

  async function claimTrip() {
    if (!user || !legacy || !shareToken) return;
    setBusy(true); setMessage("");
    try {
      const target = boardPath("", shareToken);
      const data = await api(target.path, { method: "POST", headers: target.headers, body: JSON.stringify({ action: "claim" }) });
      if (!data.trip) throw new Error("목록을 가져오지 못했습니다.");
      window.localStorage.removeItem("osaka-trip-token");
      await loadTrips(); await loadBoard(data.trip.id, "");
      window.location.hash = `board=${data.trip.id}`;
      setMessage("기존 목록을 내 계정으로 가져왔습니다. 이전 공유 링크는 만료됐습니다.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function shareTrip(role: "view" | "edit") {
    if (access !== "owner") return;
    setBusy(true); setMessage("");
    try {
      const target = boardPath(boardId, "");
      const data = await api(target.path, { method: "POST", body: JSON.stringify({ action: "share", role }) });
      const link = `${window.location.origin}${window.location.pathname}#trip=${data.token}`;
      try { await navigator.clipboard.writeText(link); }
      catch { window.prompt("아래 공유 링크를 복사해 주세요.", link); }
      setMessage(`${role === "view" ? "보기" : "편집"} 링크를 복사했습니다. 같은 종류의 이전 링크는 사용할 수 없습니다.`);
    } catch (cause) { setMessage((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function search(event: FormEvent) {
    event.preventDefault(); if (!query.trim()) return;
    setSearching(true); setMessage(""); setResults([]);
    try {
      const data = await api(`/api/search?q=${encodeURIComponent(query.trim())}`) as ApiResponse & { places: SearchPlace[]; provider?: string };
      setResults(data.places || []); setSearchProvider(data.provider || "");
      if (!data.places?.length) setMessage("검색 결과가 없어요. 다른 이름으로 검색하거나 지도에서 직접 추가해 주세요.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setSearching(false); }
  }

  async function addPlace(place: SearchPlace) {
    if (!writable) return;
    setBusy(true); setMessage("");
    try {
      let completePlace = place;
      let detailWarning = "";
      if (place.sourceId?.startsWith("geoapify:")) {
        try {
          const details = await api(`/api/place-details?id=${encodeURIComponent(place.sourceId.slice(9))}`) as ApiResponse & { openingHours?: string; websiteUrl?: string; category?: string };
          completePlace = { ...place, openingHours: details.openingHours || "", websiteUrl: details.websiteUrl || "", category: details.category && details.category !== "place" ? details.category : place.category };
        } catch { detailWarning = " 영업시간은 불러오지 못해 비워뒀습니다."; }
      }
      const target = boardPath(boardId, shareToken);
      await api(target.path, { method: "POST", headers: target.headers, body: JSON.stringify({ action: "add", place: completePlace }) });
      await reload(); setResults([]); setQuery(""); setManual(false); setPicked(null);
      setMessage(`${place.name}을(를) 저장했습니다.${detailWarning}`);
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function addManual(event: FormEvent) {
    event.preventDefault();
    if (!picked) { setMessage("지도에서 장소 위치를 먼저 눌러 주세요."); return; }
    await addPlace({ sourceId: "", name: manualName, address: manualAddress, category: "place", lat: picked.lat, lon: picked.lon, openingHours: "", menuUrl: "", websiteUrl: "" });
    setManualName(""); setManualAddress("");
  }

  async function savePlace() {
    if (!draft || !writable) return;
    setBusy(true); setMessage("");
    try {
      const target = boardPath(boardId, shareToken);
      await api(target.path, { method: "PATCH", headers: target.headers, body: JSON.stringify({ action: "place", id: draft.id, place: draft }) });
      await reload(); setDraft(null); setMessage("장소 정보를 저장했습니다.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function removePlace() {
    if (!draft || !writable || !window.confirm(`${draft.name}을(를) 삭제할까요?`)) return;
    setBusy(true); setMessage("");
    try {
      const target = boardPath(boardId, shareToken, `?placeId=${encodeURIComponent(draft.id)}`);
      await api(target.path, { method: "DELETE", headers: target.headers });
      await reload(); setDraft(null); setMessage("장소를 삭제했습니다.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">大阪</span><span>오사카 여행 지도</span></div><div className="header-actions">{user && <><span className="account-email">{user.email}</span><button className="share-button" onClick={signOut} disabled={busy}><LogOut size={15} /> 로그아웃</button></>}</div></header>
    <div className="workspace">
      <section className="place-panel" aria-label="여행 장소와 일정">
        <div className="panel-heading"><p className="eyebrow">OSAKA TRIP BOARD</p><h1>{trip?.title || "가고 싶은 곳을 모아보세요"}</h1><p className="intro">{trip ? (access === "owner" ? "내 비공개 목록 · 링크를 만들면 동행자와 공유할 수 있어요." : access === "view" ? "공유받은 보기 전용 목록" : "공유받은 편집 목록") : "장소를 저장하고 일차를 지정하면 지도에서 동선을 볼 수 있어요."}</p></div>
        {user && <div className="my-trips"><div className="my-trips-heading"><strong>내 목록</strong><button onClick={createTrip} disabled={busy}><Plus size={15} /> 새 목록</button></div>{myTrips.length > 0 && <div className="my-trips-list">{myTrips.map(item => <button key={item.id} className={boardId === item.id && !shareToken ? "active" : ""} onClick={() => selectTrip(item.id)}>{item.title} <span>{item.placeCount || 0}곳</span></button>)}</div>}</div>}
        {!user && legacy && trip && <form className="auth-form" onSubmit={authenticate}><strong>기존 목록을 내 계정에 저장</strong><p>회원가입하거나 로그인한 뒤 목록을 가져올 수 있어요.</p><label>이메일<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label><label>비밀번호<input type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required /></label><button className="primary-button" disabled={busy}>{authMode === "signup" ? "계정 만들기" : "로그인"}</button><button type="button" className="text-button" onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")}>{authMode === "signup" ? "이미 계정이 있나요? 로그인" : "처음인가요? 회원가입"}</button></form>}
        {!authChecked ? <div className="start-box">불러오는 중...</div> : !trip && !user ? <form className="auth-form" onSubmit={authenticate}><strong>{authMode === "signup" ? "회원가입" : "로그인"}</strong><p>계정마다 비공개 여행 목록을 만들 수 있어요.</p><label>이메일<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label><label>비밀번호<input type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required /></label>{authMode === "signup" && <small>10자 이상 입력해 주세요.</small>}<button className="primary-button" disabled={busy}>{authMode === "signup" ? "계정 만들기" : "로그인"}</button><button type="button" className="text-button" onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")}>{authMode === "signup" ? "이미 계정이 있나요? 로그인" : "처음인가요? 회원가입"}</button></form> : !trip ? <div className="start-box"><p>첫 여행 목록을 만들어 장소를 저장해 보세요.</p><button className="primary-button" onClick={createTrip} disabled={busy}>새 여행 만들기</button></div> : <>
          {legacy && user && access === "edit" && <div className="start-box"><p>이전에 만든 목록입니다. 내 계정으로 가져오면 비공개 목록에 추가되고 기존 공유 링크는 만료됩니다.</p><button className="primary-button" onClick={claimTrip} disabled={busy}>내 목록으로 가져오기</button></div>}
          {access === "owner" && <div className="share-controls"><button onClick={() => shareTrip("view")} disabled={busy}><Copy size={15} /> 보기 링크 복사</button><button onClick={() => shareTrip("edit")} disabled={busy}><Copy size={15} /> 편집 링크 복사</button><small>링크를 가진 사람만 볼 수 있어요. 새 링크를 만들면 이전 링크가 교체됩니다.</small></div>}
          {writable && <><form className="search-form" onSubmit={search}><label htmlFor="place-search">장소 검색</label><div className="search-row"><input id="place-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="한글·일본어 가게, 숙소, 관광지 이름" /><button type="submit" disabled={searching}><Search size={17} /><span>{searching ? "검색 중" : "검색"}</span></button></div><p className="search-hint">한국어 지명을 우선 표시합니다. 자료가 없으면 현지어가 나올 수 있어요.</p><button type="button" className="text-button" onClick={() => { setManual(value => !value); setResults([]); }}>지도에서 직접 장소 추가</button></form>
          {results.length > 0 && <div className="search-results"><div className="result-title">검색 결과 <span>{results.length}곳</span></div><p className="result-help">{searchProvider === "Geoapify" ? "저장할 때 등록된 영업시간과 웹사이트를 확인합니다." : "영업시간이 비어 있을 수 있어요. 저장 후 직접 입력할 수 있습니다."}</p>{results.map((place, index) => <div className="result-card" key={`${place.sourceId}-${index}`}><strong>{place.name}</strong><span>{place.address}</span><button onClick={() => addPlace(place)} disabled={busy}><Plus size={15} /> 저장</button></div>)}</div>}
          {manual && <form className="manual-form" onSubmit={addManual}><strong>지도에서 위치를 눌러 주세요</strong><p>{picked ? `${picked.lat.toFixed(5)}, ${picked.lon.toFixed(5)}` : "위치를 선택하면 여기에 좌표가 표시됩니다."}</p><input aria-label="장소 이름" placeholder="장소 이름" value={manualName} onChange={event => setManualName(event.target.value)} required /><input aria-label="주소" placeholder="주소 (선택)" value={manualAddress} onChange={event => setManualAddress(event.target.value)} /><button className="primary-button" disabled={busy || !picked}>장소 저장</button></form>}</>}
          <div className="panel-section-title"><h2>저장한 장소</h2><span>{places.length}곳</span></div>
          {places.length > 0 && <Tabs value={activeDay} onValueChange={setActiveDay} className="day-tabs"><TabsList className="day-tabs-list"><TabsTrigger value="all">전체</TabsTrigger><TabsTrigger value="none">미정</TabsTrigger>{days.map(day => <TabsTrigger key={day} value={String(day)}>{day}일차</TabsTrigger>)}</TabsList></Tabs>}
          {visiblePlaces.length ? <div className="place-list">{visiblePlaces.map((place, index) => <button className={`place-card ${draft?.id === place.id ? "is-selected" : ""}`} key={place.id} onClick={() => setDraft({ ...place })}><span className="place-number">{index + 1}</span><span className="place-card-body"><span className="place-card-top"><strong>{place.name}</strong><em>{categories[place.category] || "장소"}</em></span><span className="place-card-address">{place.address || "주소 미등록"}</span><span className="place-card-meta">{dayLabel(place.day)} · {place.openingHours ? "영업시간 있음" : "영업시간 미등록"}</span></span></button>)}</div> : <div className="empty-card"><MapPin size={30} /><strong>{places.length ? "해당 일차에 장소가 없어요" : "아직 저장한 장소가 없어요"}</strong><p>{writable ? "가고 싶은 곳을 검색해 지도에 담아보세요." : "공유한 사람이 장소를 추가하면 여기에 표시됩니다."}</p></div>}
        </>}
        {message && <p className="status-message" role="status">{message}</p>}
        <div className="panel-footer">지도 데이터 © OpenStreetMap contributors · <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a> · <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Powered by Geoapify</a></div>
      </section>
      <section className="map-panel" aria-label="오사카 지도"><MapView places={visiblePlaces} activeDay={activeDay} preview={picked} onPick={manual && writable ? setPicked : undefined} onSelect={id => { const found = places.find(place => place.id === id); if (found) setDraft({ ...found }); }} /><div className="map-note">오사카 · 한국어 지명 우선</div></section>
      {draft && <aside className="detail-panel" aria-label={`${draft.name} 상세 정보`}><div className="detail-header"><div><span className="eyebrow">PLACE DETAILS</span><h2>{draft.name}</h2></div><button className="icon-button" aria-label="닫기" onClick={() => setDraft(null)}>×</button></div><p className="detail-address">{draft.address || "주소가 없습니다."}</p><div className="detail-fields">
        <label>장소 이름<input value={draft.name} disabled={!writable} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>주소<input value={draft.address} disabled={!writable} onChange={event => setDraft({ ...draft, address: event.target.value })} /></label>
        <label>종류<Select value={draft.category} disabled={!writable} onValueChange={value => setDraft({ ...draft, category: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="place">관광지·기타</SelectItem><SelectItem value="food">가게</SelectItem><SelectItem value="stay">숙소</SelectItem></SelectContent></Select></label>
        <label>방문 일차<Select value={draft.day === null ? "none" : String(draft.day)} disabled={!writable} onValueChange={value => setDraft({ ...draft, day: value === "none" ? null : Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">미정</SelectItem>{Array.from({ length: 14 }, (_, index) => <SelectItem value={String(index + 1)} key={index}>{index + 1}일차</SelectItem>)}</SelectContent></Select></label>
        <label>동선 순서<input type="number" min="1" value={draft.position} disabled={!writable} onChange={event => setDraft({ ...draft, position: Number(event.target.value) })} /></label>
        <label>영업시간<textarea rows={3} value={draft.openingHours} disabled={!writable} onChange={event => setDraft({ ...draft, openingHours: event.target.value })} placeholder="가게 영업시간" /></label>
        <label>메뉴 링크<input type="url" value={draft.menuUrl} disabled={!writable} onChange={event => setDraft({ ...draft, menuUrl: event.target.value })} placeholder="https://" /></label>
        <label>웹사이트<input type="url" value={draft.websiteUrl} disabled={!writable} onChange={event => setDraft({ ...draft, websiteUrl: event.target.value })} placeholder="https://" /></label>
        <label>메모<textarea rows={3} value={draft.notes} disabled={!writable} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
      </div><div className="detail-links"><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${draft.name} ${draft.address}`)}`} target="_blank" rel="noreferrer">지도에서 확인</a>{draft.menuUrl && <a href={draft.menuUrl} target="_blank" rel="noreferrer">메뉴 보기</a>}{draft.websiteUrl && <a href={draft.websiteUrl} target="_blank" rel="noreferrer">웹사이트</a>}</div>{writable && <div className="detail-actions"><button className="delete-button" onClick={removePlace} disabled={busy}><Trash2 size={16} /> 삭제</button><button className="primary-button" onClick={savePlace} disabled={busy || !draft.name.trim()}>변경 저장</button></div>}</aside>}
    </div>
  </main>;
}
