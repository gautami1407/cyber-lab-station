import { request } from "./apiClient";
import type { OperationHandle, SubdomainRequest } from "@/types";

export const subdomainService = {
  enumerate(payload: SubdomainRequest) {
    return request<OperationHandle>("/subdomains/enumerate", { method: "POST", body: payload });
  },
};
