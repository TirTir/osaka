import TripBoard from "./trip-board";
import { chatGPTSignInPath } from "./chatgpt-auth";

export default function Home() {
  return <TripBoard chatGPTSignInHref={chatGPTSignInPath("/?auth=chatgpt")} />;
}
