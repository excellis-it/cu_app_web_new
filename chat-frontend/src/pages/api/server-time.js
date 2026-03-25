// API endpoint to provide server time for client synchronization
// This helps prevent countdown inaccuracies from incorrect device clocks

export default function handler(req, res) {
    if (req.method === 'GET') {
        // Return current server timestamp
        const serverTime = Date.now();

        res.status(200).json({
            success: true,
            serverTime: serverTime,
            iso: new Date(serverTime).toISOString()
        });
    } else {
        res.status(405).json({ success: false, message: 'Method not allowed' });
    }
}
