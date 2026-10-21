import { loadGoogleMaps } from "./google-maps";

export type GoogleSearchPlace = {
  sourceId: string; name: string; address: string; lat: number; lon: number;
  category: string; openingHours: string; websiteUrl: string; menuUrl: string;
  googleMapsUrl: string; attributions: { provider: string; url: string }[];
};

function errorCode(cause: unknown) {
  const code = typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : "UNKNOWN";
  return /^[A-Z0-9_]{1,64}$/.test(code) ? code : "UNKNOWN";
}

async function observe<T>(operation: "search" | "details", run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  const requestId = crypto.randomUUID();
  let code = "OK";
  let count: number | undefined;
  try {
    const result = await run();
    if (Array.isArray(result)) count = result.length;
    return result;
  } catch (cause) {
    code = errorCode(cause);
    console.error("google_places_failed", { requestId, operation, code });
    throw new Error(`구글 장소 ${operation === "search" ? "검색" : "상세 조회"}에 실패했습니다. 잠시 후 다시 시도해 주세요. (문의 번호: ${requestId})`);
  } finally {
    // Log only diagnostic metadata; never search text, credentials or provider error messages.
    void fetch("/api/search-events", {
      method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ requestId, operation, code, count, durationMs: Math.round(performance.now() - started) }),
    }).catch(() => {});
  }
}

function category(types: string[] = []) {
  if (types.some(type => ["lodging", "hotel", "hostel", "guest_house", "motel", "resort_hotel"].includes(type))) return "stay";
  if (types.some(type => ["restaurant", "cafe", "bakery", "bar", "food", "meal_takeaway"].includes(type) || type.endsWith("_restaurant"))) return "food";
  return "place";
}

export function searchGooglePlaces(query: string): Promise<GoogleSearchPlace[]> {
  return observe("search", async () => {
    const maps = await loadGoogleMaps();
    const { Place } = await maps.importLibrary("places") as google.maps.PlacesLibrary;
    const { places } = await Place.searchByText({
      textQuery: query.trim(), language: "ko", region: "jp", maxResultCount: 12,
      locationBias: { south: 34.3, west: 135.1, north: 35.2, east: 135.9 },
      fields: ["id", "displayName", "formattedAddress", "location", "types", "googleMapsURI", "attributions"],
    });
    return places.filter(place => place.location).map(place => ({
      sourceId: `google:${place.id}`, name: place.displayName || query,
      address: place.formattedAddress || "", lat: place.location!.lat(), lon: place.location!.lng(),
      category: category(place.types), openingHours: "", websiteUrl: "", menuUrl: "",
      googleMapsUrl: place.googleMapsURI || "",
      attributions: (place.attributions || []).map(item => ({ provider: item.provider || "", url: item.providerURI || "" })),
    }));
  });
}

export function googlePlaceDetails(sourceId: string) {
  return observe("details", async () => {
    const maps = await loadGoogleMaps();
    const { Place } = await maps.importLibrary("places") as google.maps.PlacesLibrary;
    const place = new Place({ id: sourceId.slice("google:".length), requestedLanguage: "ko", requestedRegion: "jp" });
    await place.fetchFields({ fields: ["regularOpeningHours", "websiteURI"] });
    return { openingHours: place.regularOpeningHours?.weekdayDescriptions?.join("\n") || "", websiteUrl: place.websiteURI || "" };
  });
}
