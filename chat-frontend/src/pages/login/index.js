import React, { useEffect, useState } from "react";
import axios from "axios";
import { PROXY } from "../../../config";
import { useAppContext } from "../../../appContext/appContext";
import { useRouter } from "next/router";
import Link from "next/link";
import { toast } from "react-toastify";
import { FaRegEyeSlash, FaRegEye } from "react-icons/fa";

const Login = () => {
  const router = useRouter();
  const { globalUser, setGlobalUser, loading } = useAppContext();
  const [formData, setFormData] = useState({
    id: "",
    password: "",
    webPushToken: "",
  });
  const [loginLoading, setLoginLoading] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [isLoginSubmitted, setIsLoginSubmitted] = useState(false);

  useEffect(() => {
    const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;

    // Check if we're in a secure context (HTTPS or localhost)
    const isSecureContext = window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost';

    if (!isSecureContext) {
      console.warn('[Push] Web Push requires HTTPS. Current protocol:', window.location.protocol);
      return;
    }

    if (!PUBLIC_VAPID_KEY) {
      console.warn('[Push] NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY is not set. Push notifications disabled.');
      return;
    }

    if ("serviceWorker" in navigator && "PushManager" in window) {
      console.log('[Push] Registering service worker...');

      navigator.serviceWorker
        .register("/sw.js")
        .then(async (registration) => {
          console.log('[Push] Service worker registered');

          // Always unsubscribe from old subscription to ensure we use current VAPID key
          const existingSub = await registration.pushManager.getSubscription();
          if (existingSub) {
            console.log('[Push] Unsubscribing from old subscription to refresh with current VAPID key');
            await existingSub.unsubscribe();
          }

          // Create new subscription with current VAPID key
          const convertedVapidKey = urlBase64ToUint8Array(PUBLIC_VAPID_KEY);
          console.log('[Push] Creating new subscription with VAPID key');
          return await registration?.pushManager?.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey,
          });
        })
        .then((sub) => {
          if (sub) {
            console.log('[Push] Subscription created successfully');
            setFormData({ ...formData, webPushToken: JSON.stringify(sub) });
            setSubscription(sub);
          } else {
            console.warn('[Push] No subscription returned');
          }
        })
        .catch((error) => {
          console.error("[Push] Error during push subscription:", error);
          if (error.name === 'NotAllowedError') {
            console.warn('[Push] User denied notification permission');
          } else if (error.name === 'NotSupportedError') {
            console.warn('[Push] Push notifications not supported in this browser');
          }
        });
    } else {
      console.warn('[Push] ServiceWorker or PushManager not supported');
    }
  }, []);
  function urlBase64ToUint8Array(base64String) {
    if (typeof base64String !== "string") {
      throw new Error("Invalid base64 string input");
    }

    try {
      const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      const rawData = atob(base64);
      return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)));
    } catch (err) {
      console.error("Failed to convert base64 to Uint8Array:", err.message);
      return new Uint8Array(); // or throw again if you want to crash
    }
  }

  useEffect(() => {
    if (window != undefined) {
      document.title = "Login";
    }
    // Only auto-redirect if user is already logged in AND this is not a fresh login submission
    if (!loading && globalUser != null && !isLoginSubmitted) {
      // Check for redirect in URL query params (from middleware) first
      const urlRedirect = router.query.redirect;
      // Then check localStorage (from client-side deep link handling)
      const savedRedirect = localStorage.getItem('redirectAfterLogin');

      const redirectUrl = urlRedirect || savedRedirect;

      if (redirectUrl) {
        console.log('[Login] Auto-redirect found URL:', redirectUrl);
        // Clear localStorage to prevent reuse
        if (savedRedirect) {
          localStorage.removeItem('redirectAfterLogin');
        }
        window.location.href = redirectUrl;
      } else {
        window.location.href = "/messages";
      }
    }
  }, [globalUser, loading, router.query, isLoginSubmitted]);
  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoginSubmitted(true); // Mark that we're handling a manual login submission
    setLoginLoading(true);
    try {
      const response = await axios.post(`/api/users/sign-in`, formData);
      if (response.data.success) {
        localStorage.setItem("user", JSON.stringify(response.data));

        // Update global user state
        setGlobalUser(response.data);

        // Set cookie for middleware (use 'access-token' not 'access_token')
        const token = response.data.data.token;
        if (token) {
          document.cookie = `access-token=${token}; path=/; max-age=86400; SameSite=Lax`;
        }

        // Check for redirect URL from router query (middleware) or localStorage (client-side)
        const urlRedirect = router.query.redirect;
        const savedRedirect = localStorage.getItem('redirectAfterLogin');
        const redirectUrl = urlRedirect || savedRedirect;

        console.log('[Login] Found stored redirect URL:', redirectUrl);

        if (redirectUrl) {
          // Clear localStorage to prevent reuse
          if (savedRedirect) {
            localStorage.removeItem('redirectAfterLogin');
          }
          console.log('[Login] Redirecting to saved URL...');
          window.location.href = redirectUrl;
        } else {
          console.log('[Login] No saved URL, going to /messages');
          window.location.href = "/messages";
        }
      } else {
        setIsLoginSubmitted(false); // Reset flag on login failure
        setLoginLoading(false);
        toast.error(response.data.error);
      }
      // You can handle success or redirection here
    } catch (error) {
      console.error("Login failed:", error);
      setIsLoginSubmitted(false); // Reset flag on error
      setLoginLoading(false);
      // You can handle errors here
    }
  };
  const [isShow, setIsShow] = useState(true);

  const togglePasswordVisibility = () => {
    setIsShow((prevState) => !prevState);
  };
  return (
    <div style={{ backgroundColor: "#ffffff", minHeight: "100vh" }}>
      <div className="opening_sec">
        <div className="container">
          <div className="row">
            <div className="col-md-10 offset-md-1">
              <div
                className="opening_inner"
                style={{
                  backgroundColor: "#f2f2f2",
                }}
              >
                <div className="row align-items-center justify-content-center">
                  <div className="col-md-6">
                    <div className="login_fomr">
                      <img src="extalk.png" />
                      <h2 style={{ color: "#f37e20" }}>Welcome</h2>
                      <p className="text-dark">Sign in to Continue</p>
                      <form className="mt-3" onSubmit={handleSubmit}>
                        <div className="mb-4">
                          <input
                            type="text"
                            id="id"
                            name="id"
                            value={formData.id}
                            onChange={handleInputChange}
                            placeholder="Email Address"
                          />
                        </div>
                        <div className="mb-2" style={{ position: "relative" }}>
                          <input
                            type={isShow ? "password" : "text"}
                            id="password"
                            name="password"
                            value={formData.password}
                            onChange={handleInputChange}
                            placeholder="Password"
                          />
                          <button
                            type="button"
                            onClick={togglePasswordVisibility}
                            style={{
                              position: "absolute",
                              right: "5px",
                              top: "50%",
                              transform: "translateY(-50%)",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                              width: "40px",
                              color: "#858596",
                              marginTop: "0px",
                              height: "40px",
                            }}
                          >
                            {isShow ? <FaRegEyeSlash /> : <FaRegEye />}{" "}
                            {/* Use emojis for simplicity */}
                          </button>
                        </div>

                        <Link
                          className="forget_password_link"
                          href="/forgot-password"
                          style={{ color: "#858596" }}
                        >
                          Forgot Password?
                        </Link>
                        <button className="mt-3" type="submit">
                          {loginLoading ? "Logging In..." : "Login"}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="d-flex justify-content-center gap-3 mt-3 privacy_terms">
            <div className="">
              <a href="/privacy-policy" style={{ color: "#858596" }}>Privacy Policy</a>
            </div>
            <div className="">
              <a href="/terms-and-condition" style={{ color: "#858596" }}>Terms And Condition </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
