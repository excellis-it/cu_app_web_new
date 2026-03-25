import React, { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { useRouter } from "next/router";
import { useAppContext } from "../../appContext/appContext";
import { toast } from "react-toastify";
const forgetPassword = () => {
  const [otp, setOtp] = useState("")
  const router = useRouter()
  const { forgotPassEmail, setforgotPassSlug } = useAppContext();
  console.log(forgotPassEmail)
  useEffect(() => {
    !forgotPassEmail && router.push('/forgot-password')
  }, [forgotPassEmail])

  const verifyOtp = async (e) => {
    e.preventDefault()
    const resp = await axios.post('/api/users/verify-email-otp', { email: forgotPassEmail, otp: otp })
    console.log(resp)
    if (resp.data.success) {
      setforgotPassSlug(resp.data.data.slug)
      toast.success('OTP verified')
      setTimeout(() => {
        router.push('change-password')
      }, 1500);
    }
  }

  return (
    <div>
      <div className="opening_sec">
        <div className="container">
          <div className="row">
            <div className="col-md-10 offset-md-1">
              <div
                className="opening_inner"
              >
                <div className="row align-items-center">
                  <div className="col-md-6">
                    <div className="login_fomr">
                      <img src="extalk.png" />
                      <h2>Verify otp</h2>
                      <form className="mt-3" onSubmit={verifyOtp}>

                        <div className="">
                          <input
                            type="text"
                            id="password"
                            name="password"
                            placeholder="Enter OTP"
                            onChange={(e) => setOtp(e.target.value)}
                          />

                        </div>
                        <button className="mt-3" type="submit">
                          Verify OTP
                        </button>
                        <Link className="back_to_login_link" href="/login">Back to Login</Link>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default forgetPassword;
