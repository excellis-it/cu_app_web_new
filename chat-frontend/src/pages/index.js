import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
const Home = () => {
  const router = useRouter()
  useEffect(() => {
    if (window != undefined) {
      document.title = "Home"
    }
    const token = localStorage.getItem("access-token");
    router.push("/messages");
  }, [])
  return (
    <div>
      <div className="opening_sec">
        <div className="container">
          <div className="row">
            <div className="col-md-10 offset-md-1">
              <div
                className="opening_inner"
                style={{ backgroundImage: `url("bg.png")` }}
              >
                <div className="row align-items-center justify-content-center">
                  <div className="col-md-6">
                    <div className="opening_content">
                      <h4>Join the Conversation:Connect and Collaborate</h4>
                      <p>
                        Say goodbye to scattered conversations! Connect with
                        your team,share files,and stay organized all in one
                        place.
                      </p>
                      <Link href="/login">Get Started</Link>
                    </div>
                  </div>
                </div>

              </div>
            </div>
            <div className="d-flex justify-content-center gap-3 mt-3 privacy_terms">
              <div className="">
                <a href="/privacy-policy">Privacy Policy</a>
              </div>
              <div className="">
                <a href="/terms-and-condition">Terms And Condition </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
