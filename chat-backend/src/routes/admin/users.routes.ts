import { Router } from "express";
import serverResponse from "../../helpers/serverResponse";
import signIn from "../../controller/admin/user/signIn";
import authMiddleware from "../../middleware/authMiddleware";
import updateUser from "../../controller/admin/user/updateUser";
import updatUserDetails, {
  changePassword,
} from "../../controller/admin/user/updateDetails";
import forgotPassword, {
  resetPassword,
  verifyForgetPasswordOtp,
} from "../../controller/admin/user/forgetPassword";
import { getAUserById, getAllUsers, getAUserByMail, AllUsers } from "../../controller/admin/user/getUser";
import multer from "multer";
import adminMiddleware from "../../middleware/adminMiddleware";
import { createUser, deleteUser } from "../../controller/admin/user/signUp";

const adminUsersRouter = Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
adminUsersRouter.post("/sign-in", async (req, res) => {
  try {
    const tokenData = await signIn(req.body)

    res.cookie("access_token", tokenData?.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production" ? true : false,
      maxAge: 24 * 60 * 60 * 1000,

    });

    serverResponse(
      true,
      "User signed in successfully",
      tokenData,
      res
    );
  } catch (error: any) {
    serverResponse(false, "Error signing in", error.message, res);
  }
});

adminUsersRouter.post("/logout", (req, res) => {
  try {

    res.clearCookie("access_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    serverResponse(true, "User logged out successfully", null, res);
  } catch (error: any) {
    serverResponse(false, "Error logging out", error.message, res);
  }
});



adminUsersRouter.post(
  "/get-all-users",
  authMiddleware,
  async (req: any, res: any) => {
    try {
      const result = await getAllUsers(req.body, req);
      serverResponse(
        true,
        "User fetched successfully",
        result,
        res
      );
    } catch (error: any) {
      serverResponse(false, "Error fetching user", error.message, res);
    }
  }
);

adminUsersRouter.post(
  "/all-users",
  authMiddleware,
  async (req: any, res: any) => {
    try {
      const result = await AllUsers(req.body, req);
      serverResponse(
        true,
        "User fetched successfully",
        result,
        res
      );
    } catch (error: any) {
      serverResponse(false, "Error fetching user", error.message, res);
    }
  }
);
adminUsersRouter.get(
  "/get-single-user",
  authMiddleware,
  async (req: any, res: any) => {
    try {
      serverResponse(
        true,
        "User fetched successfully",
        await getAUserById(req.query.id),
        res
      );
    } catch (error: any) {
      serverResponse(false, "Error fetching user", error.message, res);
    }
  }
);
adminUsersRouter.get(
  "/get-user",
  authMiddleware,
  async (req: any, res: any) => {
    try {
      if (req.user._id) {
        serverResponse(
          true,
          "User fetched successfully",
          { user: req.user },
          res
        );
      } else serverResponse(false, "Invalid User", "Invalid User", res);
    } catch (error: any) {
      serverResponse(false, "Error fetching user", error.message, res);
    }
  }
);

adminUsersRouter.get(
  "/get-user-by-mail",
  async (req: any, res: any) => {
    try {
      serverResponse(
        true,
        "User fetched successfully",
        await getAUserByMail(req.query.email),
        res
      );
    } catch (error: any) {
      serverResponse(false, "Error fetching user", error.message, res);
    }
  }
);

adminUsersRouter.post(
  "/update-user",
  authMiddleware,
  upload.single("file"),
  async (req: any, res: any) => {
    try {
      serverResponse(
        true,
        "User created successfully",
        await updateUser(req.user, req.body, req.file),
        res
      );
    } catch (error: any) {
      serverResponse(false, "Error creating user", error.message, res);
    }
  }
);
adminUsersRouter.post(
  "/update-user-details",
  authMiddleware,
  upload.single("file"),
  async (req: any, res: any) => {
    try {
      serverResponse(
        true,
        "User Updated successfully",
        await updatUserDetails(req.body, req.file),
        res
      );
    } catch (error: any) {
      serverResponse(
        false,
        "Error Updateding Data for User",
        error.message,
        res
      );
    }
  }
);
adminUsersRouter.post(
  "/reset-password",
  authMiddleware,
  async (req: any, res: any) => {
    try {
      serverResponse(
        true,
        "User Password Changed successfully",
        await changePassword(req.body, req.user._id),
        res
      );
    } catch (error: any) {
      serverResponse(
        false,
        "Error Updateding Password Updateding Data for User",
        error.message,
        res
      );
    }
  }
);
adminUsersRouter.post("/forgot-password", async (req, res) => {
  try {
    serverResponse(
      true,
      "Email found successfully",
      await forgotPassword(req.body.email),
      res
    );
  } catch (error: any) {
    serverResponse(false, "No User Found", error.message, res);
  }
});
adminUsersRouter.post("/verify-email-otp", async (req, res) => {
  try {
    serverResponse(
      true,
      "Otp Verified successfully",
      await verifyForgetPasswordOtp(req.body),
      res
    );
  } catch (error: any) {
    serverResponse(false, "No User Found", error.message, res);
  }
});
adminUsersRouter.post("/update-password", async (req, res) => {
  try {
    serverResponse(
      true,
      "Password changed successfully",
      await resetPassword(req.body),
      res
    );
  } catch (error: any) {
    serverResponse(false, "Something Went Wrong", error.message, res);
  }
});

// Admin User Actions

adminUsersRouter.post(
  "/create-user",
  adminMiddleware,
  async (req: any, res: any) => {
    try {
      serverResponse(
        true,
        "User created successfully",
        await createUser(req.body, req),
        res
      );
    } catch (error: any) {
      serverResponse(false, "Error creating user", error, res);
    }
  }
);

adminUsersRouter.delete(
  "/delete-user",
  adminMiddleware,
  async (req: any, res: any) => {
    try {
      serverResponse(
        true,
        "User deleted successfully",
        await deleteUser(req.query, req.user),
        res
      );
    } catch (error: any) {
      serverResponse(false, "Error deleting user", error, res);
    }
  }
);

export default adminUsersRouter;
