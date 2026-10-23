import { env } from "cloudflare:workers";
import TripBoard from "./trip-board";
import { chatGPTSignInPath, requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireChatGPTUser("/?auth=chatgpt");
  const mapsApiKey = env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  return <TripBoard chatGPTSignInHref={chatGPTSignInPath("/?auth=chatgpt")} mapsApiKey={mapsApiKey} />;
}
