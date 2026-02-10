import type { SubmitRequest, SubmitResponse } from "./types";

export async function fetchDiff(): Promise<string> {
  const response = await fetch("/api/diff");
  if (!response.ok) {
    throw new Error("Failed to fetch diff");
  }
  return response.text();
}

export async function submitComments(payload: SubmitRequest): Promise<SubmitResponse> {
  const response = await fetch("/api/comments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to submit comments");
  }

  return response.json() as Promise<SubmitResponse>;
}
