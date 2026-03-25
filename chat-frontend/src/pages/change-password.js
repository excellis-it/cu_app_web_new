import React, { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { useRouter } from "next/router";
import { useAppContext } from "../../appContext/appContext";
import { toast } from "react-toastify";
const forgetPassword = () => {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const router= useRouter()
  const {  forgotPassSlug, forgotPassEmail } = useAppContext();
  useEffect(() => {
    !forgotPassSlug && router.push('/forgot-password')
  }, [forgotPassSlug])
  
  const changePassword = async (e) =>{
    e.preventDefault()
    if(forgotPassSlug){
      if(password.length<4 || confirmPassword.length<4 ) toast.error('Password must be at least 6 characters')
      if(password!= confirmPassword) toast.error('passwords doesnt match')
      else {
    const resp = await axios.post ('/api/users/reset-password', {
      email:forgotPassEmail, slug:forgotPassSlug, password:password, confirmPassword:confirmPassword
    })
  resp.data.success? toast.success('Password changed')   
  : toast.error('Something went wrong')
  resp.data.success && router.push('/login')
      }
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
                style={{
                  backgroundImage: `url("bg.png")`,
                  backgroundPosition: "left",
                }}
              >
                <div className="row align-items-center">
                  <div className="col-md-6">
                    <div className="left_man_img_sec">
                      <img src="man1.png" />
                      <img src="man2.png" />
                      <img src="man3.png" />
                      <img src="man4.png" />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="login_fomr">
                      <img src="cu-logo-2.svg" />
                      <h2>Reset Your Password</h2>
                      <form className="mt-3" onSubmit={changePassword}>
                        <div>
                          <input
                            type="password"
                            id="password"
                            name="password"
                            placeholder="Password"
                            onChange={(e)=>setPassword(e.target.value)}
                          />
                        </div>
                        <div>
                          <input
                            type="password"
                            id="password"
                            name="password"
                            placeholder="Confirm Password"
                            onChange={(e)=>setConfirmPassword(e.target.value)}
                          />
                        </div>

                        <button className="mt-3" type="submit">
                          Change Password
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
