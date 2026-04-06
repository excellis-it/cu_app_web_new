import "@/styles/globals.css";
import "bootstrap/dist/css/bootstrap.min.css";
import { AppProvider } from "../../appContext/appContext";
import { ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import { useEffect } from "react";
import useUserActivity from "../../components/userActivity";

export default function App({ Component, pageProps }) {

  useUserActivity()

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
          message.includes('failed')
        ) {
          // Only suppress if it's not from our app's socket connections
          // Our app uses ports like 10018, 10016, etc., not random ports like 63873
         const isAppSocket = message.includes('10018') ||
            message.includes('10016') ||
            message.includes('10017') ||
            message.includes('13.63.9.45') ||
            message.includes('localhost') ||
            message.includes('extalkapi.excellisit.net') ||
            message.includes('api.cu-app.us') ||
            message.includes('cu-app.us');

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
          !errorMsg.includes('13.63.9.45') &&
          !errorMsg.includes('extalkapi.excellisit.net') ||
          !errorMsg.includes('api.cu-app.us') ||
          !errorMsg.includes('cu-app.us')||message.includes('localhost')
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
