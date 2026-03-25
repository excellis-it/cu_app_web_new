import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import videoCall from "./db/schemas/videocall.schema";
import usersRouter from './routes/users.routes';
import groupRouter from './routes/group.routes';
import adminRouter from './routes/admin';

export const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(cookieParser());

// Routes
import authRoutes from './routes/auth';
app.use('/api/auth', authRoutes);
// Alias to support /api/users/* routes (e.g., /api/users/sign-in) in the test app
app.use('/api/users', usersRouter);
// Mount groups routes for tests under /api/v1/groups
app.use('/api/groups', groupRouter);

app.use('/api/admin', adminRouter);

// Server time endpoint
app.get('/api/server-time', (req, res) => {
  res.json({
    success: true,
    serverTime: new Date().toISOString()
  });
});



/**
 * Clean up orphaned calls on server start
 * This ensures any active calls with no participants are properly ended
 */
export async function cleanupOrphanedCalls() {
  try {
    // Mark all calls with no active "joined" participants as ended
    const orphanedCalls = await videoCall.find({
      status: "active",
      $nor: [
        { userActivity: { $elemMatch: { status: "joined" } } }
      ]
    });

    if (orphanedCalls.length > 0) {
      // Mark all orphaned calls as ended
      await videoCall.updateMany(
        { _id: { $in: orphanedCalls.map(call => call._id) } },
        { $set: { status: "ended", endedAt: new Date() } }
      );
    } else {
    }

    // Also ensure any calls that have ended over 24 hours ago are properly marked
    const longEndedTime = new Date();
    longEndedTime.setHours(longEndedTime.getHours() - 24);

    // Fix any users who are still shown as "joined" in ended calls
    await videoCall.updateMany(
      { status: "ended" },
      {
        $set: {
          "userActivity.$[elem].status": "left",
          "userActivity.$[elem].leftAt": new Date()
        }
      },
      {
        arrayFilters: [{ "elem.status": "joined" }]
      }
    );

    // Fix any users who are still shown as "joined" in very old active calls (likely orphaned)
    const oldTime = new Date();
    oldTime.setHours(oldTime.getHours() - 1); // Calls older than 12 hours

    await videoCall.updateMany(
      {
        status: "active",
        startedAt: { $lt: oldTime }
      },
      {
        $set: {
          status: "ended",
          endedAt: new Date()
        }
      }
    );
  } catch (error) {
    console.error("Error cleaning up orphaned calls:", error);
  }
}

// Call this function from your main index.ts file after the database connection is established
