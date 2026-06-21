import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import bookingRouter from "./booking";
import blocksRouter from "./blocks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(bookingRouter);
router.use(blocksRouter);

export default router;
