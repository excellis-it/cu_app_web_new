import React, { useState,useEffect } from "react";
import Link from "next/link";
import axios from "axios";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import { useAppContext } from "../../../appContext/appContext";
const forgetPassword = () => {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [email, setEmail] = useState('')

  const router= useRouter()
  const {  setforgotPassEmail } = useAppContext();

  useEffect(()=>{
    if(window != undefined){
      document.title = "Forgot password"
    }
  },[])

  const sendOtp = async (e) => {
    e.preventDefault()
    setforgotPassEmail(email)
    const resp = await axios.post('/api/users/forgot-password', {email:email})
    if(resp.data.success){ 
      toast.success('Otp sent successfully')
      setTimeout(() => {
        router.push('verify-otp')
      }, 1500);
  }
  }
  
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
                  backgroundPosition: "left",
                }}
              >
                <div className="row align-items-center justify-content-center">
                  
                  <div className="col-md-6">
                    <div className="login_fomr">
                      <img src="cu-logo-2.svg" />
                      <h2 style={{ color: "#f37e20" }}>Enter your registered Email</h2>
                      <form className="mt-3" onSubmit={sendOtp}>
                        <div className="relative">
                          <input
                            type="text"
                            id="id"
                            name="id"
                            placeholder="Email Address"
                            onChange={(e)=>setEmail(e.target.value)}
                          />
                         
                        </div>
                       

                        <button className="mt-3" type="submit" >
                            <span>Send One Time Password</span>
                        </button>
                        <Link style={{ color: "#f37e20" }} className="back_to_login_link" href="/login">Back to Login</Link>

                        <small className="mt-3" style={{color: "#858596", lineHeight: "14px", display: "block", fontSize: "11px"}}>
                          One time password will be sent to your email address.please check your spam folder also or you can contact the adminastrator.</small>
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
