import { asyncHandler } from '../middleware/errorHandler.js';
import { getUserSessions } from '../services/supabase.js';

/**
 * GET /stats/user/:wallet
 * Get aggregated user statistics
 */
export const getUserStats = asyncHandler(async (req, res) => {
    const { wallet } = req.params;

    if (!wallet) {
        return res.status(400).json({
            error: 'Wallet address is required'
        });
    }

    // Get all sessions for this user
    const sessions = await getUserSessions(wallet);

    // Calculate aggregated stats
    const totalSessions = sessions.length;
    const totalDataUsed = sessions.reduce((sum, s) => sum + (s.data_used_bytes || 0), 0);
    const totalSpent = sessions.reduce((sum, s) => sum + (s.cost_nanoton || 0), 0);
    const totalDuration = sessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);

    // Count active sessions
    const activeSessions = sessions.filter(s => s.status === 'active').length;

    // Get recent sessions (last 5)
    const recentSessions = sessions.slice(0, 5).map(s => ({
        id: s.id,
        node: {
            country: s.nodes?.country,
            region: s.nodes?.region,
            city: s.nodes?.city
        },
        status: s.status,
        startTime: s.start_time || s.created_at,
        endTime: s.end_time,
        dataUsed: s.data_used_bytes || 0,
        cost: s.cost_nanoton || 0,
        duration: s.duration_seconds || 0
    }));

    res.json({
        success: true,
        stats: {
            totalSessions,
            activeSessions,
            totalDataUsed, // bytes
            totalSpent, // nanoTON
            totalDuration, // seconds
            recentSessions
        }
    });
});

export default {
    getUserStats
};
