"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";

type MapPlace = { id: string; name: string; category: string; lat: number; lon: number; day: number | null; position: number };
type Props = { places: MapPlace[]; activeDay: string; preview: { lat: number; lon: number } | null; onPick?: (point: { lat: number; lon: number }) => void; onSelect?: (id: string) => void };

export default function MapView({ places, activeDay, preview, onPick, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const previewRef = useRef<Marker | null>(null);
  const callbacks = useRef({ onPick, onSelect });
  const [ready, setReady] = useState(false);
  callbacks.current = { onPick, onSelect };

  useEffect(() => {
    let disposed = false;
    void import("maplibre-gl").then(maplibregl => {
      if (disposed || !containerRef.current || mapRef.current) return;
      const map = new maplibregl.Map({ container: containerRef.current, style: "https://tiles.openfreemap.org/styles/liberty", center: [135.5013, 34.6688], zoom: 13 });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.on("click", event => callbacks.current.onPick?.({ lat: event.lngLat.lat, lon: event.lngLat.lng }));
      map.on("style.load", () => {
        // OpenFreeMap carries Korean names for places and POIs when OSM has them.
        for (const layer of map.getStyle().layers || []) {
          if (layer.type !== "symbol" || !["place", "poi", "park"].includes(layer["source-layer"] || "")) continue;
          if (!map.getLayoutProperty(layer.id, "text-field")) continue;
          map.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:ko"], ["get", "name"]]);
        }
        if (!map.getSource("trip-route")) {
          map.addSource("trip-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          map.addLayer({ id: "trip-route-line", type: "line", source: "trip-route", paint: { "line-color": "#d9553c", "line-width": 4, "line-dasharray": [2, 2] } });
        }
        setReady(true);
      });
      mapRef.current = map;
    });
    return () => { disposed = true; markersRef.current.forEach(marker => marker.remove()); previewRef.current?.remove(); mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;
    void import("maplibre-gl").then(maplibregl => {
      if (cancelled || mapRef.current !== map) return;
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = places.map(place => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `map-marker map-marker-${place.category}`;
        button.title = place.name;
        button.setAttribute("aria-label", place.name);
        button.addEventListener("click", event => { event.stopPropagation(); callbacks.current.onSelect?.(place.id); });
        return new maplibregl.Marker({ element: button }).setLngLat([place.lon, place.lat]).addTo(map);
      });
      previewRef.current?.remove();
      previewRef.current = null;
      if (preview) {
        const marker = document.createElement("div");
        marker.className = "map-marker map-marker-preview";
        previewRef.current = new maplibregl.Marker({ element: marker }).setLngLat([preview.lon, preview.lat]).addTo(map);
      }
      const route = activeDay !== "all" && activeDay !== "none" ? [...places].sort((a, b) => a.position - b.position).map(place => [place.lon, place.lat]) : [];
      const source = map.getSource("trip-route") as import("maplibre-gl").GeoJSONSource | undefined;
      if (source) source.setData({ type: "FeatureCollection", features: route.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route } }] : [] });
      if (places.length) {
        const bounds = new maplibregl.LngLatBounds();
        places.forEach(place => bounds.extend([place.lon, place.lat]));
        map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 500 });
      }
    });
    return () => { cancelled = true; };
  }, [places, activeDay, preview, ready]);

  return <div className="map-canvas" ref={containerRef} aria-label="한국어 지명을 우선 표시하는 오사카 지도" />;
}
