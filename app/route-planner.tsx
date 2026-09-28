"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CalendarDays, Clock3, CopyPlus, MapPin, Plus, Share2, Trash2, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  address: string;
  openingHours: string;
  menuUrl: string;
  websiteUrl: string;
  notes: string;
};
type Stop = Omit<Place, "day"> & { stopId: string; variantId: string };
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
  shares?: Share[];
  id?: string;
};
type Props = {
  currentTripId: string;
  currentTripTitle: string;
  boardToken: string;
  onRouteChange: (places: PlannerMapPlace[], label: string) => void;
};

const modeSpeed = { walk: 4.5, transit: 22, drive: 28 } as const;
const modeFactor = { walk: 1.22, transit: 1.34, drive: 1.28 } as const;
const modeWait = { walk: 0, transit: 6, drive: 4 } as const;

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

function legEstimate(a: Stop, b: Stop, mode: Variant["transportMode"]) {
  const km = distanceKm(a, b) * modeFactor[mode];
  const rawMinutes = km / modeSpeed[mode] * 60 + modeWait[mode];
  const minutes = Math.max(5, Math.ceil(rawMinutes / 5) * 5);
  return { minutes, km };
}

function dayDate(startDate: string | null, day: number) {
  if (!startDate) return "";
  const date = new Date(`${startDate}T00:00:00`);
  date.setDate(date.getDate() + day - 1);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default function RoutePlanner({ currentTripId, currentTripTitle, boardToken, onRouteChange }: Props) {
  const [items, setItems] = useState<Itinerary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [activeDay, setActiveDay] = useState(1);
  const [activeVariantId, setActiveVariantId] = useState("");
  const [planTitle, setPlanTitle] = useState("");
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
      setItinerary(null); setVariants([]); setStops([]); setPlaces([]); setShares([]); setActiveVariantId("");
      return;
    }
    const data = await api(`/api/itineraries?id=${encodeURIComponent(id)}`);
    const next = data.itinerary || null;
    const nextVariants = data.variants || [];
    setSelectedId(id); setItinerary(next); setVariants(nextVariants); setStops(data.stops || []); setPlaces(data.places || []); setShares(data.shares || []);
    setPlanTitle(next?.title || "");
    const nextDay = nextVariants.some(variant => variant.day === activeDay) ? activeDay : (nextVariants[0]?.day || 1);
    setActiveDay(nextDay);
    setActiveVariantId(current => nextVariants.some(variant => variant.id === current && variant.day === nextDay) ? current : (nextVariants.find(variant => variant.day === nextDay)?.id || ""));
  }, [activeDay]);

  const loadList = useCallback(async (preferredId = "") => {
    const data = await api("/api/itineraries?list=1");
    const nextItems = data.itineraries || [];
    setItems(nextItems);
    const selected = nextItems.find(item => item.id === selectedId);
    const nextId = preferredId || (selected?.tripId === currentTripId ? selectedId : nextItems.find(item => item.tripId === currentTripId)?.id || nextItems[0]?.id || "");
    await loadPlan(nextId);
  }, [currentTripId, loadPlan, selectedId]);

  useEffect(() => { void loadList().catch(cause => setMessage((cause as Error).message)); }, [currentTripId]); // eslint-disable-line react-hooks/exhaustive-deps

  const dayVariants = useMemo(() => variants.filter(variant => variant.day === activeDay), [variants, activeDay]);
  const activeVariant = dayVariants.find(variant => variant.id === activeVariantId) || dayVariants[0] || null;
  const activeStops = useMemo(() => stops.filter(stop => stop.variantId === activeVariant?.id).sort((a, b) => a.position - b.position), [stops, activeVariant]);
  const usedPlaceIds = useMemo(() => new Set(activeStops.map(stop => stop.id)), [activeStops]);
  const availablePlaces = useMemo(() => places.filter(place => !usedPlaceIds.has(place.id)), [places, usedPlaceIds]);
  const owner = itinerary?.access === "owner";

  useEffect(() => {
    onRouteChange(activeStops.map(stop => ({ id: stop.id, name: stop.name, category: stop.category, lat: stop.lat, lon: stop.lon, day: activeDay, position: stop.position })), activeVariant ? `${activeDay}일차 · ${activeVariant.name}` : "동선 미정");
  }, [activeStops, activeDay, activeVariant, onRouteChange]);

  useEffect(() => {
    if (!dayVariants.length) setActiveVariantId("");
    else if (!dayVariants.some(variant => variant.id === activeVariantId)) setActiveVariantId(dayVariants[0].id);
  }, [activeDay, dayVariants, activeVariantId]);

  async function createItinerary() {
    if (!currentTripId) return;
    setBusy(true); setMessage("");
    try {
      const ownedCount = items.filter(item => item.tripId === currentTripId && item.access === "owner").length;
      const title = `${currentTripTitle || "새 여행"} 동선${ownedCount ? ` ${ownedCount + 1}` : ""}`;
      const data = await api("/api/itineraries", { method: "POST", headers: authHeaders, body: JSON.stringify({ action: "create", tripId: currentTripId, title, dayCount: 1, startDate: "" }) });
      const id = data.itinerary?.id;
      if (!id) throw new Error("동선을 만들지 못했습니다.");
      const variant = await api("/api/itineraries", { method: "POST", body: JSON.stringify({ action: "variant", itineraryId: id, day: 1, name: "1안", transportMode: "transit" }) });
      await loadList(id); setActiveDay(1); if (variant.id) setActiveVariantId(variant.id); setMessage("새 동선을 만들었습니다. 저장한 장소를 눌러 추가해 보세요.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function saveTitle() {
    if (!itinerary || !owner || !planTitle.trim() || planTitle.trim() === itinerary.title) return;
    setBusy(true); setMessage("");
    try {
      const title = planTitle.trim();
      await api("/api/itineraries", { method: "PATCH", body: JSON.stringify({ action: "itinerary", itineraryId: itinerary.id, title, dayCount: itinerary.dayCount, startDate: itinerary.startDate || "" }) });
      setItinerary(current => current ? { ...current, title } : current);
      setItems(current => current.map(item => item.id === itinerary.id ? { ...item, title } : item));
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function addDay() {
    if (!itinerary || !owner || itinerary.dayCount >= 30) return;
    const day = itinerary.dayCount + 1;
    setBusy(true); setMessage("");
    try {
      await api("/api/itineraries", { method: "PATCH", body: JSON.stringify({ action: "itinerary", itineraryId: itinerary.id, title: planTitle.trim() || itinerary.title, dayCount: day, startDate: itinerary.startDate || "" }) });
      const variant = await api("/api/itineraries", { method: "POST", body: JSON.stringify({ action: "variant", itineraryId: itinerary.id, day, name: "1안", transportMode: "transit" }) });
      await loadPlan(itinerary.id); setActiveDay(day); if (variant.id) setActiveVariantId(variant.id); setMessage(`${day}일차를 추가했습니다.`);
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function addVariant() {
    if (!itinerary || !owner) return;
    setBusy(true); setMessage("");
    try {
      const data = await api("/api/itineraries", { method: "POST", body: JSON.stringify({ action: "variant", itineraryId: itinerary.id, day: activeDay, transportMode: "transit" }) });
      await loadPlan(itinerary.id); if (data.id) setActiveVariantId(data.id); setMessage(`${activeDay}일차에 새 동선안을 추가했습니다.`);
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
  }

  async function saveVariant(variant: Variant, updates: Partial<Variant>) {
    if (!itinerary || !owner) return;
    const next = { ...variant, ...updates };
    setVariants(current => current.map(item => item.id === next.id ? next : item));
    try {
      await api("/api/itineraries", { method: "PATCH", body: JSON.stringify({ action: "variant", itineraryId: itinerary.id, variantId: next.id, name: next.name, transportMode: next.transportMode }) });
    } catch (cause) { setMessage((cause as Error).message); await loadPlan(itinerary.id); }
  }

  async function deleteVariant() {
    if (!itinerary || !activeVariant || !owner || !window.confirm(`${activeVariant.name}을(를) 삭제할까요?`)) return;
    setBusy(true);
    try {
      await api(`/api/itineraries?itineraryId=${encodeURIComponent(itinerary.id)}&variantId=${encodeURIComponent(activeVariant.id)}`, { method: "DELETE" });
      await loadPlan(itinerary.id); setMessage("동선안을 삭제했습니다.");
    } catch (cause) { setMessage((cause as Error).message); } finally { setBusy(false); }
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

    {!itinerary ? <div className="empty-card"><CalendarDays size={30} /><strong>{items.length ? "동선을 선택해 주세요" : "아직 만든 동선이 없어요"}</strong><p>{currentTripId ? "동선 만들기를 누르면 바로 시작할 수 있어요." : "장소 목록을 먼저 만들거나 공유받은 동선을 확인해 보세요."}</p></div> : <>
      <section className="plan-summary">
        <div className="plan-owner-line"><span>{itinerary.access === "owner" ? "내 동선" : `${itinerary.ownerEmail}님의 동선`}</span><span>{itinerary.tripTitle} 장소 목록</span></div>
        {owner ? <label>동선 이름<input value={planTitle} onChange={event => setPlanTitle(event.target.value)} onBlur={() => void saveTitle()} /></label> : <div className="readonly-plan"><strong>{itinerary.title}</strong></div>}
      </section>

      <div className="day-controls"><Tabs value={String(activeDay)} onValueChange={value => setActiveDay(Number(value))} className="planner-days"><TabsList className="day-tabs-list">{Array.from({ length: itinerary.dayCount }, (_, index) => index + 1).map(day => <TabsTrigger key={day} value={String(day)}>{day}일차 {dayDate(itinerary.startDate, day)}</TabsTrigger>)}</TabsList></Tabs>{owner && <button className="compact-button add-day-button" onClick={() => void addDay()} disabled={busy || itinerary.dayCount >= 30}><Plus size={15} /> 일차 추가</button>}</div>

      <div className="variant-heading"><div><strong>{activeDay}일차 동선안</strong><span>{dayVariants.length}개</span></div>{owner && <button className="compact-button" onClick={addVariant} disabled={busy}><CopyPlus size={15} /> 새 안</button>}</div>
      {dayVariants.length > 0 && <div className="variant-tabs">{dayVariants.map(variant => <button key={variant.id} className={activeVariant?.id === variant.id ? "active" : ""} onClick={() => setActiveVariantId(variant.id)}>{variant.name}</button>)}</div>}

      {!activeVariant ? <div className="empty-card route-empty"><MapPin size={28} /><strong>이 일차에는 동선안이 없어요</strong><p>{owner ? "새 안을 추가해 1안, 2안을 비교할 수 있습니다." : "소유자가 동선안을 추가하면 여기에 표시됩니다."}</p></div> : <section className="variant-card">
        <div className="variant-settings">
          {owner ? <input aria-label="동선안 이름" value={activeVariant.name} onChange={event => setVariants(current => current.map(item => item.id === activeVariant.id ? { ...item, name: event.target.value } : item))} onBlur={() => void saveVariant(activeVariant, { name: activeVariant.name })} /> : <strong>{activeVariant.name}</strong>}
          <Select value={activeVariant.transportMode} disabled={!owner} onValueChange={value => void saveVariant(activeVariant, { transportMode: value as Variant["transportMode"] })}><SelectTrigger aria-label="이동수단"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="walk">도보</SelectItem><SelectItem value="transit">대중교통</SelectItem><SelectItem value="drive">차량</SelectItem></SelectContent></Select>
          {owner && <button className="icon-danger" aria-label="동선안 삭제" onClick={deleteVariant}><Trash2 size={15} /></button>}
        </div>

        {activeStops.length ? <div className="route-stop-list">{activeStops.map((stop, index) => {
          const previous = index > 0 ? activeStops[index - 1] : null;
          const estimate = previous ? legEstimate(previous, stop, activeVariant.transportMode) : null;
          const mapsMode = activeVariant.transportMode === "walk" ? "walking" : activeVariant.transportMode === "drive" ? "driving" : "transit";
          return <div key={stop.stopId} className="route-stop-wrap">
            {previous && estimate && <div className="route-leg"><span><Clock3 size={14} /> 약 {estimate.minutes}분 · {estimate.km.toFixed(1)}km</span><a href={`https://www.google.com/maps/dir/?api=1&origin=${previous.lat},${previous.lon}&destination=${stop.lat},${stop.lon}&travelmode=${mapsMode}`} target="_blank" rel="noreferrer">실시간 경로</a></div>}
            <div className="route-stop"><span className="place-number">{index + 1}</span><div><strong>{stop.name}</strong><span>{stop.address || "주소 미등록"}</span></div>{owner && <div className="route-stop-actions"><button aria-label="위로 이동" disabled={index === 0} onClick={() => void moveStop(stop.stopId, -1)}><ArrowUp size={14} /></button><button aria-label="아래로 이동" disabled={index === activeStops.length - 1} onClick={() => void moveStop(stop.stopId, 1)}><ArrowDown size={14} /></button><button aria-label="동선에서 제거" onClick={() => void removeStop(stop.stopId)}><Trash2 size={14} /></button></div>}</div>
          </div>;
        })}</div> : <div className="route-placeholder">저장한 장소를 아래에서 골라 동선을 시작하세요.</div>}

        {owner && <div className="saved-place-picker"><div className="saved-place-heading"><div><strong>저장한 장소</strong><span>눌러서 현재 동선에 추가하세요</span></div><em>{availablePlaces.length}곳</em></div>{places.length === 0 ? <p className="saved-place-empty">장소 목록에 저장한 장소가 없습니다. 먼저 장소 목록에서 장소를 저장해 주세요.</p> : availablePlaces.length ? <div className="saved-place-list">{availablePlaces.map(place => <button key={place.id} onClick={() => void addStop(place.id)} disabled={busy}><MapPin size={16} /><span><strong>{place.name}</strong><small>{place.address || "주소 미등록"}</small></span><Plus size={16} /></button>)}</div> : <p className="saved-place-empty">저장한 장소를 모두 이 동선에 추가했습니다.</p>}</div>}
        <p className="estimate-note">이동시간은 직선거리와 선택한 이동수단을 바탕으로 한 예상치입니다. 교통 상황은 실시간 경로에서 확인하세요.</p>
      </section>}

      {owner && <section className="route-sharing"><div className="sharing-title"><Users size={17} /><strong>이 동선만 공유</strong></div><p>장소 목록의 공유 설정과 별개입니다. 가입한 사용자에게 보기 권한만 부여됩니다.</p><form onSubmit={shareItinerary}><input type="email" placeholder="동행자 이메일" value={shareEmail} onChange={event => setShareEmail(event.target.value)} required /><button disabled={busy}><Share2 size={15} /> 공유</button></form>{shares.length > 0 && <div className="share-list">{shares.map(share => <span key={share.id}>{share.email}<button aria-label={`${share.email} 공유 해제`} onClick={() => void removeShare(share.id)}>×</button></span>)}</div>}</section>}
    </>}
    {message && <p className="status-message" role="status">{message}</p>}
  </div>;
}
