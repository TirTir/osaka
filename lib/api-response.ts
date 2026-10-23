export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

/** Read API errors without exposing HTML login or gateway pages as JSON errors. */
export async function readApiResponse<T extends { error?: string }>(response: Response): Promise<T> {
  const loginMessage = "로그인이 만료되었거나 접근 권한이 없습니다. 페이지를 새로고침한 뒤 ChatGPT 계정으로 다시 로그인해 주세요.";
  if (response.redirected) throw new ApiError(loginMessage, response.status);
  let data: T;
  try {
    data = await response.json() as T;
  } catch {
    throw new ApiError(response.status === 401 || response.status === 403 ? loginMessage
      : "서버에서 올바른 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.", response.status);
  }
  if (!response.ok) throw new ApiError(data?.error || (response.status === 401 || response.status === 403
    ? loginMessage : "요청을 처리하지 못했습니다."), response.status);
  return data;
}
