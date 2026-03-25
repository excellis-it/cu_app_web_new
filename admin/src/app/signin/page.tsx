"use client"
import AuthWrapperTwo from '@/app/shared/auth-layout/auth-wrapper-two';
import SignInForm from './sign-in-form';
import { useEffect } from 'react';

export default function SignIn() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.title = 'Sign In';
    }
  }, []);
  return (
    <AuthWrapperTwo title="Sign In" isSignIn isSocialLoginActive={false}>
      <SignInForm />
    </AuthWrapperTwo>
  );
}
