import {Router} from "express";
import {matches, playerReportedMatches, reports} from "../../db/schema";
import {db} from "../../db/db";
import {requireAuth, requireModerator} from "../middleware/auth.middleware";
import {eq} from "drizzle-orm";
import {accountService} from "../services/account.service";

const router = Router();

router.post("/report", requireAuth, async (req, res) => {
    if (typeof req.body?.targetUserGuid !== "string" || !req.body.targetUserGuid.trim() || typeof req.body.source !== "string" || !["plugin", "website"].includes(req.body.source)) {
        return res.status(400).json({
            error: {
                code: "INVALID_BODY",
                message: "target user guid, and source are required."
            }
        });
    }

    let targetUser;

    try{
        targetUser = await accountService.getByGuid(req.body.targetUserGuid);
    }
    catch(err){
        return res.status(500).json({
            error: {
                code: "INTERNAL_QUERY_ERROR",
                message: "An error occurred while trying to find the target user."
            }
        })
    }

    if (!targetUser) {
        return res.status(404).json({ error: {
                code: "TARGET_USER_NOT_FOUND",
                message: "Target user could not be found."
            }})
    }

    const reason = req.body.reason;

    let targetMatch;

    if (req.body.associatedMatchGuid && typeof(req.body.associatedMatchGuid === "string")) {
        targetMatch = await db.query.matches.findFirst({
            where: eq(matches.guid, req.body.associatedMatchGuid)
        });

        if (!targetMatch){
            return res.status(404).json({error: {
                    code: "TARGET_MATCH_NOT_FOUND",
                    message: "An error occurred while trying to find the target user."
                }})
        }
    }

    let report = await db.insert(reports).values({
        targetUserGuid: targetUser.guid,
        senderUserGuid: req.user.guid,
        reason: reason.trim() ?? "",
        reportSource: req.body.source,
        matchGuid: targetMatch ? targetMatch.guid : null,
    }).returning();

    return res.status(200).json(report[0]);
});

router.post("/report/:guid/resolve", requireModerator(), async (req, res) => {
    let targetReport = await db.query.reports.findFirst({
        where: eq(matches.guid, req.params.guid)
    });

    if (!targetReport) {
        return res.status(404).json({
            error: {
                code: "TARGET_REPORT_NOT_FOUND",
                message: "An error occurred while trying to find the target report."
            }
        });
    }

    const updatedReport = await db.update(reports).set({
        resolved: true
    }).where(eq(reports.guid, targetReport.guid)).returning();

    return res.status(400).json(updatedReport[0]);
});

router.get("/reports", requireModerator, async (req, res) => {
    const reports = await db.query.reports.findMany();

    return res.status(200).json(reports);
});

router.get("/reports/:userGuid", requireModerator, async (req, res) => {
    const targetUser = await accountService.getByGuid(req.params.userGuid);

    if (!targetUser) {
        return res.status(404).json({
            error: {
                code: "TARGET_USER_NOT_FOUND",
                message: "An error occurred while trying to find the target user."
            }
        });
    }

    const reports = await db.query.reports.findMany({
        where: eq(reports.targetUserGuid, targetUser.guid)
    });

    return res.status(200).json(reports);
});