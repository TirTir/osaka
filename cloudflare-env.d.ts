declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GEOAPIFY_API_KEY?: string;
    GOOGLE_MAPS_API_KEY?: string;
  }
}
