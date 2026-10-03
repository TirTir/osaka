/// <reference types="google.maps" />

let loading: Promise<typeof google.maps> | undefined;

export function loadGoogleMaps() {
  if (loading) return loading;
  loading = (async () => {
    const response = await fetch("/api/maps-config");
    if (!response.ok) throw new Error("지도를 불러오지 못했습니다.");
    const { apiKey } = await response.json() as { apiKey: string };
    return new Promise<typeof google.maps>((resolve, reject) => {
      const target = window as typeof window & { initOsakaGoogleMap?: () => void; gm_authFailure?: () => void };
      const script = document.createElement("script");
      const timeout = window.setTimeout(() => fail(), 20000);
      const fail = () => {
        window.clearTimeout(timeout);
        script.remove();
        reject(new Error("구글 지도를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
      };
      target.gm_authFailure = () => {
        fail();
        window.dispatchEvent(new Event("google-maps-auth-error"));
      };
      target.initOsakaGoogleMap = () => {
        window.clearTimeout(timeout);
        resolve(google.maps);
      };
      const params = new URLSearchParams({ key: apiKey, callback: "initOsakaGoogleMap", loading: "async", v: "quarterly", language: "ko", region: "JP" });
      script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
      script.async = true;
      script.onerror = fail;
      document.head.appendChild(script);
    });
  })().catch(error => { loading = undefined; throw error; });
  return loading;
}
