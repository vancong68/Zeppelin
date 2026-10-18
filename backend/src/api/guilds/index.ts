import express from "express";
import { apiTokenAuthHandlers } from "../auth.js";
import { initGuildsImportExportAPI } from "./importExport.js";
import { initGuildsMiscAPI } from "./misc.js";
import { initGuildsPermanentRemovalAPI } from "./permanentRemoval.js";

export function initGuildsAPI(router: express.Router) {
  const guildRouter = express.Router();
  guildRouter.use(...apiTokenAuthHandlers());

  initGuildsMiscAPI(guildRouter);
  initGuildsImportExportAPI(guildRouter);
  initGuildsPermanentRemovalAPI(guildRouter);

  router.use("/guilds", guildRouter);
}
