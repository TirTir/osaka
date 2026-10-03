import TripBoard from "./trip-board";
import { chatGPTSignInPath, requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireChatGPTUser("/?auth=chatgpt");
  return <TripBoard chatGPTSignInHref={chatGPTSignInPath("/?auth=chatgpt")} />;
}
