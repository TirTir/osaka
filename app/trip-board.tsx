"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Copy, CreditCard, List, LogOut, MapPin, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Route, Search, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MapView from "./map-view";
import RoutePlanner, { type PlannerMapPlace } from "./route-planner";
import TransportGuide from "./transport-guide";

type Place = { id: string; sourceId?: string; collectionId: string | null; name: string; address: string; category: string; lat: number; lon: number; openingHours: string; menuUrl: string; websiteUrl: string; notes: string; day: number | null; position: number };
type SearchPlace = Omit<Place, "id" | "collectionId" | "notes" | "day" | "position">;
type Collection = { id: string; name: string; color: string; isDefault: number; position: number };
type Trip = { id: string; title: string; createdAt?: string; placeCount?: number; access?: Access; ownerEmail?: string };
type TripShare = { id: string; userId: string; email: string; role: "view" | "edit" };
type Access = "owner" | "edit" | "view";
type ApiResponse = { error?: string; user?: { id: string; email: string } | null; trips?: Trip[]; trip?: Trip; places?: Place[]; collections?: Collection[]; collection?: Collection; shares?: TripShare[]; share?: TripShare; access?: Access; legacy?: boolean; token?: string; role?: string };
type ExchangeRate = { rate: number; date: string; unit: number; source: string };

function wonPrice(yen: number, rate: number | null) {
  if (!rate) return "";
  return `약 ${(Math.round(yen * rate / 10) * 10).toLocaleString()}원`;
}

async function api(path: string, init?: RequestInit): Promise<ApiResponse> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json() as ApiResponse;
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

export default function TripBoard({ chatGPTSignInHref }: { chatGPTSignInHref: string }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [myTrips, setMyTrips] = useState<Trip[]>([]);
  const [boardId, setBoardId] = useState("");
  const [shareToken, setShareToken] = useState("");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("all");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [tripShares, setTripShares] = useState<TripShare[]>([]);
  const [shareUserEmail, setShareUserEmail] = useState("");
  const [shareUserRole, setShareUserRole] = useState<"view" | "edit">("view");
  const [editingTripTitle, setEditingTripTitle] = useState(false);
  const [tripTitleDraft, setTripTitleDraft] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPlace[]>([]);
  const [searchProvider, setSearchProvider] = useState("");
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Place | null>(null);
  const [manual, setManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<"places" | "routes" | "guide">("places");
  const [routeMapPlaces, setRouteMapPlaces] = useState<PlannerMapPlace[]>([]);
  const [routeMapLabel, setRouteMapLabel] = useState("동선 미정");
  const [panelOpen, setPanelOpen] = useState(true);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [exchangeRateFailed, setExchangeRateFailed] = useState(false);

  const boardPath = useCallback((id: string, token: string, suffix = "") => {
    const url = new URL(`/api/board${suffix}`, window.location.origin);
    if (id) url.searchParams.set("id", id);
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    return { path: `${url.pathname}${url.search}`, headers };
  }, []);

  const loadBoard = useCallback(async (id: string, token: string) => {
    const target = boardPath(id, token);
    const data = await api(target.path, { headers: target.headers });
    setBoardId(id); setShareToken(token); setTrip(data.trip || null); setTripTitleDraft(data.trip?.title || ""); setEditingTripTitle(false); setPlaces(data.places || []); setCollections(data.collections || []); setTripShares(data.shares || []); setSelectedCollectionId("all"); setAccess(data.access || null); setLegacy(!!data.legacy);
    setDraft(null); setResults([]);
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
        let auth = await api("/api/auth");
        const pageUrl = new URL(window.location.href);
        if (pageUrl.searchParams.get("auth") === "chatgpt") {
          auth = await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "chatgpt" }) });
          pageUrl.searchParams.delete("auth");
          window.history.replaceState(null, "", `${pageUrl.pathname}${pageUrl.search}${pageUrl.hash}`);
          setMessage("ChatGPT 계정으로 로그인했습니다.");
        }
        if (cancelled) return;
        setUser(auth.user || null);
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const id = hash.get("board") || "";
        const token = hash.get("trip") || (!id ? window.localStorage.getItem("osaka-trip-token") || "" : "");
        let opened = false;
        if (token && auth.user) {
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

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/exchange-rate")
      .then(async response => {
        if (!response.ok) throw new Error("환율을 불러오지 못했습니다.");
        return await response.json() as ExchangeRate;
      })
      .then(data => { if (!cancelled) setExchangeRate(data); })
      .catch(() => { if (!cancelled) setExchangeRateFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const reload = useCallback(async () => {
    if (!boardId && !shareToken) return null;
    const target = boardPath(boardId, shareToken);
    const data = await api(target.path, { headers: target.headers });
    setTrip(data.trip || null); setTripTitleDraft(data.trip?.title || ""); setPlaces(data.places || []); setCollections(data.collections || []); setTripShares(data.shares || []); setAccess(data.access || null); setLegacy(!!data.legacy);
    return data;
  }, [boardId, shareToken, boardPath]);
  const writable = access === "owner" || access === "edit";
  const defaultCollectionId = collections.find(collection => collection.isDefault)?.id || "";
  const visiblePlaces = useMemo(() => places.filter(place => selectedCollectionId === "all" || place.collectionId === selectedCollectionId || (selectedCollectionId === defaultCollectionId && !place.collectionId)), [places, selectedCollectionId, defaultCollectionId]);

  async function signOut() {
    setBusy(true); setMessage("");
    try {
      await api("/api/auth", { method: "DELETE" });
      setUser(null); setMyTrips([]); setTrip(null); setPlaces([]); setCollections([]); setTripShares([]); setAccess(null); setLegacy(false); setBoardId(""); setShareToken("");
      window.localStorage.removeItem("osaka-trip-token");
      window.location.assign("/signout-with-chatgpt?return_to=%2F");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function createTrip() {
    const title = window.prompt("새 여행 목록 이름을 입력해 주세요.", "새 여행")?.trim();
    if (!title) return;
    setBusy(true); setMessage("");
    try {
      const data = await api("/api/board", { method: "POST", body: JSON.stringify({ action: "create", title }) });
      if (!data.trip) throw new Error("목록을 만들지 못했습니다.");
      await loadTrips(); await loadBoard(data.trip.id, "");
      window.location.hash = `board=${data.trip.id}`;
      setMessage("나만 볼 수 있는 새 목록을 만들었습니다.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function saveTripTitle() {
    if (!trip || access !== "owner") return;
    const title = tripTitleDraft.trim();
    if (!title) { setTripTitleDraft(trip.title); setEditingTripTitle(false); return; }
    if (title === trip.title) { setEditingTripTitle(false); return; }
    setBusy(true); setMessage("");
    try {
      const target = boardPath(boardId, shareToken);
      await api(target.path, { method: "PATCH", headers: target.headers, body: JSON.stringify({ action: "trip", title }) });
      setTrip(current => current ? { ...current, title } : current);
      setMyTrips(current => current.map(item => item.id === trip.id ? { ...item, title } : item));
      setEditingTripTitle(false); setMessage("여행 목록 이름을 변경했습니다.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function removeTrip(item: Trip) {
    if (item.access !== "owner" || !window.confirm(`\"${item.title}\" 여행 목록과 저장된 장소, 연결된 동선을 모두 삭제할까요?`)) return;
    setBusy(true); setMessage("");
    try {
      await api(`/api/board?id=${encodeURIComponent(item.id)}&trip=1`, { method: "DELETE" });
      const remaining = await loadTrips();
      if (boardId === item.id && !shareToken) {
        if (remaining.length) {
          await loadBoard(remaining[0].id, "");
          window.history.replaceState(null, "", `#board=${remaining[0].id}`);
        } else {
          setBoardId(""); setTrip(null); setPlaces([]); setCollections([]); setTripShares([]); setAccess(null); setLegacy(false); setDraft(null);
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        }
      }
      setMessage("여행 목록을 삭제했습니다.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function selectTrip(id: string) {
    setMessage("");
    try { await loadBoard(id, ""); window.history.replaceState(null, "", `#board=${id}`); }
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

  async function saveUserShare(event?: FormEvent, existing?: TripShare, nextRole?: "view" | "edit") {
    event?.preventDefault();
    if (access !== "owner") return;
    const email = existing?.email || shareUserEmail.trim();
    const role = nextRole || shareUserRole;
    if (!email) return;
    setBusy(true); setMessage("");
    try {
      const target = boardPath(boardId, "");
      await api(target.path, { method: "POST", body: JSON.stringify({ action: "share_user", email, role }) });
      setShareUserEmail(""); await reload();
      setMessage(`${email} 사용자에게 ${role === "edit" ? "편집" : "보기"} 권한을 설정했습니다.`);
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function removeUserShare(share: TripShare) {
    if (access !== "owner" || !window.confirm(`${share.email} 사용자의 공유 권한을 해제할까요?`)) return;
    setBusy(true); setMessage("");
    try {
      const target = boardPath(boardId, "", `?shareId=${encodeURIComponent(share.id)}`);
      await api(target.path, { method: "DELETE" });
      await reload(); setMessage("사용자 공유를 해제했습니다.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function createCollection(event: FormEvent) {
    event.preventDefault();
    const name = newCollectionName.trim();
    if (!name || !writable) return;
    setBusy(true); setMessage("");
    try {
      const colors = ["#d9553c", "#318276", "#c58a28", "#6d65a8", "#3478a5", "#b35478"];
      const target = boardPath(boardId, shareToken);
      const data = await api(target.path, { method: "POST", headers: target.headers, body: JSON.stringify({ action: "collection", name, color: colors[collections.length % colors.length] }) });
      await reload(); setNewCollectionName("");
      if (data.collection?.id) setSelectedCollectionId(data.collection.id);
      setMessage(`${name} 카테고리를 만들었습니다.`);
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function renameCollection(collection: Collection) {
    if (!writable) return;
    const name = window.prompt("새 카테고리 이름을 입력해 주세요.", collection.name)?.trim();
    if (!name || name === collection.name) return;
    setBusy(true); setMessage("");
    try {
      const target = boardPath(boardId, shareToken);
      await api(target.path, { method: "PATCH", headers: target.headers, body: JSON.stringify({ action: "collection", id: collection.id, name, color: collection.color }) });
      await reload(); setMessage("카테고리 이름을 변경했습니다.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function removeCollection(collection: Collection) {
    if (!writable || !window.confirm(`${collection.name} 카테고리를 삭제할까요? 장소는 삭제되지 않고 기본 카테고리로 이동합니다.`)) return;
    setBusy(true); setMessage("");
    try {
      const target = boardPath(boardId, shareToken, `?collectionId=${encodeURIComponent(collection.id)}`);
      await api(target.path, { method: "DELETE", headers: target.headers });
      if (selectedCollectionId === collection.id) setSelectedCollectionId("all");
      await reload(); setMessage("카테고리를 삭제했습니다. 장소는 기본 카테고리로 이동했습니다.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
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
      await api(target.path, { method: "POST", headers: target.headers, body: JSON.stringify({ action: "add", place: { ...completePlace, collectionId: selectedCollectionId === "all" ? null : selectedCollectionId } }) });
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

  const handleRouteChange = useCallback((nextPlaces: PlannerMapPlace[], label: string) => {
    setRouteMapPlaces(nextPlaces);
    setRouteMapLabel(label);
  }, []);

  function renderAuthPanel(title: string, description: string) {
    return <section className="auth-form" aria-label="계정 로그인">
      <strong>{title}</strong>
      <p>{description}</p>
      <a className="chatgpt-login" href={chatGPTSignInHref} target="_top"><span aria-hidden="true">GPT</span>ChatGPT로 계속하기</a>
      <small>처음 로그인하면 계정이 자동으로 만들어집니다. 여행 목록은 기본적으로 비공개입니다.</small>
    </section>;
  }

  return <main className={`app-shell ${panelOpen ? "" : "panel-collapsed"}`}>
    <header className="topbar"><div className="brand"><button className="brand-mark" aria-controls="trip-panel" aria-expanded={panelOpen} aria-label={panelOpen ? "여행 목록 닫기" : "여행 목록 열기"} onClick={() => setPanelOpen(value => !value)}>{panelOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}</button><span>오사카 여행 지도</span></div>{user && <nav className="main-menu" aria-label="주 메뉴"><button className={workspaceMode === "places" ? "active" : ""} onClick={() => { setWorkspaceMode("places"); setPanelOpen(true); }}><List size={16} /> 장소</button><button className={workspaceMode === "routes" ? "active" : ""} onClick={() => { setWorkspaceMode("routes"); setDraft(null); setPanelOpen(true); }}><Route size={16} /> 동선</button><button className={workspaceMode === "guide" ? "active" : ""} onClick={() => { setWorkspaceMode("guide"); setDraft(null); setPanelOpen(true); }}><CreditCard size={16} /> 교통비</button></nav>}<div className="header-actions">{user && <><span className="account-email">{user.email}</span><button className="share-button" onClick={signOut} disabled={busy}><LogOut size={15} /> 로그아웃</button></>}</div></header>
    <div className="workspace">
      <section id="trip-panel" className="place-panel" aria-label="여행 장소와 일정">
        <div className="panel-heading"><p className="eyebrow">OSAKA TRIP BOARD</p>{workspaceMode === "places" && trip && access === "owner" ? editingTripTitle ? <input className="trip-title-editor" aria-label="여행 목록 이름" autoFocus value={tripTitleDraft} onChange={event => setTripTitleDraft(event.target.value)} onBlur={() => void saveTripTitle()} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setTripTitleDraft(trip.title); setEditingTripTitle(false); } }} /> : <button className="trip-title-button" onClick={() => setEditingTripTitle(true)}><h1>{trip.title}</h1><Pencil size={16} /><span>이름 수정</span></button> : <h1>{workspaceMode === "routes" ? "여행 동선 계획" : workspaceMode === "guide" ? "오사카 교통비 안내" : trip?.title || "가고 싶은 곳을 모아보세요"}</h1>}<p className="intro">{workspaceMode === "routes" ? "카테고리별로 장소를 골라 동선에 추가하고 구간마다 이동수단을 정하세요." : workspaceMode === "guide" ? "노선마다 다른 요금과 환승 방식을 여행 전에 쉽게 확인하세요." : trip ? (access === "owner" ? "기본 카테고리와 사용자 지정 카테고리로 장소를 관리할 수 있어요." : access === "view" ? "공유받은 보기 전용 장소 목록" : "공유받은 편집 장소 목록") : "가고 싶은 장소를 먼저 모은 뒤 나만의 동선을 만들 수 있어요."}</p></div>
        <section className="exchange-rate-card" aria-label="현재 엔화 환율"><span>현재 환율</span>{exchangeRate ? <><strong>100엔 ≈ {(Math.round(exchangeRate.rate * 100 / 10) * 10).toLocaleString()}원</strong><small>{exchangeRate.date} 기준 · 실제 결제 환율은 다를 수 있어요</small></> : <><strong>{exchangeRateFailed ? "환율 확인 불가" : "불러오는 중"}</strong><small>최근 고시 환율을 표시합니다</small></>}</section>
        {workspaceMode === "places" ? <>
        {user && <div className="my-trips"><div className="my-trips-heading"><strong>여행 목록</strong><button onClick={createTrip} disabled={busy}><Plus size={15} /> 새 목록</button></div>{myTrips.length > 0 && <div className="my-trips-list">{myTrips.map(item => <div className="trip-list-item" key={item.id}><button className={`trip-select ${boardId === item.id && !shareToken ? "active" : ""}`} onClick={() => selectTrip(item.id)}>{item.title} <span>{item.placeCount || 0}곳{item.access && item.access !== "owner" ? ` · ${item.ownerEmail || "다른 사용자"} 공유` : ""}</span></button>{item.access === "owner" && <button className="trip-delete" aria-label={`${item.title} 여행 목록 삭제`} onClick={() => void removeTrip(item)} disabled={busy}><Trash2 size={13} /></button>}</div>)}</div>}</div>}
        {!user && legacy && trip && renderAuthPanel("기존 목록을 내 계정에 저장", "원하는 방법으로 로그인한 뒤 이 목록을 가져올 수 있어요.")}
        {!authChecked ? <div className="start-box">불러오는 중...</div> : !trip && !user ? renderAuthPanel("로그인 또는 회원가입", "본인의 ChatGPT 계정으로 로그인해 여행 목록을 관리하세요.") : !trip ? <div className="start-box"><p>첫 여행 목록을 만들어 장소를 저장해 보세요.</p><button className="primary-button" onClick={createTrip} disabled={busy}>새 여행 만들기</button></div> : <>
          {legacy && user && access === "edit" && <div className="start-box"><p>이전에 만든 목록입니다. 내 계정으로 가져오면 비공개 목록에 추가되고 기존 공유 링크는 만료됩니다.</p><button className="primary-button" onClick={claimTrip} disabled={busy}>내 목록으로 가져오기</button></div>}
          {access === "owner" && <div className="share-controls"><button onClick={() => shareTrip("view")} disabled={busy}><Copy size={15} /> 보기 링크 복사</button><button onClick={() => shareTrip("edit")} disabled={busy}><Copy size={15} /> 편집 링크 복사</button><small>링크를 가진 사람만 볼 수 있어요. 새 링크를 만들면 이전 링크가 교체됩니다.</small></div>}
          {access === "owner" && <section className="trip-share-manager"><div className="collection-heading"><strong>공유 사용자</strong><span>{tripShares.length}명</span></div><form onSubmit={event => void saveUserShare(event)}><input type="email" value={shareUserEmail} onChange={event => setShareUserEmail(event.target.value)} placeholder="가입한 사용자 이메일" required /><Select value={shareUserRole} onValueChange={value => setShareUserRole(value as "view" | "edit")}><SelectTrigger aria-label="공유 권한"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="view">보기</SelectItem><SelectItem value="edit">편집</SelectItem></SelectContent></Select><button disabled={busy}><Plus size={14} /> 추가</button></form>{tripShares.length > 0 ? <div className="trip-share-list">{tripShares.map(share => <div key={share.id}><span>{share.email}</span><Select value={share.role} onValueChange={value => void saveUserShare(undefined, share, value as "view" | "edit")}><SelectTrigger aria-label={`${share.email} 권한`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="view">보기</SelectItem><SelectItem value="edit">편집</SelectItem></SelectContent></Select><button aria-label={`${share.email} 공유 해제`} onClick={() => void removeUserShare(share)}>×</button></div>)}</div> : <p>이메일로 공유하면 여기에서 권한을 변경하거나 해제할 수 있습니다.</p>}</section>}
          <section className="collection-manager"><div className="collection-heading"><strong>장소 카테고리</strong><span>{collections.length}개</span></div><div className="collection-tabs"><button className={selectedCollectionId === "all" ? "active" : ""} onClick={() => setSelectedCollectionId("all")}>전체 <small>{places.length}</small></button>{collections.map(collection => <span className="collection-tab-wrap" key={collection.id}><button className={selectedCollectionId === collection.id ? "active" : ""} onClick={() => setSelectedCollectionId(collection.id)}><i style={{ backgroundColor: collection.color }} />{collection.name} <small>{places.filter(place => place.collectionId === collection.id || (collection.isDefault && !place.collectionId)).length}</small></button>{writable && !collection.isDefault && <span className="collection-tools"><button aria-label={`${collection.name} 이름 변경`} onClick={() => void renameCollection(collection)}><Pencil size={12} /></button><button aria-label={`${collection.name} 카테고리 삭제`} onClick={() => void removeCollection(collection)}>×</button></span>}</span>)}</div>{writable && <form className="collection-create" onSubmit={createCollection}><input value={newCollectionName} onChange={event => setNewCollectionName(event.target.value)} placeholder="사용자 지정 카테고리" maxLength={60} /><button disabled={busy || !newCollectionName.trim()}><Plus size={14} /> 추가</button></form>}</section>
          {writable && <><form className="search-form" onSubmit={search}><label htmlFor="place-search">장소 검색</label><div className="search-row"><input id="place-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="한글·일본어 가게, 숙소, 관광지 이름" /><button type="submit" disabled={searching}><Search size={17} /><span>{searching ? "검색 중" : "검색"}</span></button></div><p className="search-hint">한국어 지명을 우선 표시합니다. 자료가 없으면 현지어가 나올 수 있어요.</p><button type="button" className="text-button" onClick={() => { setManual(value => !value); setResults([]); }}>지도에서 직접 장소 추가</button></form>
          {results.length > 0 && <div className="search-results"><div className="result-title">검색 결과 <span>{results.length}곳</span></div><p className="result-help">{searchProvider === "Geoapify" ? "저장할 때 등록된 영업시간과 웹사이트를 확인합니다." : "영업시간이 비어 있을 수 있어요. 저장 후 직접 입력할 수 있습니다."}</p>{results.map((place, index) => <div className="result-card" key={`${place.sourceId}-${index}`}><strong>{place.name}</strong><span>{place.address}</span><button onClick={() => addPlace(place)} disabled={busy}><Plus size={15} /> 저장</button></div>)}</div>}
          {manual && <form className="manual-form" onSubmit={addManual}><strong>지도에서 위치를 눌러 주세요</strong><p>{picked ? `${picked.lat.toFixed(5)}, ${picked.lon.toFixed(5)}` : "위치를 선택하면 여기에 좌표가 표시됩니다."}</p><input aria-label="장소 이름" placeholder="장소 이름" value={manualName} onChange={event => setManualName(event.target.value)} required /><input aria-label="주소" placeholder="주소 (선택)" value={manualAddress} onChange={event => setManualAddress(event.target.value)} /><button className="primary-button" disabled={busy || !picked}>장소 저장</button></form>}</>}
          <div className="panel-section-title"><h2>{selectedCollectionId === "all" ? "전체 장소" : collections.find(item => item.id === selectedCollectionId)?.name || "기본"}</h2><span>{visiblePlaces.length}곳</span></div>
          {visiblePlaces.length ? <div className="place-list">{visiblePlaces.map((place, index) => { const collection = collections.find(item => item.id === place.collectionId) || collections.find(item => item.isDefault); return <button className={`place-card ${draft?.id === place.id ? "is-selected" : ""}`} key={place.id} onClick={() => setDraft({ ...place })}><span className="place-number">{index + 1}</span><span className="place-card-body"><span className="place-card-top"><strong>{place.name}</strong><em style={collection ? { color: collection.color, backgroundColor: `${collection.color}18` } : undefined}>{collection?.name || "기본"}</em></span><span className="place-card-address">{place.address || "주소 미등록"}</span><span className="place-card-meta">{place.openingHours ? "영업시간 있음" : "영업시간 미등록"}</span></span></button>; })}</div> : <div className="empty-card"><MapPin size={30} /><strong>아직 저장한 장소가 없어요</strong><p>{writable ? "가고 싶은 곳을 검색해 지도에 담아보세요." : "공유한 사람이 장소를 추가하면 여기에 표시됩니다."}</p></div>}
        </>}
        </> : workspaceMode === "routes" && user ? <RoutePlanner currentTripId={trip?.id || ""} currentTripTitle={trip?.title || ""} boardToken={shareToken} yenToKrwRate={exchangeRate?.rate || null} onRouteChange={handleRouteChange} /> : workspaceMode === "guide" && user ? <TransportGuide yenToKrwRate={exchangeRate?.rate || null} /> : null}
        {message && <p className="status-message" role="status">{message}</p>}
        <div className="panel-footer">지도 데이터 © OpenStreetMap contributors · <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a> · <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Powered by Geoapify</a></div>
      </section>
      <section className={`map-panel ${workspaceMode === "guide" ? "guide-map" : ""}`} aria-label={workspaceMode === "guide" ? "교통비 빠른 요약" : "오사카 지도"}>{workspaceMode === "guide" ? <div className="guide-map-summary"><CreditCard size={34} /><strong>교통비 계산 기준</strong><span><b>도보 0엔</b><small>{wonPrice(0, exchangeRate?.rate || null) || "약 0원"}</small></span><span><b>Osaka Metro 190~390엔</b><small>{exchangeRate ? `${wonPrice(190, exchangeRate.rate)}~${wonPrice(390, exchangeRate.rate).replace("약 ", "")}` : "환율 확인 중"}</small></span><span><b>Osaka City Bus 210엔</b><small>{exchangeRate ? wonPrice(210, exchangeRate.rate) : "환율 확인 중"}</small></span><span><b>난카이 라피트 1,410~1,590엔</b><small>{exchangeRate ? `${wonPrice(1410, exchangeRate.rate)}~${wonPrice(1590, exchangeRate.rate).replace("약 ", "")}` : "환율 확인 중"}</small></span><span><b>시내 1일권 620엔부터</b><small>{exchangeRate ? wonPrice(620, exchangeRate.rate) : "환율 확인 중"}</small></span><p>동선 메뉴에서 구간마다 이동수단과 실제 확인한 요금을 수정하면 총액이 자동으로 합산됩니다.</p></div> : <><MapView places={workspaceMode === "routes" ? routeMapPlaces : visiblePlaces} activeDay={workspaceMode === "routes" ? "route" : "all"} preview={workspaceMode === "places" ? picked : null} routeMode={workspaceMode === "routes"} onPick={workspaceMode === "places" && manual && writable ? setPicked : undefined} onSelect={workspaceMode === "places" ? id => { const found = places.find(place => place.id === id); if (found) setDraft({ ...found }); } : undefined} /><div className="map-note">{workspaceMode === "routes" ? routeMapLabel : "오사카 · Google 지도"}</div></>}</section>
      {workspaceMode === "places" && draft && <aside className="detail-panel" aria-label={`${draft.name} 상세 정보`}><div className="detail-header"><div><span className="eyebrow">PLACE DETAILS</span><h2>{draft.name}</h2></div><button className="icon-button" aria-label="닫기" onClick={() => setDraft(null)}>×</button></div><p className="detail-address">{draft.address || "주소가 없습니다."}</p><div className="detail-fields">
        <label>장소 이름<input value={draft.name} disabled={!writable} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>주소<input value={draft.address} disabled={!writable} onChange={event => setDraft({ ...draft, address: event.target.value })} /></label>
        <label>카테고리<Select value={draft.collectionId || defaultCollectionId} disabled={!writable} onValueChange={value => setDraft({ ...draft, collectionId: value })}><SelectTrigger><SelectValue placeholder="기본" /></SelectTrigger><SelectContent>{collections.map(collection => <SelectItem key={collection.id} value={collection.id}>{collection.name}</SelectItem>)}</SelectContent></Select></label>
        <label>종류<Select value={draft.category} disabled={!writable} onValueChange={value => setDraft({ ...draft, category: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="place">관광지·기타</SelectItem><SelectItem value="food">가게</SelectItem><SelectItem value="stay">숙소</SelectItem></SelectContent></Select></label>
        <label>영업시간<textarea rows={3} value={draft.openingHours} disabled={!writable} onChange={event => setDraft({ ...draft, openingHours: event.target.value })} placeholder="가게 영업시간" /></label>
        <label>메뉴 링크<input type="url" value={draft.menuUrl} disabled={!writable} onChange={event => setDraft({ ...draft, menuUrl: event.target.value })} placeholder="https://" /></label>
        <label>웹사이트<input type="url" value={draft.websiteUrl} disabled={!writable} onChange={event => setDraft({ ...draft, websiteUrl: event.target.value })} placeholder="https://" /></label>
        <label>메모<textarea rows={3} value={draft.notes} disabled={!writable} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
      </div><div className="detail-links"><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${draft.name} ${draft.address}`)}`} target="_blank" rel="noreferrer">지도에서 확인</a>{draft.menuUrl && <a href={draft.menuUrl} target="_blank" rel="noreferrer">메뉴 보기</a>}{draft.websiteUrl && <a href={draft.websiteUrl} target="_blank" rel="noreferrer">웹사이트</a>}</div>{writable && <div className="detail-actions"><button className="delete-button" onClick={removePlace} disabled={busy}><Trash2 size={16} /> 삭제</button><button className="primary-button" onClick={savePlace} disabled={busy || !draft.name.trim()}>변경 저장</button></div>}</aside>}
    </div>
  </main>;
}
