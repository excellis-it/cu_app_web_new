import express from 'express';
import { getAuthUrl, getTokens, saveTokens, listCalendarEvents, deleteCalendarEvent, respondCalendarEvent } from '../helpers/googleCalendar.helper';
import USERS from '../db/schemas/users.schema';
import serverResponse from '../helpers/serverResponse';

const router = express.Router();

// Get Google Auth URL
router.get('/url', (req, res) => {
    try {
        const userId = req.query.userId as string;
        if (!userId) {
            return serverResponse(false, 'User ID is required', null, res);
        }
        const url = getAuthUrl(userId);
        serverResponse(true, 'Auth URL generated', url, res);
    } catch (error: any) {
        console.error('Error generating Auth URL:', error);
        serverResponse(false, 'Error generating Auth URL', error.message, res);
    }
});

// Google OAuth2 callback
router.get('/callback', async (req, res) => {
    const { code, state: userId } = req.query;

    if (!code || !userId) {
        return res.status(400).send('Missing code or userId');
    }

    try {
        const tokens = await getTokens(code as string);
        await saveTokens(userId as string, tokens);

        // Sync all ExTalk meetings to Google Calendar IN BACKGROUND
        // Do not await this, to prevent 504 Gateway Time-out
        (async () => {
            try {
                const { syncAllMeetingsToGoogle } = await import('../helpers/googleCalendar.helper');
                console.log(`Starting background sync for user ${userId}...`);
                const syncResult = await syncAllMeetingsToGoogle(userId as string);
                console.log(`Background sync completed for user ${userId}:`, syncResult);
            } catch (err) {
                console.error(`Background sync failed for user ${userId}:`, err);
            }
        })();

        // Redirect back to the frontend immediately
        const frontendUrl = process.env.FRONTEND_LINK || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/messages?googleConnected=success&syncing=true`);
    } catch (error: any) {
        console.error('Error in Google callback:', error);
        res.status(500).send('Authentication failed: ' + error.message);
    }
});

// Check if Google is connected
router.get('/status/:userId', async (req, res) => {
    try {
        const user: any = await USERS.findById(req.params.userId);
        const isConnected = !!(user && user.googleTokens && user.googleTokens.access_token);
        serverResponse(true, 'Connection status fetched', { isConnected }, res);
    } catch (error: any) {
        console.error('Error checking connection status:', error);
        serverResponse(false, 'Error checking status', error.message, res);
    }
});

// Disconnect Google
router.post('/disconnect', async (req, res) => {
    const { userId } = req.body;
    try {
        // Fetch user to preserve tokens for background cleanup
        const user: any = await USERS.findById(userId);
        const googleTokens = user?.googleTokens;

        if (!googleTokens) {
            // Already disconnected
            return serverResponse(true, 'Already disconnected', null, res);
        }

        // Remove the Google tokens from database for instant disconnect
        await USERS.findByIdAndUpdate(userId, {
            $unset: { googleTokens: "" }
        });

        // Send immediate success response
        serverResponse(true, 'Disconnected successfully', null, res);

        // Run the Google Calendar cleanup in the background using preserved tokens
        // This prevents the 30-second timeout while still cleaning up events
        (async () => {
            try {
                // Temporarily restore tokens to user object for deletion
                const tempUser = await USERS.findById(userId);
                if (tempUser) {
                    tempUser.googleTokens = googleTokens;
                    await tempUser.save();

                    // Delete the events
                    const { removeAllMeetingsFromGoogle } = await import('../helpers/googleCalendar.helper');
                    const removeResult = await removeAllMeetingsFromGoogle(userId);
                    console.log(`Background cleanup completed for user ${userId}:`, removeResult);

                    // Remove tokens again after cleanup
                    await USERS.findByIdAndUpdate(userId, {
                        $unset: { googleTokens: "" }
                    });
                }
            } catch (err: any) {
                console.error(`Background cleanup failed for user ${userId}:`, err.message);
            }
        })();

    } catch (error: any) {
        console.error('Error disconnecting:', error);
        serverResponse(false, 'Error disconnecting', error.message, res);
    }
});

// List Google Calendar events
router.get('/events', async (req, res) => {
    const { userId, timeMin, timeMax } = req.query;
    if (!userId) {
        return serverResponse(false, 'User ID is required', null, res);
    }
    try {
        const events = await listCalendarEvents(userId as string, timeMin as string, timeMax as string);
        serverResponse(true, 'Events fetched', events, res);
    } catch (error: any) {
        console.error('Error listing events:', error);
        serverResponse(false, 'Error listing events', error.message, res);
    }
});

// Delete Google Calendar event
router.delete('/events', async (req, res) => {
    const { userId, eventId } = req.query;
    if (!userId || !eventId) {
        return serverResponse(false, 'User ID and Event ID are required', null, res);
    }
    try {
        const success = await deleteCalendarEvent(userId as string, eventId as string);
        if (success) {
            serverResponse(true, 'Event deleted successfully', null, res);
        } else {
            serverResponse(false, 'Failed to delete event', null, res);
        }
    } catch (error: any) {
        console.error('Error deleting event:', error);
        serverResponse(false, 'Error deleting event', error.message, res);
    }
});

// Respond to Google Calendar event
router.post('/respond', async (req, res) => {
    const { userId, eventId, response } = req.body;
    if (!userId || !eventId || !response) {
        return serverResponse(false, 'User ID, Event ID, and Response are required', null, res);
    }
    try {
        const success = await respondCalendarEvent(userId, eventId, response);
        if (success) {
            serverResponse(true, `Successfully responded: ${response}`, null, res);
        } else {
            serverResponse(false, 'Failed to respond to event', null, res);
        }
    } catch (error: any) {
        console.error('Error responding to event:', error);
        serverResponse(false, 'Error responding to event', error.message, res);
    }
});

export default router;
