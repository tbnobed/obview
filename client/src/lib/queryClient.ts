import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    
    // Try to parse the error as JSON
    let errorMessage = '';
    try {
      if (text && text.trim().startsWith('{')) {
        const errorJson = JSON.parse(text);
        errorMessage = errorJson.message || JSON.stringify(errorJson);
      } else {
        errorMessage = text || res.statusText;
      }
    } catch (e) {
      errorMessage = text || res.statusText;
    }
    
    console.error("API request failed:", errorMessage, "URL:", res.url);
    throw new Error(errorMessage);
  }
}

// NOTE: deliberately no logging of request/response bodies here — they can
// contain credentials (e.g. the login password) and end up in user consoles,
// screenshots and pasted bug reports.
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { signal?: AbortSignal }
): Promise<any> {
  try {
    const headers: Record<string, string> = {};
    if (data) {
      headers["Content-Type"] = "application/json";
    }
    
    const fetchOptions = {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include" as RequestCredentials,
      signal: options?.signal,
    };
    
    const res = await fetch(url, fetchOptions);
    
    let responseText = '';
    try {
      const responseClone = res.clone();
      responseText = await responseClone.text();
    } catch {
      /* body read is best-effort; JSON parse below just falls through */
    }
    
    await throwIfResNotOk(res);
    
    // Parse JSON if the response isn't empty
    if (responseText) {
      try {
        return JSON.parse(responseText);
      } catch (jsonError) {
        console.error("Error parsing JSON:", jsonError);
        return responseText; // Return text if JSON parsing fails
      }
    }
    
    return null; // Return null for empty responses
  } catch (error) {
    console.error(`API Request failed: ${method} ${url}`, error);
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include" as RequestCredentials,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
