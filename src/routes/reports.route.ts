import {Router} from "express";
import {matches, reports} from "../../db/schema";
import {db} from "../../db/db";
import {requireAuth, requireModerator} from "../middleware/auth.middleware";
import {and, eq} from "drizzle-orm";
import {accountService} from "../services/account.service";

const router = Router();

/**
 * @openapi
 * /report:
 *   post:
 *     tags: [Reports]
 *     summary: Report a player
 *     description: |
 *       Creates a player report from the website or plugin. Reports are intentionally not limited
 *       to match participants: a logged-in user may report from a player profile, and a spectator
 *       may report behavior they observed.
 *
 *       Authentication is required through either a BeatKhana bearer token or the `cc_auth_token`
 *       browser session cookie. The authenticated account is always used as the sender. A match GUID
 *       may be supplied as optional supporting context, but the report remains valid without one.
 *       A user cannot report themself and cannot report the same target more than once per 24 hours.
 *     operationId: createPlayerReport
 *     security:
 *       - BeatKhanaAuth: []
 *       - SessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePlayerReportRequest'
 *           examples:
 *             profileReport:
 *               summary: General report from a player profile
 *               value:
 *                 targetUserGuid: 5b1150de-ae46-44cc-b63d-b619b2f89ed5
 *                 reason: This player repeatedly harassed other users in public spaces.
 *                 source: website
 *             spectatorMatchReport:
 *               summary: A spectator supplies optional match context
 *               value:
 *                 targetUserGuid: 5b1150de-ae46-44cc-b63d-b619b2f89ed5
 *                 associatedMatchGuid: c68dfca4-46dd-456e-9eb6-e9a69b19f88e
 *                 reason: I observed this player abusing an exploit during the match.
 *                 source: website
 *     responses:
 *       200:
 *         description: The report was created and queued for moderator review.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Report' }
 *       400:
 *         description: Required request data is invalid, or the sender attempted to report themself.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *             examples:
 *               invalidBody:
 *                 value: { error: { code: INVALID_BODY, message: Target user guid and source are required. } }
 *               selfReport:
 *                 value: { error: { code: SELF_REPORT, message: You cannot report yourself. } }
 *       401:
 *         description: No valid BeatKhana bearer token or session cookie was provided.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       403:
 *         description: The sender reported this target during the previous 24 hours.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *             example: { error: { code: TOO_MANY_REPORTS, message: You have reported this player too recently. } }
 *       404:
 *         description: The target user or optional associated match could not be found.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       500:
 *         description: The report could not be created because of an internal query failure.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 */
router.post("/report", requireAuth, async (req, res) => {
    if (typeof req.body?.targetUserGuid !== "string" || !req.body.targetUserGuid.trim() || typeof req.body.source !== "string" || !["plugin", "website"].includes(req.body.source)) {
        return res.status(400).json({
            error: {
                code: "INVALID_BODY",
                message: "Target user guid and source are required."
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
        return res.status(404).json({
            error: {
                code: "TARGET_USER_NOT_FOUND",
                message: "Target user could not be found."
            }
        });
    }

    if (targetUser.guid === req.user!.guid) {
        return res.status(400).json({
            error: {
                code: "SELF_REPORT",
                message: "You cannot report yourself."
            }
        });
    }

    const lastReportAgainstPlayer = await db.query.reports.findFirst({
        where: and(eq(reports.targetUserGuid, targetUser.guid), eq(reports.senderUserGuid, req.user!.guid))
    });

    if (lastReportAgainstPlayer && lastReportAgainstPlayer.createdAt > new Date(Date.now() - 1000 * 60 * 60 * 24)) {
        return res.status(403).json({
            error: {
                code: "TOO_MANY_REPORTS",
                message: "You have reported this player too recently."
            }
        })
    }

    const reason = req.body.reason;

    let targetMatch;

    if (req.body.associatedMatchGuid && typeof(req.body.associatedMatchGuid === "string")) {
        targetMatch = await db.query.matches.findFirst({
            where: eq(matches.guid, req.body.associatedMatchGuid)
        });

        if (!targetMatch){
            return res.status(404).json({
                error: {
                    code: "TARGET_MATCH_NOT_FOUND",
                    message: "An error occurred while trying to find the target user."
                }
            });
        }
    }

    let report = await db.insert(reports).values({
        targetUserGuid: targetUser.guid,
        senderUserGuid: req.user!.guid,
        reason: reason.trim() ?? "",
        reportSource: req.body.source,
        matchGuid: targetMatch ? targetMatch.guid : null,
    }).returning();

    return res.status(200).json(report[0]);
});

/**
 * @openapi
 * /report/{reportGuid}/resolve:
 *   post:
 *     tags: [Reports]
 *     summary: Resolve a player report
 *     description: Marks a report as resolved. Requires a moderator, administrator, or developer account.
 *     operationId: resolvePlayerReport
 *     security:
 *       - BeatKhanaAuth: []
 *       - SessionCookie: []
 *     x-required-permissions: [role:moderator, role:admin, role:dev]
 *     parameters:
 *       - in: path
 *         name: reportGuid
 *         required: true
 *         description: CompCube GUID of the report to resolve.
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: The updated report with `resolved` set to true.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Report' }
 *       401:
 *         description: Authentication is required.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ApiError' } } }
 *       403:
 *         description: The authenticated account lacks a moderation role.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ApiError' } } }
 *       404:
 *         description: The report does not exist.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *             example: { error: { code: TARGET_REPORT_NOT_FOUND, message: An error occurred while trying to find the target report. } }
 */
router.post("/report/:guid/resolve", requireModerator, async (req, res) => {
    let targetReport = await db.query.reports.findFirst({
        where: eq(reports.guid, req.params.guid as string)
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

    return res.status(200).json(updatedReport[0]);
});

/**
 * @openapi
 * /reports:
 *   get:
 *     tags: [Reports]
 *     summary: List player reports
 *     description: Returns reports visible to moderators, including sender and target user records. Requires a moderator, administrator, or developer account.
 *     operationId: listPlayerReports
 *     security:
 *       - BeatKhanaAuth: []
 *       - SessionCookie: []
 *     x-required-permissions: [role:moderator, role:admin, role:dev]
 *     parameters:
 *       - in: query
 *         name: filter
 *         required: false
 *         description: Filters by resolution status. Defaults to `all`.
 *         schema:
 *           type: string
 *           enum: [all, unresolved, resolved]
 *           default: all
 *     responses:
 *       200:
 *         description: Reports matching the selected resolution filter.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/ReportWithUsers' }
 *       400:
 *         description: The filter is not `all`, `unresolved`, or `resolved`.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *             example: { error: { code: INVALID_QUERY, message: Query contains invalid filter. Must be all, unresolved, or resolved. } }
 *       401:
 *         description: Authentication is required.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ApiError' } } }
 *       403:
 *         description: The authenticated account lacks a moderation role.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ApiError' } } }
 */
router.get("/reports", requireModerator, async (req, res) => {
    let filter = req.query.filter;

    let filteredReports;

    if (!filter)
        filter = "all";

    if (filter === "all")
        filteredReports = await db.query.reports.findMany({
            with: {
                sender: true,
                target: true
            }
        });

    if (filter === "resolved")
        filteredReports = await db.query.reports.findMany({
            with: {
                sender: true,
                target: true
            },
            // i assume this is how you are supposed to check this
            where: eq(reports.resolved, true)
        });

    if (filter === "unresolved")
        filteredReports = await db.query.reports.findMany({
            with: {
                sender: true,
                target: true
            },
            where: eq(reports.resolved, false)
        });

    if (!filteredReports)
        return res.status(400).json({
            error: {
                code: "INVALID_QUERY",
                message: "Query contains invalid filter. Must be all, unresolved, or resolved."
            }
        });

    return res.status(200).json(filteredReports);
});

/**
 * @openapi
 * /reports/{userGuid}:
 *   get:
 *     tags: [Reports]
 *     summary: List reports against one player
 *     description: Returns every report targeting the requested player. Requires a moderator, administrator, or developer account.
 *     operationId: listPlayerReportsByTarget
 *     security:
 *       - BeatKhanaAuth: []
 *       - SessionCookie: []
 *     x-required-permissions: [role:moderator, role:admin, role:dev]
 *     parameters:
 *       - in: path
 *         name: userGuid
 *         required: true
 *         description: CompCube GUID of the reported player.
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Reports targeting the requested player.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Report' }
 *       401:
 *         description: Authentication is required.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ApiError' } } }
 *       403:
 *         description: The authenticated account lacks a moderation role.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ApiError' } } }
 *       404:
 *         description: The target user does not exist.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *             example: { error: { code: TARGET_USER_NOT_FOUND, message: An error occurred while trying to find the target user. } }
 */
router.get("/reports/:userGuid", requireModerator, async (req, res) => {
    const targetUser = await accountService.getByGuid(req.params.userGuid as string);

    if (!targetUser) {
        return res.status(404).json({
            error: {
                code: "TARGET_USER_NOT_FOUND",
                message: "An error occurred while trying to find the target user."
            }
        });
    }

    const allReports = await db.query.reports.findMany({
        where: eq(reports.targetUserGuid, targetUser.guid)
    });

    return res.status(200).json(allReports);
});

export default router;
