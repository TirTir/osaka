"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Banknote, CalendarDays, Clock3, MapPin, Pencil, Plus, Share2, Trash2, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PlannerMapPlace = {
  id: string;
  name: string;
  category: string;
  lat: number;
  lon: number;
  day: number | null;
  position: number;
};

type Place = PlannerMapPlace & {
  sourceId?: string;
  collectionId: string | null;
  address: string;
  openingHours: string;
  menuUrl: string;
  websiteUrl: string;
  notes: string;
};
type Stop = Omit<Place, "day"> & { stopId: string; variantId: string; legTransportMode: TransportMode; legFareYen: number };
type Collection = { id: string; name: string; color: string; isDefault: number; position: number };
type TransportMode = "walk" | "rail" | "bus" | "taxi";
type Variant = { id: string; itineraryId: string; day: number; name: string; transportMode: "walk" | "transit" | "drive"; createdAt: string };
type Itinerary = {
  id: string;
  tripId: string;
  tripTitle: string;
  ownerUserId: string;
  ownerEmail: string;
  title: string;
  startDate: string | null;
  dayCount: number;
  access: "owner" | "view";
  variantCount?: number;
};
type Share = { id: string; userId: string; email: string };
type ApiResponse = {
  error?: string;
  itineraries?: Itinerary[];
  itinerary?: Itinerary;
  variants?: Variant[];
  stops?: Stop[];
  places?: Place[];
  collections?: Collection[];
  shares?: Share[];
  id?: string;
};
type Props = {
  currentTripId: string;
  currentTripTitle: string;
  boardToken: string;
  onRouteChange: (places: PlannerMapPlace[], label: string) => void;
};

const modeSpeed = { walk: 4.5, rail: 25, bus: 15, taxi: 24 } as const;
const modeFactor = { walk: 1.22, rail: 1.34, bus: 1.28, taxi: 1.28 } as const;
const modeWait = { walk: 0, rail: 7, bus: 8, taxi: 4 } as const;
const modeLabels: Record<TransportMode, string> = { walk: "도보", rail: "지하철·전철", bus: "버스", taxi: "택시" };

async function api(path: string, init?: RequestInit): Promise<ApiResponse> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json() as ApiResponse;
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

function distanceKm(a: Stop, b: Stop) {
  const toRad = (value: number) => value * Math.PI / 180;
  const lat = toRad(b.lat - a.lat);
  const lon = toRad(b.lon - a.lon);
  const value = Math.sin(lat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(lon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function legEstimate(a: Stop, b: Stop, mode: TransportMode) {
  const km = distanceKm(a, b) * modeFactor[mode];
  const rawMinutes = km / modeSpeed[mode] * 60 + modeWait[mode];
  const minutes = Math.max(5, Math.ceil(rawMinutes / 5) * 5);
  return { minutes, km };
}

function suggestedFare(km: number, mode: TransportMode) {
  if (mode === "walk") return 0;
  if (mode === "bus") return 210;
  if (mode === "taxi") return Math.ceil((680 + Math.max(0, km - 1.7) * 400) / 10) * 10;
  if (km <= 3) return 190;
  if (km <= 7) return 240;
  if (km <= 13) return 290;
  if (km <= 19) return 340;
  return 390;
}

export default function RoutePlanner({ currentTripId, currentTripTitle, boardToken, onRouteChange }: Props) {
  const [items, setItems] = useState<Itinerary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [shares, setShares] = useState<Share[]>([]);
  const [planTitle, setPlanTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (boardToken) headers.Authorization = `Bearer ${boardToken}`;
    return headers;
  }, [boardToken]);

  const loadPlan = useCallback(async (id: string) => {
    if (!id) {
      setItinerary(null); setVariants([]); setStops([]); setPlaces([]); setCollections([]); setShares([]);
      return;
    }
    let data = await api(`/api/itineraries?id=${encodeURIComponent(id)}`);
    if (data.itinerary?.access === "owner" && !(data.variants || []).length) {
      await api("/api/itineraries", { method: "POST", body: JSON.stringify({ action: "variant", itineraryId: id, day: 1, name: "기본 동선", transportMode: "transit" }) });
      data = await api(`/api/itineraries?id=${encodeURIComponent(id)}`);
    }
    const next = data.itinerary || null;
    const nextVariants = data.variants || [];
    setSelectedId(id); setItinerary(next); setVariants(nextVariants); setStops(data.stops || []); setPlaces(data.places || []); setCollections(data.collections || []); setCollectionFilter("all"); setShares(data.shares || []);
    setPlanTitle(next?.title || ""); setEditingTitle(false);
  }, []);

  const loadList = useCallback(async (preferredId = "") => {
    const data = await api("/api/itineraries?list=1");
    const nextItems = data.itineraries || [];
    setItems(nextItems);
    const selected = nextItems.find(item => item.id === selectedId);
    const nextId = preferredId || (selected?.tripId === currentTripId ? selectedId : nextItems.find(item => item.tripId === currentTripId)?.id || nextItems[0]?.id || "");
    await loadPlan(nextId);
  }, [currentTripId, loadPlan, selectedId]);

  // Loading a different place list intentionally replaces the planner's local view state.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void loadList().catch(cause => setMessage((cause as Error).message)); }, [currentTripId]);

  const activeVariant = variants[0] || null;
  const activeStops = useMemo(() => stops.filter(stop => stop.variantId === activeVariant?.id).sort((a, b) => a.position - b.position), [stops, activeVariant]);
  const usedPlaceIds = useMemo(() => new Set(activeStops.map(stop => stop.id)), [activeStops]);
  const defaultCollectionId = collections.find(collection => collection.isDefault)?.id || "";
  const availablePlaces = useMemo(() => places.filter(place => !usedPlaceIds.has(place.id) && (collectionFilter === "all" || place.collectionId === collectionFilter || (collectionFilter === defaultCollectionId && !place.collectionId))), [places, usedPlaceIds, collectionFilter, defaultCollectionId]);
  const owner = itinerary?.access === "owner";
  const totalFare = useMemo(() => activeStops.slice(1).reduce((sum, stop) => sum + (Number(stop.legFareYen) || 0), 0), [activeStops]);

  useEffect(() => {
    onRouteChange(activeStops.map(stop => ({ id: stop.id, name: stop.name, category: stop.category, lat: stop.lat, lon: stop.lon, day: null, position: stop.position })), itinerary?.title || "동선 미정");
  }, [activeStops, itinerary?.title, onRouteChange]);

  async function createItinerary() {
    if (!currentTripId) return;
    setBusy(true); setMessage("");
    try {
      const ownedCount = items.filter(item => item.tripId === currentTripId && item.access === "owner").length;
      const title = `${currentTripTitle || "새 여행"} 동선${ownedCount ? ` ${ownedCount + 1}` : ""}`;
      const data = await api("/api/itineraries", { method: "POST", headers: authHeaders, body: JSON.stringify({ action: "create", tripId: currentTripId, title, dayCount: 1, startDate: "" }) });
      const id = data.itinerary?.id;
      if (!id) throw new Error("동선을 만들지 못했습니다.");
      await api("/api/itineraries", { method: "POST", body: JSON.stringify({ action: "variant", itineraryId: id, day: 1, name: "기본 동선", transportMode: "transit" }) });
      await loadList(id); setEditingTitle(true); setMessage("동선 이름을 정하고 저장한 장소를 추가해 보세요.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function saveTitle() {
    if (!itinerary || !owner) return;
    if (!planTitle.trim()) { setPlanTitle(itinerary.title); setEditingTitle(false); return; }
    if (planTitle.trim() === itinerary.title) { setEditingTitle(false); return; }
    setBusy(true); setMessage("");
    try {
      const title = planTitle.trim();
      await api("/api/itineraries", { method: "PATCH", body: JSON.stringify({ action: "itinerary", itineraryId: itinerary.id, title, dayCount: itinerary.dayCount, startDate: itinerary.startDate || "" }) });
      setItinerary(current => current ? { ...current, title } : current);
      setItems(current => current.map(item => item.id === itinerary.id ? { ...item, title } : item));
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function saveLeg(stop: Stop, transportMode: TransportMode, fareYen?: number) {
    if (!itinerary || !owner) return;
    const index = activeStops.findIndex(item => item.stopId === stop.stopId);
    const previous = index > 0 ? activeStops[index - 1] : null;
    const estimate = previous ? legEstimate(previous, stop, transportMode) : null;
    const nextFare = fareYen === undefined ? suggestedFare(estimate?.km || 0, transportMode) : Math.max(0, Math.round(fareYen || 0));
    const nextStop = { ...stop, legTransportMode: transportMode, legFareYen: nextFare };
    setStops(current => current.map(item => item.stopId === stop.stopId ? nextStop : item));
    try {
      await api("/api/itineraries", { method: "PATCH", body: JSON.stringify({ action: "leg", itineraryId: itinerary.id, stopId: stop.stopId, transportMode, fareYen: nextFare }) });
    } catch (cause) { setMessage((cause as Error).message); await loadPlan(itinerary.id); }
  }

  async function addStop(placeId: string) {
    if (!itinerary || !activeVariant || !placeId || !owner) return;
    setBusy(true); setMessage("");
    try {
      await api("/api/itineraries", { method: "POST", body: JSON.stringify({ action: "stop", itineraryId: itinerary.id, variantId: activeVariant.id, placeId }) });
      await loadPlan(itinerary.id);
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function moveStop(stopId: string, direction: -1 | 1) {
    if (!itinerary || !owner) return;
    try {
      await api("/api/itineraries", { method: "PATCH", body: JSON.stringify({ action: "move", itineraryId: itinerary.id, stopId, direction }) });
      await loadPlan(itinerary.id);
    } catch (cause) { setMessage((cause as Error).message); }
  }

  async function removeStop(stopId: string) {
    if (!itinerary || !owner) return;
    try {
      await api(`/api/itineraries?itineraryId=${encodeURIComponent(itinerary.id)}&stopId=${encodeURIComponent(stopId)}`, { method: "DELETE" });
      await loadPlan(itinerary.id);
    } catch (cause) { setMessage((cause as Error).message); }
  }

  async function shareItinerary(event: FormEvent) {
    event.preventDefault();
    if (!itinerary || !owner || !shareEmail.trim()) return;
    setBusy(true); setMessage("");
    try {
      await api("/api/itineraries", { method: "POST", body: JSON.stringify({ action: "share", itineraryId: itinerary.id, email: shareEmail }) });
      setShareEmail(""); await loadPlan(itinerary.id); setMessage("이 사용자에게 보기 권한을 공유했습니다.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function removeShare(shareId: string) {
    if (!itinerary || !owner) return;
    try {
      await api(`/api/itineraries?itineraryId=${encodeURIComponent(itinerary.id)}&shareId=${encodeURIComponent(shareId)}`, { method: "DELETE" });
      await loadPlan(itinerary.id);
    } catch (cause) { setMessage((cause as Error).message); }
  }

  return <div className="planner">
    <div className="planner-toolbar">
      <div><span className="eyebrow">MY ROUTES</span><h2>내 동선</h2></div>
      {currentTripId && <button className="compact-button" onClick={() => void createItinerary()} disabled={busy}><Plus size={15} /> 동선 만들기</button>}
    </div>

    {items.length > 0 && <div className="planner-select"><label>동선 선택</label><Select value={selectedId} onValueChange={id => void loadPlan(id)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{items.map(item => <SelectItem key={item.id} value={item.id}>{item.title}{item.access === "view" ? " · 공유받음" : ""}</SelectItem>)}</SelectContent></Select></div>}

    {!itinerary ? <div className="empty-card"><CalendarDays size={30} /><strong>{items.length ? "동선을 선택해 주세요" : "아직 만든 동선이 없어요"}</strong><p>{currentTripId ? "동선 만들기를 누르고 이름을 정해 주세요." : "장소 목록을 먼저 만들거나 공유받은 동선을 확인해 보세요."}</p></div> : <>
      <section className="plan-summary">
        <div className="plan-owner-line"><span>{itinerary.access === "owner" ? "내 동선" : `${itinerary.ownerEmail}님의 동선`}</span><span>{itinerary.tripTitle} 장소 목록</span></div>
        {owner ? editingTitle ? <input className="route-title-editor" aria-label="동선 이름" autoFocus value={planTitle} onChange={event => setPlanTitle(event.target.value)} onBlur={() => void saveTitle()} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setPlanTitle(itinerary.title); setEditingTitle(false); } }} /> : <button className="route-title-button" onClick={() => setEditingTitle(true)}><strong>{itinerary.title}</strong><Pencil size={15} /><span>이름 수정</span></button> : <div className="readonly-plan"><strong>{itinerary.title}</strong></div>}
      </section>

      {!activeVariant ? <div className="empty-card route-empty"><MapPin size={28} /><strong>동선을 준비하지 못했습니다</strong><p>화면을 새로고침해 주세요.</p></div> : <section className="variant-card">
        {activeStops.length ? <div className="route-stop-list">{activeStops.map((stop, index) => {
          const previous = index > 0 ? activeStops[index - 1] : null;
          const mode = stop.legTransportMode || "walk";
          const estimate = previous ? legEstimate(previous, stop, mode) : null;
          const mapsMode = mode === "walk" ? "walking" : mode === "taxi" ? "driving" : "transit";
          return <div key={stop.stopId} className="route-stop-wrap">
            {previous && estimate && <div className="route-leg-editor">
              <div className="route-leg-summary"><span><Clock3 size={14} /> 약 {estimate.minutes}분 · {estimate.km.toFixed(1)}km</span><a href={`https://www.google.com/maps/dir/?api=1&origin=${previous.lat},${previous.lon}&destination=${stop.lat},${stop.lon}&travelmode=${mapsMode}`} target="_blank" rel="noreferrer">구글 지도 경로</a></div>
              <div className="route-leg-controls"><Select value={mode} disabled={!owner} onValueChange={value => void saveLeg(stop, value as TransportMode)}><SelectTrigger aria-label={`${previous.name}에서 ${stop.name}까지 이동수단`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="walk">도보</SelectItem><SelectItem value="rail">지하철·전철</SelectItem><SelectItem value="bus">버스</SelectItem><SelectItem value="taxi">택시</SelectItem></SelectContent></Select>{owner ? <label><span>예상 요금</span><input type="number" min="0" step="10" value={stop.legFareYen || 0} onChange={event => setStops(current => current.map(item => item.stopId === stop.stopId ? { ...item, legFareYen: Number(event.target.value) } : item))} onBlur={event => void saveLeg(stop, mode, Number(event.target.value))} /><em>엔</em></label> : <strong>{modeLabels[mode]} · {stop.legFareYen.toLocaleString()}엔</strong>}</div>
            </div>}
            <div className="route-stop"><span className="place-number">{index + 1}</span><div><strong>{stop.name}</strong><span>{stop.address || "주소 미등록"}</span></div>{owner && <div className="route-stop-actions"><button aria-label="위로 이동" disabled={index === 0} onClick={() => void moveStop(stop.stopId, -1)}><ArrowUp size={14} /></button><button aria-label="아래로 이동" disabled={index === activeStops.length - 1} onClick={() => void moveStop(stop.stopId, 1)}><ArrowDown size={14} /></button><button aria-label="동선에서 제거" onClick={() => void removeStop(stop.stopId)}><Trash2 size={14} /></button></div>}</div>
          </div>;
        })}</div> : <div className="route-placeholder">저장한 장소를 아래에서 골라 동선을 시작하세요.</div>}

        {activeStops.length > 1 && <div className="fare-total"><span><Banknote size={18} /> 이 동선의 예상 교통비</span><strong>{totalFare.toLocaleString()}엔</strong><small>1인 기준 · 입력한 구간 요금의 합계</small></div>}

        {owner && <div className="saved-place-picker"><div className="saved-place-heading"><div><strong>저장한 장소</strong><span>카테고리를 고른 뒤 눌러서 동선에 추가하세요</span></div><em>{availablePlaces.length}곳</em></div><div className="collection-filter"><button className={collectionFilter === "all" ? "active" : ""} onClick={() => setCollectionFilter("all")}>전체</button>{collections.map(collection => <button key={collection.id} className={collectionFilter === collection.id ? "active" : ""} onClick={() => setCollectionFilter(collection.id)}><i style={{ backgroundColor: collection.color }} />{collection.name}</button>)}</div>{places.length === 0 ? <p className="saved-place-empty">장소 목록에 저장한 장소가 없습니다. 먼저 장소 목록에서 장소를 저장해 주세요.</p> : availablePlaces.length ? <div className="saved-place-list">{availablePlaces.map(place => { const collection = collections.find(item => item.id === place.collectionId) || collections.find(item => item.isDefault); return <button key={place.id} onClick={() => void addStop(place.id)} disabled={busy}><MapPin size={16} /><span><strong>{place.name}</strong><small>{collection ? `${collection.name} · ` : "기본 · "}{place.address || "주소 미등록"}</small></span><Plus size={16} /></button>; })}</div> : <p className="saved-place-empty">이 카테고리에서 추가할 수 있는 장소가 없습니다.</p>}</div>}
        <p className="estimate-note">시간과 요금은 계획용 예상치입니다. 철도는 Osaka Metro 거리 요금, 버스는 Osaka City Bus 일반요금을 기준으로 제안하며 실제 노선·환승에 따라 달라질 수 있습니다.</p>
      </section>}

      {owner && <section className="route-sharing"><div className="sharing-title"><Users size={17} /><strong>이 동선만 공유</strong></div><p>장소 목록의 공유 설정과 별개입니다. 가입한 사용자에게 보기 권한만 부여됩니다.</p><form onSubmit={shareItinerary}><input type="email" placeholder="동행자 이메일" value={shareEmail} onChange={event => setShareEmail(event.target.value)} required /><button disabled={busy}><Share2 size={15} /> 공유</button></form>{shares.length > 0 && <div className="share-list">{shares.map(share => <span key={share.id}>{share.email}<button aria-label={`${share.email} 공유 해제`} onClick={() => void removeShare(share.id)}>×</button></span>)}</div>}</section>}
    </>}
    {message && <p className="status-message" role="status">{message}</p>}
  </div>;
}
