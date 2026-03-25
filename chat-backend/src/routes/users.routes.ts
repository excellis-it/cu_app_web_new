import { Router } from "express";
import { serialize } from 'cookie';
import serverResponse from "../helpers/serverResponse";
import { signUp } from "../controller/user/signUp";
import signIn from "../controller/user/signIn";
import authMiddleware from "../middleware/authMiddleware";
import updateUser from "../controller/user/updateUser";
import updatUserDetails, { changePassword } from "../controller/user/updateDetails";
import forgotPassword, { resetPassword, verifyForgetPasswordOtp } from "../controller/user/forgetPassword";
import { getAllUsers, getuserLogout, getuserLogoutWeb } from "../controller/user/getUser";
import multer from "multer";
const usersRouter = Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

usersRouter.post("/sign-up", async (req, res) => {
    try {
        serverResponse(true, "User created successfully", await signUp(req.body), res);
    } catch (error: any) {
        serverResponse(false, "Error creating user", error.message, res);
    }
});

usersRouter.post("/sign-in", async (req, res) => {
    try {

        // Call your signIn function
        const result = await signIn(req.body);
        const { user, token } = result;

        // Determine if the environment is production
        const isProduction = process.env.NODE_ENV === 'production';

        // Set the token as an HTTP-only cookie
        res.setHeader('Set-Cookie', serialize('access_token', token, {
            httpOnly: false, // Prevents JavaScript access
            secure: isProduction, // Set to true in production, false in development
            maxAge: 60 * 60 * 24, // Cookie expiration time (1 day)
            path: '/', // Accessible for the entire domain
        }));

        serverResponse(true, "User signed in successfully", result, res);
    } catch (error: any) {
        serverResponse(false, "Error signing in", error.message, res);
    }
});

usersRouter.post("/logout", async (req: any, res: any) => {
    // Clear the access token cookie
    res.setHeader('Set-Cookie', serialize('access_token', '', {
        httpOnly: true,
        secure: false,
        maxAge: -1, // Expire immediately
        path: '/'
    }));
    let data = await getuserLogout(req?.body?.user_id)

    // Send a response indicating logout success
    res.status(200).json({ success: true, message: 'Logged out successfully', data });
});


usersRouter.post("/logout/web", async (req: any, res: any) => {
    // Clear the access token cookie
    res.setHeader('Set-Cookie', serialize('access_token', '', {
        httpOnly: true,
        secure: false,
        maxAge: -1, // Expire immediately
        path: '/'
    }));
    let data = await getuserLogoutWeb(req?.body?.user_id)

    // Send a response indicating logout success
    res.status(200).json({ success: true, message: 'Logged out successfully', data });
});

usersRouter.get("/get-all-users", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "User fetched successfully", await getAllUsers(req.query.searchQuery, req.query.limit, req.query.offset), res);
    } catch (error: any) {
        serverResponse(false, "Error fetching user", error.message, res);
    }
})
usersRouter.get("/get-user", authMiddleware, async (req: any, res: any) => {
    try {
        if (req.user._id) {
            serverResponse(true, "User fetched successfully", { user: req.user }, res);
        }
        else serverResponse(false, 'Invalid User', 'Invalid User', res);
    } catch (error: any) {
        serverResponse(false, "Error fetching user", error.message, res);
    }
})


usersRouter.post("/update-user", authMiddleware, upload.single('file'), async (req: any, res: any) => {
    try {
        serverResponse(true, "User created successfully", await updateUser(req.user, req.body, req.file), res);
    } catch (error: any) {
        serverResponse(false, "Error creating user", error.message, res);
    }
});
usersRouter.post("/update-user-details", authMiddleware, upload.single('file'), async (req: any, res: any) => {
    try {
        serverResponse(true, "User Updated successfully", await updatUserDetails(req.user, req.body, req.file), res);
    } catch (error: any) {
        serverResponse(false, "Error Updateding Data for User", error.message, res);
    }
});
usersRouter.post("/change-password", authMiddleware, async (req: any, res: any) => {
    try {
        serverResponse(true, "User Password Changed  successfully", await changePassword(req.body, req.user._id), res);
    } catch (error: any) {
        serverResponse(false, "Error Updateding Password Updateding Data for User", error.message, res);
    }
});
usersRouter.post("/forgot-password", async (req, res) => {
    try {
        serverResponse(true, "Email found successfully", await forgotPassword(req.body.email), res);
    } catch (error: any) {
        serverResponse(false, "No User Found", error.message, res);
    }
});
usersRouter.post("/verify-email-otp", async (req, res) => {
    try {

        serverResponse(true, "Otp Verified successfully", await verifyForgetPasswordOtp(req.body), res);
    } catch (error: any) {
        serverResponse(false, "No User Found", error.message, res);
    }
});
usersRouter.post("/reset-password", async (req, res) => {
    try {

        serverResponse(true, "Password changed successfully", await resetPassword(req.body), res);
    } catch (error: any) {
        serverResponse(false, "Something Went Wrong", error.message, res);
    }
});



export default usersRouter;