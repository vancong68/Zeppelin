import { createStore, Store } from "vuex";

import { AuthStore } from "./auth";
import { DocsStore } from "./docs";
import { GuildStore } from "./guilds";
import { StaffStore } from "./staff";
import { RootState } from "./types";

export const RootStore = createStore({
  modules: {
    auth: AuthStore,
    guilds: GuildStore,
    docs: DocsStore,
    staff: StaffStore,
  },
});

// Set up typings so Vue/our components know about the state's types
declare module "vue" {
  interface ComponentCustomProperties {
    $store: Store<RootState>;
  }
}
