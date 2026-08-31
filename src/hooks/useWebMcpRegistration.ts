"use client";

import { useEffect } from "react";
import { useWorkspace } from "@/state/workspace";
import { createWebMcpTools } from "@/core/webmcp/tools";
import { isWebMcpAvailable, registerWebMcpTools } from "@/core/webmcp/register";
import { downloadTextFile } from "@/lib/download";

let registrationPromise: Promise<void> | null = null;

export function useWebMcpRegistration() {
  useEffect(() => {
    const store = useWorkspace.getState();
    if (!isWebMcpAvailable()) {
      store.setWebmcpStatus("unavailable");
      return;
    }
    if (registrationPromise) return;

    store.setWebmcpStatus("registering");
    const context = document.modelContext!;
    registrationPromise = registerWebMcpTools(
      context,
      createWebMcpTools(useWorkspace, { triggerDownload: downloadTextFile }),
    ).then((result) => {
      const state = useWorkspace.getState();
      if (result.status === "error") {
        state.setWebmcpStatus("error", result.failed[0]?.reason ?? "Registration failed");
      } else {
        state.setWebmcpStatus("ready");
        state.setRegisteredTools(result.registered);
      }
    });

    return () => {
      registrationPromise = null;
    };
  }, []);
}
