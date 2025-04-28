import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const errorMessage = `${res.status}: ${text}`;
    console.error("API request failed:", errorMessage, "URL:", res.url);
    throw new Error(errorMessage);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { signal?: AbortSignal }
): Promise<any> {
  console.log(`API Request: ${method} ${url}`, data ? JSON.stringify(data) : "no data");
  
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
    
    console.log("Fetch options:", JSON.stringify(fetchOptions));
    
    const res = await fetch(url, fetchOptions);
    
    console.log(`API Response: ${res.status} ${res.statusText} for ${method} ${url}`);
    
    // For debugging, try to read the response body
    let responseText = '';
    try {
      const responseClone = res.clone();
      responseText = await responseClone.text();
      console.log(`Response body: ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`);
    } catch (readError) {
      console.error("Error reading response:", readError);
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
