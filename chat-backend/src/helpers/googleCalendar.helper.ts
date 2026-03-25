import { google } from 'googleapis';
import USERS from '../db/schemas/users.schema';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:9000/api/v1/auth/google/callback';

const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
);

export const getAuthUrl = (userId: string) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        throw new Error('Google API credentials are not configured in .env file');
    }
    const scopes = [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
    ];

    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        state: userId, // Pass userId in state to identify the user in callback
        prompt: 'consent'
    });
};

export const getTokens = async (code: string) => {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
};

export const saveTokens = async (userId: string, tokens: any) => {
    await USERS.findByIdAndUpdate(userId, {
        googleTokens: tokens
    });
};

export const getCalendarClient = async (userId: string) => {
    const user: any = await USERS.findById(userId);
    if (!user || !user.googleTokens) {
        throw new Error('User not connected to Google Calendar');
    }

    const client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
    );

    client.setCredentials(user.googleTokens);

    // Handle token refresh
    client.on('tokens', async (tokens) => {
        if (tokens.refresh_token) {
            // we have a new refresh token
            await USERS.findByIdAndUpdate(userId, {
                'googleTokens.refresh_token': tokens.refresh_token
            });
        }
        if (tokens.access_token) {
            await USERS.findByIdAndUpdate(userId, {
                'googleTokens.access_token': tokens.access_token,
                'googleTokens.expiry_date': tokens.expiry_date
            });
        }
    });

    return google.calendar({ version: 'v3', auth: client });
};

export const createCalendarEvent = async (userId: string, eventDetails: any) => {
    try {
        console.log(`Creating calendar event for user ${userId}:`, eventDetails);
        const calendar = await getCalendarClient(userId);
        const event = {
            summary: eventDetails.summary,
            description: eventDetails.description,
            start: {
                dateTime: new Date(eventDetails.startTime).toISOString(),
                timeZone: eventDetails.timeZone || 'UTC',
            },
            end: {
                dateTime: new Date(eventDetails.endTime).toISOString(),
                timeZone: eventDetails.timeZone || 'UTC',
            },
            // No conferenceData - just a regular event
        };

        const response = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: event,
        });

        console.log('Calendar event created successfully:', response.data.id);
        return response.data;
    } catch (error: any) {
        console.error('Error creating calendar event:', error.message, error.stack);
        if (error.response && error.response.data) {
            console.error('Google API Error Response:', JSON.stringify(error.response.data));
        }
        return null;
    }
};

export const updateCalendarEvent = async (userId: string, eventId: string, eventDetails: any) => {
    try {
        console.log(`Updating calendar event ${eventId} for user ${userId}:`, eventDetails);
        const calendar = await getCalendarClient(userId);

        const event: any = {
            summary: eventDetails.summary,
            description: eventDetails.description,
        };

        if (eventDetails.startTime) {
            event.start = {
                dateTime: new Date(eventDetails.startTime).toISOString(),
                timeZone: eventDetails.timeZone || 'UTC',
            };
        }

        if (eventDetails.endTime) {
            event.end = {
                dateTime: new Date(eventDetails.endTime).toISOString(),
                timeZone: eventDetails.timeZone || 'UTC',
            };
        }

        const response = await calendar.events.patch({
            calendarId: 'primary',
            eventId: eventId,
            requestBody: event,
        });

        console.log('Calendar event updated successfully:', response.data.id);
        return response.data;
    } catch (error: any) {
        console.error('Error updating calendar event:', error.message);
        return null;
    }
};

export const listCalendarEvents = async (userId: string, timeMin: string, timeMax: string) => {
    try {
        const client = await getCalendarClient(userId);

        // 1. Get list of all calendars (including Holiday and Shared calendars)
        const calendarList = await client.calendarList.list({
            showHidden: true,
            minAccessRole: 'reader'
        });
        const calendars = calendarList.data.items || [];

        console.log(`[Google Calendar] Found ${calendars.length} calendars for user ${userId}`);
        calendars.forEach(cal => {
            console.log(`[Google Calendar] - ${cal.summary} (ID: ${cal.id})`);
        });

        const allEvents: any[] = [];

        // 2. Fetch events from EACH calendar
        for (const cal of calendars) {
            try {
                // Comprehensive holiday calendar detection
                const calIdLower = cal.id?.toLowerCase() || '';
                const calSummaryLower = cal.summary?.toLowerCase() || '';

                const isHolidayCal =
                    calIdLower.includes('holiday') ||
                    calIdLower.includes('#holiday@') ||
                    calSummaryLower.includes('holiday') ||
                    calSummaryLower.includes('holidays') ||
                    // Google's regional holiday calendars pattern
                    (calIdLower.includes('.holiday@') && calIdLower.includes('group.v.calendar.google.com')) ||
                    // Additional patterns
                    calSummaryLower.includes('observance') ||
                    calSummaryLower.includes('festival');

                const response = await client.events.list({
                    calendarId: cal.id!,
                    timeMin: timeMin,
                    timeMax: timeMax,
                    singleEvents: true,
                    orderBy: 'startTime',
                });

                if (response.data.items && response.data.items.length > 0) {
                    console.log(`[Google Calendar] Fetched ${response.data.items.length} events from "${cal.summary}" (isHolidayCal: ${isHolidayCal})`);

                    const taggedEvents = response.data.items.map(item => {
                        const eventIsHoliday = isHolidayCal || item.description?.toLowerCase().includes('holiday');
                        return {
                            ...item,
                            calendarName: cal.summary,
                            isHoliday: eventIsHoliday
                        };
                    });
                    allEvents.push(...taggedEvents);

                    if (isHolidayCal) {
                        console.log(`[Google Calendar] Holiday events:`, taggedEvents.map(e => `${e.summary} (${e.start?.date || e.start?.dateTime})`));
                    }
                }
            } catch (err: any) {
                console.warn(`Could not fetch events for calendar ${cal.id}:`, err.message);
            }
        }

        // 3. Sort all merged events by start time
        allEvents.sort((a, b) => {
            const startA = a.start?.dateTime || a.start?.date || '';
            const startB = b.start?.dateTime || b.start?.date || '';
            return new Date(startA).getTime() - new Date(startB).getTime();
        });

        const holidayCount = allEvents.filter(e => e.isHoliday).length;
        console.log(`[Google Calendar] Returning ${allEvents.length} total events (${holidayCount} holidays)`);

        return allEvents;
    } catch (error) {
        console.error('Error listing calendar events:', error);
        return [];
    }
};
export const deleteCalendarEvent = async (userId: string, eventId: string) => {
    try {
        const calendar = await getCalendarClient(userId);
        await calendar.events.delete({
            calendarId: 'primary',
            eventId: eventId,
        });
        return true;
    } catch (error: any) {
        // If event is already deleted (404), consider it a success
        if (error.code === 404 || error.message?.includes('404')) {
            console.log(`Event ${eventId} already deleted or not found - treating as success`);
            return true;
        }
        console.error('Error deleting calendar event:', error.message);
        return false;
    }
};

export const respondCalendarEvent = async (userId: string, eventId: string, response: 'accepted' | 'declined' | 'tentative') => {
    try {
        const calendar = await getCalendarClient(userId);

        // Get the event first to find the user's attendee entry
        const event = await calendar.events.get({
            calendarId: 'primary',
            eventId: eventId,
        });

        const user: any = await USERS.findById(userId);
        const userEmail = user?.email;

        if (!event.data.attendees) {
            event.data.attendees = [];
        }

        const attendeeIndex = event.data.attendees.findIndex(a => a.email === userEmail);
        if (attendeeIndex > -1) {
            event.data.attendees[attendeeIndex].responseStatus = response;
        } else {
            event.data.attendees.push({
                email: userEmail,
                responseStatus: response,
                self: true
            });
        }

        await calendar.events.patch({
            calendarId: 'primary',
            eventId: eventId,
            requestBody: {
                attendees: event.data.attendees
            },
            sendUpdates: 'all'
        });

        return true;
    } catch (error: any) {
        console.error('Error responding to calendar event:', error.message);
        return false;
    }
};

// Sync all ExTalk meetings to Google Calendar
export const syncAllMeetingsToGoogle = async (userId: string) => {
    try {
        const Group = (await import('../db/schemas/group.schema')).default;

        // Get all meetings for this user
        const meetings = await Group.find({
            currentUsers: userId,
            isTemp: true, // Only meetings
            meetingStartTime: { $ne: null }
        });

        console.log(`Syncing ${meetings.length} ExTalk meetings to Google Calendar for user ${userId}`);

        let syncedCount = 0;
        for (const meeting of meetings) {
            // Skip if already synced to Google
            if (meeting.googleEventId) {
                console.log(`Meeting ${meeting._id} already synced (Google Event ID: ${meeting.googleEventId})`);
                continue;
            }

            const eventDetails = {
                summary: `📅 ${meeting.groupName}`,
                description: meeting.groupDescription || 'ExTalk Meeting',
                startTime: meeting.meetingStartTime,
                endTime: meeting.meetingEndTime,
                timeZone: meeting.createdByTimeZone || 'UTC'
            };

            const googleEvent = await createCalendarEvent(userId, eventDetails);

            if (googleEvent && googleEvent.id) {
                // Store the Google Event ID in the meeting
                await Group.findByIdAndUpdate(meeting._id, {
                    googleEventId: googleEvent.id
                });
                syncedCount++;
                console.log(`Synced meeting ${meeting._id} to Google Calendar (Event ID: ${googleEvent.id})`);
            }
        }

        console.log(`Successfully synced ${syncedCount} meetings to Google Calendar`);
        return { success: true, syncedCount };
    } catch (error: any) {
        console.error('Error syncing meetings to Google Calendar:', error.message);
        return { success: false, error: error.message };
    }
};

// Remove all ExTalk meetings from Google Calendar
export const removeAllMeetingsFromGoogle = async (userId: string) => {
    try {
        const Group = (await import('../db/schemas/group.schema')).default;

        // Get all meetings for this user that have been synced to Google
        const meetings = await Group.find({
            currentUsers: userId,
            isTemp: true,
            googleEventId: { $ne: null }
        });

        console.log(`Removing ${meetings.length} ExTalk meetings from Google Calendar for user ${userId}`);

        let removedCount = 0;
        for (const meeting of meetings) {
            if (meeting.googleEventId) {
                const deleted = await deleteCalendarEvent(userId, meeting.googleEventId);

                if (deleted) {
                    // Clear the Google Event ID from the meeting
                    await Group.findByIdAndUpdate(meeting._id, {
                        googleEventId: null
                    });
                    removedCount++;
                    console.log(`Removed meeting ${meeting._id} from Google Calendar (Event ID: ${meeting.googleEventId})`);
                }
            }
        }

        console.log(`Successfully removed ${removedCount} meetings from Google Calendar`);
        return { success: true, removedCount };
    } catch (error: any) {
        console.error('Error removing meetings from Google Calendar:', error.message);
        return { success: false, error: error.message };
    }
};
