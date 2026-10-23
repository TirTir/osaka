"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";

type MapPlace = { id: string; name: string; category: string; lat: number; lon: number; day: number | null; position: number };
type Props = { apiKey?: string; places: MapPlace[]; activeDay: string; preview: { lat: number; lon: number } | null; routeMode?: boolean; onPick?: (point: { lat: number; lon: number }) => void; onSelect?: (id: string) => void };

// OverlayView preserves the existing accessible marker buttons without requiring
// a separately configured Google Cloud map ID.
function placeMarker(map: google.maps.Map, position: google.maps.LatLngLiteral, element: HTMLElement) {
  class PlaceMarker extends google.maps.OverlayView {
    onAdd() {
      element.style.position = "absolute";
      element.style.transform = "translate(-50%, -50%)";
      this.getPanes()?.overlayMouseTarget.appendChild(element);
      google.maps.OverlayView.preventMapHitsAndGesturesFrom(element);
    }
    draw() {
      const point = this.getProjection().fromLatLngToDivPixel(new google.maps.LatLng(position));
      if (point) { element.style.left = `${point.x}px`; element.style.top = `${point.y}px`; }
    }
    onRemove() { element.remove(); }
  }
  const marker = new PlaceMarker();
  marker.setMap(map);
  return marker;
}

export default function MapView({ apiKey, places, activeDay, preview, routeMode = false, onPick, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const callbacks = useRef({ onPick, onSelect });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  callbacks.current = { onPick, onSelect };

  useEffect(() => {
    let disposed = false;
    let clickListener: google.maps.MapsEventListener | undefined;
    const authError = () => setError("구글 지도 연결을 확인해 주세요. 사이트 관리자에게 문의해 주세요.");
    window.addEventListener("google-maps-auth-error", authError);
    void loadGoogleMaps(apiKey).then(maps => {
      if (disposed || !containerRef.current) return;
      const map = new maps.Map(containerRef.current, {
        center: { lat: 34.6688, lng: 135.5013 }, zoom: 13,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        zoomControl: true, zoomControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM },
        gestureHandling: "greedy", clickableIcons: false,
      });
      clickListener = map.addListener("click", (event: google.maps.MapMouseEvent) => {
        if (event.latLng) callbacks.current.onPick?.({ lat: event.latLng.lat(), lon: event.latLng.lng() });
      });
      mapRef.current = map;
      setReady(true);
    }).catch(() => { if (!disposed) setError("구글 지도를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."); });
    return () => {
      disposed = true;
      window.removeEventListener("google-maps-auth-error", authError);
      clickListener?.remove();
      if (mapRef.current) google.maps.event.clearInstanceListeners(mapRef.current);
      mapRef.current = null;
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const markers = places.map((place, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `map-marker map-marker-${place.category}${routeMode ? " map-marker-route" : ""}`;
      button.title = place.name;
      button.setAttribute("aria-label", place.name);
      if (routeMode) button.textContent = String(index + 1);
      button.addEventListener("click", event => { event.stopPropagation(); callbacks.current.onSelect?.(place.id); });
      return placeMarker(map, { lat: place.lat, lng: place.lon }, button);
    });
    const route = routeMode || (activeDay !== "all" && activeDay !== "none")
      ? [...places].sort((a, b) => a.position - b.position).map(place => ({ lat: place.lat, lng: place.lon })) : [];
    const line = new google.maps.Polyline({
      map, path: route, clickable: false, strokeOpacity: 0,
      icons: [{ icon: { path: "M 0,-1 0,1", strokeColor: "#d9553c", strokeOpacity: 1, strokeWeight: 4, scale: 2 }, offset: "0", repeat: "16px" }],
    });
    return () => { markers.forEach(marker => marker.setMap(null)); line.setMap(null); };
  }, [places, activeDay, ready, routeMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !preview) return;
    const element = document.createElement("div");
    element.className = "map-marker map-marker-preview";
    element.setAttribute("aria-label", "선택한 위치");
    const marker = placeMarker(map, { lat: preview.lat, lng: preview.lon }, element);
    return () => marker.setMap(null);
  }, [preview, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !places.length) return;
    const bounds = new google.maps.LatLngBounds();
    places.forEach(place => bounds.extend({ lat: place.lat, lng: place.lon }));
    const idle = google.maps.event.addListenerOnce(map, "idle", () => {
      if ((map.getZoom() || 0) > 15) map.setZoom(15);
    });
    map.fitBounds(bounds, 70);
    return () => idle.remove();
  }, [places, ready]);

  return <>
    <div className="map-canvas" ref={containerRef} aria-label="한국어로 표시하는 오사카 구글 지도" />
    {(!ready || error) && <div className="map-loading" role={error ? "alert" : "status"}>
      <span>{error || "구글 지도를 불러오는 중…"}</span>
      {error && <button type="button" onClick={() => window.location.reload()}>다시 시도</button>}
    </div>}
  </>;
}
