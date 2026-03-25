import "@/styles/globals.css";
import "bootstrap/dist/css/bootstrap.min.css";
import { AppProvider } from "../../appContext/appContext";
import { ToastContainer } from "react-toastify";
import axios from "axios";
import { useRouter } from "next/router";
import 'react-toastify/dist/ReactToastify.css';
import { useEffect } from "react";
import useUserActivity from "../../components/userActivity";

export default function App({ Component, pageProps }) {

  const router = useRouter();

  useUserActivity()

  // Global Axios Interceptor for Unauthorized (handles both 401 status and 200 OK with error body)
  useEffect(() => {
    const handleUnauthorized = () => {
      // Avoid redirect loop if already on login page
      if (router.pathname !== "/login") {
        console.warn("[App] Unauthorized access detected. Logging out...");

        // Clear storage
        localStorage.removeItem("user");

        // Clear cookie (use 'access-token' not 'access_token')
        document.cookie = "access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";

        // Redirect with full reload to clear all state
        window.location.href = "/login?session_expired=true";

        // Return a pending promise to halt execution
        return new Promise(() => { });
      }
    };

    const interceptor = axios.interceptors.response.use(
      (response) => {
        // Check for 200 OK responses that are actually unauthorized errors
        // Matches structure: { success: false, message: "Unauthorized", error: { status: 401 } }
        if (
          response.data &&
          response.data.success === false &&
          (response.data.message === "Unauthorized" || response.data.error?.status === 401)
        ) {
          return handleUnauthorized() || Promise.reject(new Error("Unauthorized"));
        }
        return response;
      },
      (error) => {
        // Check for actual 401 HTTP status responses
        if (error.response && error.response.status === 401) {
          return handleUnauthorized() || Promise.reject(error);
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [router]);
  // Listen for messages from the Service Worker

  // Suppress non-critical WebSocket connection errors from browser extensions/dev tools
  useEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;

    // Filter out WebSocket connection errors from browser extensions/dev tools
    const filterWebSocketErrors = (args) => {
      if (args && args.length > 0) {
        const message = String(args[0] || '');
        // Check if it's a WebSocket connection refused error from a non-app source
        if (
          message.includes('WebSocket connection to') &&
          message.includes('failed') &&
          (message.includes('ERR_CONNECTION_REFUSED') || message.includes('connection establishment'))
        ) {
          // Only suppress if it's not from our app's socket connections
          // Our app uses ports like 10018, 10016, etc., not random ports like 63873
          const isAppSocket = message.includes('10018') ||
            message.includes('10016') ||
            message.includes('10017') ||
            message.includes('69.62.84.25') ||
            message.includes('extalkapi.excellisit.net');

          if (!isAppSocket) {
            return true; // Suppress this error
          }
        }
      }
      return false; // Don't suppress
    };

    console.error = (...args) => {
      if (!filterWebSocketErrors(args)) {
        originalError.apply(console, args);
      }
    };

    console.warn = (...args) => {
      if (!filterWebSocketErrors(args)) {
        originalWarn.apply(console, args);
      }
    };

    // Also catch unhandled WebSocket errors
    const handleWebSocketError = (event) => {
      if (event.error && event.error.message) {
        const errorMsg = event.error.message;
        if (
          errorMsg.includes('WebSocket') &&
          errorMsg.includes('ERR_CONNECTION_REFUSED') &&
          !errorMsg.includes('10018') &&
          !errorMsg.includes('10016') &&
          !errorMsg.includes('10017') &&
          !errorMsg.includes('69.62.84.25') &&
          !errorMsg.includes('extalkapi.excellisit.net')
        ) {
          event.preventDefault(); // Suppress the error
          return;
        }
      }
    };

    window.addEventListener('error', handleWebSocketError, true);

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
      window.removeEventListener('error', handleWebSocketError, true);
    };
  }, []);

  return (
    <>
      <AppProvider>
        <ToastContainer />

        <Component {...pageProps} />
      </AppProvider>
    </>
  );
}
