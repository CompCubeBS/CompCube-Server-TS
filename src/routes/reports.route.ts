import {Router} from "express";
import {playerReportedMatches} from "../../db/schema";

const router = Router();

router.post("/reports/create/", async (req, res) => {
    const {
        matchGuid,
        reporterGuid
    } = req.body as Partial<typeof playerReportedMatches.$inferInsert>;

    const date = new Date();

    const report = await db.insert(playerReportedMatches)
        .values({
            matchGuid: matchGuid,
            reporterGuid: reporterGuid,
            createdAt: date,
        }).returning();


})