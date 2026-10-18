<template>
  <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 md:p-8">
    <div class="w-full max-w-2xl rounded border border-gray-700 bg-gray-800 p-6 shadow-xl">
      <h2 class="text-xl font-semibold text-red-400">Remove server permanently</h2>

      <template v-if="result == null">
        <p class="mt-2">
          You are about to permanently remove <strong>{{ guild.name }}</strong>
          <span class="text-gray-400">({{ guild.id }})</span> from Zeppelin. This cannot be undone.
        </p>

        <div v-if="loadingPreview" class="mt-4 text-gray-400">Loading server data...</div>

        <div v-else-if="previewError" class="mt-4 rounded bg-red-900/40 p-3">
          Could not load the server's data: {{ previewError }}
        </div>

        <template v-else-if="preview">
          <div class="mt-4 rounded bg-gray-900 p-3">
            <h3 class="font-semibold">Always removed</h3>
            <p class="text-sm text-gray-400">
              {{ preview.always.total }} records will be deleted, including the server's registration, configuration
              and dashboard access.
            </p>
            <ul v-if="alwaysItems.length" class="mt-1 text-sm text-gray-400">
              <li v-for="item in alwaysItems" :key="item.table">{{ item.count }} × {{ item.label }}</li>
            </ul>
          </div>

          <div class="mt-4 rounded bg-gray-900 p-3">
            <h3 class="font-semibold">Historical records</h3>
            <label class="mt-1 flex items-start gap-2">
              <input type="checkbox" v-model="deleteHistoricalData" class="mt-1" />
              <span>
                Also delete historical and moderation records
                <span class="text-gray-400">({{ preview.historical.total }} records)</span>
              </span>
            </label>
            <ul v-if="historicalItems.length" class="mt-1 text-sm text-gray-400">
              <li v-for="item in historicalItems" :key="item.table">{{ item.count }} × {{ item.label }}</li>
            </ul>
            <p class="mt-1 text-sm text-gray-400">
              {{
                deleteHistoricalData
                  ? "These records will be deleted along with everything else."
                  : "If left unchecked, these records are kept in the database."
              }}
            </p>
          </div>

          <div class="mt-4 rounded bg-gray-900 p-3">
            <h3 class="font-semibold">Discord server</h3>
            <label class="mt-1 flex items-start gap-2">
              <input type="checkbox" v-model="leaveDiscordServer" class="mt-1" />
              <span>Also make the Zeppelin bot leave the Discord server</span>
            </label>
            <p v-if="!leaveDiscordServer" class="mt-1 text-sm text-gray-400">
              If left unchecked, the bot stays in the Discord server.
            </p>
          </div>

          <div class="mt-4">
            <label class="block">
              Type <strong>{{ guild.id }}</strong> to confirm:
              <input
                v-model="typedGuildId"
                type="text"
                class="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1"
                :placeholder="guild.id"
                autocomplete="off"
              />
            </label>
          </div>

          <div v-if="submitError" class="mt-4 rounded bg-red-900/40 p-3">{{ submitError }}</div>

          <div class="mt-6 flex justify-end gap-3">
            <button
              type="button"
              class="rounded bg-gray-700 px-3 py-1 hover:bg-gray-600"
              :disabled="submitting"
              @click="$emit('close')"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded bg-red-900 px-3 py-1 hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!canSubmit"
              @click="confirmRemoval"
            >
              {{ submitting ? "Removing..." : "Remove server permanently" }}
            </button>
          </div>
        </template>
      </template>

      <template v-else>
        <p class="mt-4">
          <strong>{{ guild.name }}</strong> <span class="text-gray-400">({{ guild.id }})</span> has been removed from
          Zeppelin.
        </p>
        <ul class="mt-2 text-sm text-gray-400">
          <li v-if="result.alreadyRemoved">The server had already been removed; nothing was left to delete.</li>
          <li v-else>{{ deletedTotal }} records were deleted.</li>
          <li v-if="result.deleteHistoricalData">Historical and moderation records were deleted as requested.</li>
          <li v-else>Historical and moderation records were kept.</li>
          <li v-if="result.discord.requested && result.discord.left">The bot left the Discord server.</li>
        </ul>

        <div v-if="result.discord.requested && !result.discord.left" class="mt-4 rounded bg-red-900/40 p-3">
          The server was removed from Zeppelin, but the bot could not leave the Discord server:
          {{ result.discord.error }}. You can retry with only the "bot leaves the Discord server" option selected.
        </div>

        <div class="mt-6 flex justify-end">
          <button type="button" class="rounded bg-gray-700 px-3 py-1 hover:bg-gray-600" @click="$emit('removed')">
            Close
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { PropType } from "vue";
import { ApiError } from "../../api";

interface RemovalGuild {
  id: string;
  name: string;
  icon: string | null;
}

interface CountGroup {
  total: number;
  byTable: Record<string, number>;
}

interface RemovalPreview {
  guild: RemovalGuild | null;
  registryRecord: boolean;
  always: CountGroup;
  historical: CountGroup;
}

interface RemovalResult {
  result: "ok";
  guildId: string;
  alreadyRemoved: boolean;
  deleteHistoricalData: boolean;
  deleted: {
    always: Record<string, number>;
    historical: Record<string, number>;
  };
  discord: {
    requested: boolean;
    left: boolean | null;
    error: string | null;
  };
}

export default {
  props: {
    guild: {
      type: Object as PropType<RemovalGuild>,
      required: true,
    },
  },

  emits: ["close", "removed"],

  data() {
    return {
      loadingPreview: true,
      previewError: "",
      preview: null as RemovalPreview | null,
      deleteHistoricalData: false,
      leaveDiscordServer: false,
      typedGuildId: "",
      submitting: false,
      submitError: "",
      result: null as RemovalResult | null,
      tableLabels: {
        allowed_guilds: "managed server registry entry",
        configs: "configuration revisions",
        api_permissions: "dashboard access assignments",
        api_audit_log: "dashboard audit log entries",
        antiraid_levels: "antiraid levels",
        auto_reactions: "command auto-reactions",
        button_roles: "button roles",
        context_menus: "context menu links",
        counters: "counters",
        counter_triggers: "counter triggers",
        counter_trigger_states: "counter trigger states",
        counter_values: "counter values",
        member_cache: "cached members",
        member_timezones: "member timezones",
        persisted_data: "persisted plugin data",
        pingable_roles: "pingable roles",
        reaction_roles: "reaction roles",
        reminders: "pending reminders",
        role_buttons: "role buttons",
        role_queue: "role queue entries",
        scheduled_posts: "scheduled posts",
        slowmode_channels: "slowmode channels",
        slowmode_users: "slowmode users",
        stats: "statistics",
        tags: "tags",
        tag_responses: "tag responses",
        vc_alerts: "voice channel alerts",
        webhooks: "webhooks",
        cases: "moderation cases",
        case_notes: "case notes",
        mutes: "mutes",
        tempbans: "temporary bans",
        archives: "archived message logs",
        messages: "saved messages",
        nickname_history: "nickname history entries",
        starboard_messages: "starboard entries",
        starboard_reactions: "starboard reactions",
      } as Record<string, string>,
    };
  },

  computed: {
    alwaysItems() {
      return this.preview ? this.toItems(this.preview.always.byTable) : [];
    },

    historicalItems() {
      return this.preview ? this.toItems(this.preview.historical.byTable) : [];
    },

    canSubmit(): boolean {
      return !this.submitting && this.preview != null && this.typedGuildId.trim() === this.guild.id;
    },

    deletedTotal(): number {
      if (!this.result) return 0;

      const sum = (counts: Record<string, number>) => Object.values(counts).reduce((total, count) => total + count, 0);
      const historical = this.result.deleteHistoricalData ? sum(this.result.deleted.historical) : 0;
      return sum(this.result.deleted.always) + historical;
    },
  },

  async mounted() {
    try {
      this.preview = await this.$store.dispatch("guilds/loadRemovalPreview", this.guild.id);
    } catch (err) {
      this.previewError = err instanceof ApiError ? (err.body?.error ?? err.message) : String(err);
    } finally {
      this.loadingPreview = false;
    }
  },

  methods: {
    toItems(byTable: Record<string, number>) {
      return Object.entries(byTable)
        .sort((a, b) => b[1] - a[1])
        .map(([table, count]) => ({ table, count, label: this.tableLabels[table] ?? table.replaceAll("_", " ") }));
    },

    async confirmRemoval() {
      if (!this.canSubmit) return;

      this.submitting = true;
      this.submitError = "";

      try {
        this.result = await this.$store.dispatch("guilds/removeGuildPermanently", {
          guildId: this.guild.id,
          confirmGuildId: this.typedGuildId.trim(),
          deleteHistoricalData: this.deleteHistoricalData,
          leaveDiscordServer: this.leaveDiscordServer,
        });
      } catch (err) {
        const message = err instanceof ApiError ? (err.body?.error ?? err.message) : String(err);
        this.submitError = `Removal failed: ${message}`;
      } finally {
        this.submitting = false;
      }
    },
  },
};
</script>
