import express, { Request, Response } from "express";
import { isStaff } from "../staff.js";
import { apiTokenAuthHandlers } from "./auth.js";

export function initStaff(router: express.Router) {
  const staffRouter = express.Router();
  staffRouter.use(...apiTokenAuthHandlers());

  staffRouter.get("/status", (req: Request, res: Response) => {
    const userIsStaff = isStaff(req.user!.userId);
    res.json({ isStaff: userIsStaff });
  });

  router.use("/staff", staffRouter);
}
