import { Api } from "@newstackdev/iosdk-newgraph-client-js";
export class CreatorApi extends Api<{ token: string }> {}

import { ErrorResponse, UserReadPrivateResponse } from "@newstackdev/iosdk-newgraph-client-js";

export const NewgraphApi = (() => {
  let _api: CreatorApi;
  let _token = "";

  return {
    initialize(baseUrl: string) {
      _api = new CreatorApi({
        baseUrl,
        securityWorker: (securityData: { token: string } | null) => {
          return !securityData ? {} : { headers: { Authorization: `newsafe ${securityData.token}` } };
        },
      });
      return _api;
    },
    getCurrentToken() {
      return _token;
    },
    updateToken(token: string) {
      _token = token;
      _api.setSecurityData({ token });
    },
    async authorize(): Promise<UserReadPrivateResponse> {
      try {
        console.log("Sending current user request with token:", _token.substring(0, 20) + "...");
        const r = await _api.user.currentList();
        console.log("Current user response:", r.data);
        return r.data;
      } catch (_ex) {
        const ex: { error: ErrorResponse } = _ex as any;
        console.error("Authorization failed:", {
          error: ex.error,
          status: (ex as any)?.status,
          headers: (ex as any)?.headers
        });
        throw ex;
      }
    },
    get api() {
      return _api
    }
  };
});
